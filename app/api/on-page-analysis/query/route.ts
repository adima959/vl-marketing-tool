import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { onPageQueryBuilder } from '@/lib/server/onPageQueryBuilder';
import { getOnPageCRMData, getOnPageCRMByTrackingIds, getOnPageCRMByVisitorIds, CRM_DIMENSION_MAP } from '@/lib/server/onPageCrmQueries';
import type { QueryRequest } from '@/lib/types/api';
import { parseQueryRequest } from '@/lib/types/api';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { buildTrackingCrmMatch, buildVisitorCrmMatch } from '@/lib/server/onPageTransforms';
import { toTitleCase } from '@/lib/formatters';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const CRM_METRIC_IDS = new Set(['crmConvRate', 'crmTrials', 'crmApproved', 'crmApprovalRate']);

/** Classification dims have no CRM equivalent — skip tracking match entirely */
const SKIP_TRACKING_MATCH_DIMS = new Set(['classifiedProduct', 'classifiedCountry']);

/** Maps dimension IDs to their corresponding tracking field for combo key exclusion */
const TRACKING_FIELD_FOR_DIMENSION: Record<string, 'source' | 'campaign_id' | 'adset_id' | 'ad_id' | null> = {
  utmSource: 'source',
  campaign: 'campaign_id',
  adset: 'adset_id',
  ad: 'ad_id',
  webmasterId: 'ad_id',
};

interface OnPageAggregatedRow {
  dimension_id?: string;
  dimension_value: string | Date;
  page_views: number;
  unique_visitors: number;
  bounce_rate: number;
  avg_active_time: number;
  scroll_past_hero: number;
  scroll_rate: number;
  form_views: number;
  form_view_rate: number;
  form_starters: number;
  form_start_rate: number;
}

interface TrackingMatchRow {
  dimension_value: string | null;
  source: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  unique_visitors: number;
}

interface VisitorMatchRow {
  dimension_value: string | null;
  ff_visitor_id: string;
}

/**
 * POST /api/on-page-analysis/query
 * API endpoint for querying on-page analytics data
 * Requires admin authentication
 */
async function handleOnPageQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body: QueryRequest = await request.json();

    // Validate required fields
    if (!body.dateRange?.start || !body.dateRange?.end) {
      const error = createValidationError('dateRange is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
      const error = createValidationError('dimensions array is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    if (typeof body.depth !== 'number' || body.depth < 0) {
      const error = createValidationError('depth must be a non-negative number');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    // Parse and build SQL query
    const queryParams = parseQueryRequest(body);
    const { query, params } = onPageQueryBuilder.buildQuery(queryParams);

    // Determine if current dimension is directly CRM-matchable
    const currentDimension = body.dimensions[body.depth];
    const crmMapping = CRM_DIMENSION_MAP[currentDimension];

    // Build CRM parent filters from matchable parent dimensions
    const parentCrmFilters: { dimensionId: string; value: string }[] = [];
    let hasNonMatchableParent = false;
    if (body.parentFilters) {
      for (const [dimId, value] of Object.entries(body.parentFilters)) {
        if (CRM_DIMENSION_MAP[dimId]) {
          parentCrmFilters.push({ dimensionId: dimId, value });
        } else {
          hasNonMatchableParent = true;
        }
      }
    }

    // Use tracking+visitor match when:
    // 1. Current dimension is not CRM-matchable, OR
    // 2. A parent filter is non-CRM-matchable (e.g. deviceType=phone) — direct CRM
    //    can't filter by those, so children would exceed parent
    // Skip for classification dims (no CRM equivalent — CRM columns will show 0)
    const isNonMatchable = (!crmMapping || hasNonMatchableParent) && !SKIP_TRACKING_MATCH_DIMS.has(currentDimension);
    const trackingMatchQuery = isNonMatchable
      ? onPageQueryBuilder.buildTrackingMatchQuery(queryParams)
      : null;
    const visitorMatchQuery = isNonMatchable
      ? onPageQueryBuilder.buildVisitorMatchQuery(queryParams)
      : null;

    // Run all queries in parallel:
    // 1. Main PG metrics (always)
    // 2. Direct CRM match (matchable dims only)
    // 3. CRM tracking combos (non-matchable dims only)
    // 4. PG tracking match (non-matchable dims only)
    // 5. CRM visitor IDs for ff_vid matching (non-matchable dims only)
    // 6. PG visitor match — (dimension_value, ff_visitor_id) pairs (non-matchable dims only)
    // Use direct CRM match only when dimension is matchable AND no non-matchable parent filters
    const useDirectCrm = crmMapping && !hasNonMatchableParent;

    const [rows, directCrmRows, crmTrackingRows, pgTrackingRows, crmVisitorRows, pgVisitorRows] = await Promise.all([
      executeQuery<OnPageAggregatedRow>(query, params),
      useDirectCrm
        ? getOnPageCRMData({
            dateRange: { start: body.dateRange.start, end: body.dateRange.end },
            groupByExpression: crmMapping.groupBy,
            parentCrmFilters,
          })
        : Promise.resolve(null),
      isNonMatchable
        ? getOnPageCRMByTrackingIds({
            dateRange: { start: body.dateRange.start, end: body.dateRange.end },
            parentCrmFilters,
          })
        : Promise.resolve(null),
      trackingMatchQuery
        ? executeQuery<TrackingMatchRow>(trackingMatchQuery.query, trackingMatchQuery.params)
        : Promise.resolve(null),
      isNonMatchable
        ? getOnPageCRMByVisitorIds({
            dateRange: { start: body.dateRange.start, end: body.dateRange.end },
            parentCrmFilters,
          })
        : Promise.resolve(null),
      visitorMatchQuery
        ? executeQuery<VisitorMatchRow>(visitorMatchQuery.query, visitorMatchQuery.params)
        : Promise.resolve(null),
    ]);

    // Build CRM lookup: direct index for matchable dims, tracking match for others
    // Normalize NULL, string 'null' (n8n artifact), and nullValue (e.g. '' for campaign) to 'unknown'
    const crmNullValue = crmMapping?.nullValue;
    const directCrmIndex = directCrmRows
      ? (() => {
          const index = new Map<string, { dimension_value: string; trials: number; approved: number }>();
          for (const r of directCrmRows) {
            const raw = r.dimension_value != null ? String(r.dimension_value).toLowerCase() : null;
            const key = (raw === null || raw === 'null' || (crmNullValue !== undefined && raw === crmNullValue))
              ? 'unknown'
              : raw;
            // Accumulate when multiple CRM groups map to 'unknown' (NULL + '' + 'null')
            const existing = index.get(key);
            if (existing) {
              existing.trials = existing.trials + Number(r.trials);
              existing.approved = existing.approved + Number(r.approved);
            } else {
              index.set(key, { dimension_value: String(r.dimension_value), trials: Number(r.trials), approved: Number(r.approved) });
            }
          }
          return index;
        })()
      : null;
    // Determine fields to exclude from tracking combo:
    // 1. Exclude current dimension's field (if it's a tracking dimension)
    // 2. Exclude fields from parent dimensions (to handle drilldown from webmasterId='Unknown' → urlPath)
    const fieldsToExclude = new Set<string>();
    const currentExclude = TRACKING_FIELD_FOR_DIMENSION[currentDimension];
    if (currentExclude) fieldsToExclude.add(currentExclude);

    // Also exclude tracking fields from parent filters (e.g., when drilling from webmasterId='Unknown')
    if (body.parentFilters) {
      for (const dimId of Object.keys(body.parentFilters)) {
        const exclude = TRACKING_FIELD_FOR_DIMENSION[dimId];
        if (exclude) fieldsToExclude.add(exclude);
      }
    }

    const trackingCrm = (crmTrackingRows && pgTrackingRows)
      ? buildTrackingCrmMatch(crmTrackingRows, pgTrackingRows, Array.from(fieldsToExclude))
      : null;

    // Build ff_vid matching map: dimension_value → {trials, approved}
    const visitorCrm = (crmVisitorRows && pgVisitorRows)
      ? buildVisitorCrmMatch(crmVisitorRows, pgVisitorRows)
      : null;

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters (maintains dimension order)
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    // Transform database rows to frontend format with CRM data merged
    const data = rows.map((row) => {
      // For date dimension, PG returns a Date object — format as YYYY-MM-DD
      // PG date values arrive as midnight UTC; use UTC methods to avoid timezone shift
      const dimValue = currentDimension === 'date' && row.dimension_value instanceof Date
        ? `${row.dimension_value.getUTCFullYear()}-${String(row.dimension_value.getUTCMonth() + 1).padStart(2, '0')}-${String(row.dimension_value.getUTCDate()).padStart(2, '0')}`
        : row.dimension_value;

      const keyValue = row.dimension_id != null
        ? String(row.dimension_id)
        : (dimValue != null ? String(dimValue) : 'Unknown');

      const displayValue = dimValue != null
        ? toTitleCase(String(dimValue))
        : 'Unknown';

      // Match CRM data: direct match for matchable dims, tracking match for others
      // Normalize NULL to 'unknown' for consistent matching
      const crmKey = row.dimension_id != null
        ? String(row.dimension_id)
        : (dimValue != null ? String(dimValue).toLowerCase() : 'unknown');

      let trials: number | null = null;
      let approved: number | null = null;

      if (directCrmIndex) {
        // Direct CRM match (utmSource, campaign, adset, ad, date, countryCode)
        // PG stores 'adwords' but CRM normalizes to 'google'
        const lookupKey = currentDimension === 'utmSource' && crmKey === 'adwords' ? 'google' : crmKey;
        const match = lookupKey ? directCrmIndex.get(lookupKey) : undefined;
        trials = match ? Number(match.trials) || 0 : 0;
        approved = match ? Number(match.approved) || 0 : 0;
      } else {
        // Non-matchable dimension: try ff_vid match (exact), fall back to tracking combo (proportional)
        let matched = false;

        if (visitorCrm) {
          const visitorMatch = crmKey ? visitorCrm.get(crmKey) : undefined;
          if (visitorMatch && visitorMatch.trials > 0) {
            trials = Math.round(visitorMatch.trials);
            approved = Math.round(visitorMatch.approved);
            matched = true;
          }
        }

        if (!matched && trackingCrm) {
          const trackingMatch = crmKey ? trackingCrm.get(crmKey) : undefined;
          trials = trackingMatch ? Math.round(trackingMatch.trials) : 0;
          approved = trackingMatch ? Math.round(trackingMatch.approved) : 0;
        }
      }

      const pageViews = Number(row.page_views) || 0;
      const uniqueVisitors = Number(row.unique_visitors) || 0;

      return {
        key: `${keyPrefix}${keyValue}`,
        attribute: displayValue,
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          pageViews,
          uniqueVisitors,
          bounceRate: Number(row.bounce_rate) || 0,
          avgActiveTime: Number(row.avg_active_time) || 0,
          scrollPastHero: Number(row.scroll_past_hero) || 0,
          scrollRate: Number(row.scroll_rate) || 0,
          formViews: Number(row.form_views) || 0,
          formViewRate: Number(row.form_view_rate) || 0,
          formStarters: Number(row.form_starters) || 0,
          formStartRate: Number(row.form_start_rate) || 0,
          crmConvRate: trials != null && uniqueVisitors > 0
            ? Math.round((trials / uniqueVisitors) * 10000) / 10000
            : 0,
          crmTrials: trials ?? 0,
          crmApproved: approved ?? 0,
          crmApprovalRate: trials != null && trials > 0
            ? Math.round((approved! / trials) * 10000) / 10000
            : 0,
        },
      };
    });

    // Filter out rows with 1 or fewer page views (noise reduction)
    const filteredData = data.filter((row) => row.metrics.pageViews > 1);

    // Sort by CRM metric if requested (CRM data is merged in-memory, not in SQL)
    const sortBy = body.sortBy;
    if (sortBy && CRM_METRIC_IDS.has(sortBy)) {
      const dir = body.sortDirection === 'ASC' ? 1 : -1;
      filteredData.sort((a, b) => {
        const aVal = (a.metrics as Record<string, number | null>)[sortBy] ?? 0;
        const bVal = (b.metrics as Record<string, number | null>)[sortBy] ?? 0;
        return (aVal - bVal) * dir;
      });
    }

    return NextResponse.json({
      success: true,
      data: filteredData,
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    const { message, statusCode } = maskErrorForClient(error, 'On-Page Analysis API');

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: statusCode }
    );
  }
}

// Export with admin authentication
export const POST = withAuth(handleOnPageQuery);
