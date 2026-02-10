import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { onPageQueryBuilder } from '@/lib/server/onPageQueryBuilder';
import { getOnPageCRMData, getOnPageCRMByTrackingIds, CRM_DIMENSION_MAP } from '@/lib/server/onPageCrmQueries';
import type { OnPageCRMTrackingRow } from '@/lib/server/onPageCrmQueries';
import type { QueryRequest } from '@/lib/types/api';
import { parseQueryRequest } from '@/lib/types/api';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { toTitleCase } from '@/lib/formatters';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

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
  dimension_value: string;
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

/**
 * Builds a tracking combo key, optionally excluding a specific field.
 * Used to match CRM and PG data on shared tracking IDs while avoiding
 * circular dependencies when grouping by a dimension that IS a tracking field.
 */
function buildTrackingKey(
  source: string,
  campaign_id: string,
  adset_id: string,
  ad_id: string,
  excludeFields: string[] = []
): string {
  // Normalize 'null' strings to empty strings (CRM stores literal 'null')
  const normalize = (val: string) => val === 'null' || val === null ? '' : val;

  const parts = [];
  if (!excludeFields.includes('source')) parts.push(normalize(source));
  if (!excludeFields.includes('campaign_id')) parts.push(normalize(campaign_id));
  if (!excludeFields.includes('adset_id')) parts.push(normalize(adset_id));
  if (!excludeFields.includes('ad_id')) parts.push(normalize(ad_id));
  return parts.join('::');
}

/**
 * Joins CRM tracking data with PG page view tracking data to attribute
 * CRM conversions to any page view dimension via shared tracking IDs.
 * Distributes trials/approved proportionally by visitor count when a
 * tracking combo spans multiple dimension values.
 *
 * Excludes specified tracking fields from the combo key to avoid circular
 * matching when grouping by those dimensions or when they're parent filters.
 */
function buildTrackingCrmMatch(
  crmTrackingRows: OnPageCRMTrackingRow[],
  pgTrackingRows: TrackingMatchRow[],
  excludeFields: string[]
): Map<string, { trials: number; approved: number }> {

  // Index CRM data by tracking combo key (excluding specified fields)
  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmTrackingRows) {
    const key = buildTrackingKey(row.source, row.campaign_id, row.adset_id, row.ad_id, excludeFields);
    const existing = crmIndex.get(key) || { trials: 0, approved: 0 };
    existing.trials += Number(row.trials);
    existing.approved += Number(row.approved);
    crmIndex.set(key, existing);
  }

  // Sum visitors per tracking combo across all dimension values
  const comboTotals = new Map<string, number>();
  for (const row of pgTrackingRows) {
    const key = buildTrackingKey(row.source, row.campaign_id, row.adset_id, row.ad_id, excludeFields);
    comboTotals.set(key, (comboTotals.get(key) || 0) + Number(row.unique_visitors));
  }

  // Distribute CRM data proportionally per dimension value
  const result = new Map<string, { trials: number; approved: number }>();
  for (const row of pgTrackingRows) {
    const comboKey = buildTrackingKey(row.source, row.campaign_id, row.adset_id, row.ad_id, excludeFields);
    const crmData = crmIndex.get(comboKey);
    if (!crmData) continue;

    const totalVisitors = comboTotals.get(comboKey) || 1;
    const proportion = Number(row.unique_visitors) / totalVisitors;

    const dimKey = row.dimension_value != null
      ? String(row.dimension_value).toLowerCase()
      : 'unknown';
    const existing = result.get(dimKey) || { trials: 0, approved: 0 };
    existing.trials += crmData.trials * proportion;
    existing.approved += crmData.approved * proportion;
    result.set(dimKey, existing);
  }

  return result;
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
    if (body.parentFilters) {
      for (const [dimId, value] of Object.entries(body.parentFilters)) {
        if (CRM_DIMENSION_MAP[dimId]) {
          parentCrmFilters.push({ dimensionId: dimId, value });
        }
      }
    }

    // Build tracking match query for non-matchable dimensions
    // Skip for classification dims (no CRM equivalent — CRM columns will show 0)
    const trackingMatchQuery = !crmMapping && !SKIP_TRACKING_MATCH_DIMS.has(currentDimension)
      ? onPageQueryBuilder.buildTrackingMatchQuery(queryParams)
      : null;

    // Run all queries in parallel:
    // 1. Main PG metrics (always)
    // 2. Direct CRM match (matchable dims only)
    // 3. CRM tracking combos (non-matchable dims only)
    // 4. PG tracking match (non-matchable dims only)
    const [rows, directCrmRows, crmTrackingRows, pgTrackingRows] = await Promise.all([
      executeQuery<OnPageAggregatedRow>(query, params),
      crmMapping
        ? getOnPageCRMData({
            dateRange: { start: body.dateRange.start, end: body.dateRange.end },
            groupByExpression: crmMapping.groupBy,
            parentCrmFilters,
          })
        : Promise.resolve(null),
      !crmMapping
        ? getOnPageCRMByTrackingIds({
            dateRange: { start: body.dateRange.start, end: body.dateRange.end },
            parentCrmFilters,
          })
        : Promise.resolve(null),
      trackingMatchQuery
        ? executeQuery<TrackingMatchRow>(trackingMatchQuery.query, trackingMatchQuery.params)
        : Promise.resolve(null),
    ]);

    // Build CRM lookup: direct index for matchable dims, tracking match for others
    // Normalize NULL to 'unknown' for consistent matching
    const directCrmIndex = directCrmRows
      ? new Map(directCrmRows.map((r) => {
          const key = r.dimension_value != null
            ? String(r.dimension_value).toLowerCase()
            : 'unknown';
          return [key, r];
        }))
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
      const keyValue = row.dimension_id != null
        ? String(row.dimension_id)
        : (row.dimension_value != null ? String(row.dimension_value) : 'Unknown');

      const displayValue = row.dimension_value != null
        ? toTitleCase(String(row.dimension_value))
        : 'Unknown';

      // Match CRM data: direct match for matchable dims, tracking match for others
      // Normalize NULL to 'unknown' for consistent matching
      const crmKey = row.dimension_id != null
        ? String(row.dimension_id)
        : (row.dimension_value != null ? String(row.dimension_value).toLowerCase() : 'unknown');

      let trials: number | null = null;
      let approved: number | null = null;

      if (directCrmIndex) {
        // Direct CRM match (utmSource, campaign, adset, ad, date)
        const match = crmKey ? directCrmIndex.get(crmKey) : undefined;
        trials = match ? Number(match.trials) || 0 : 0;
        approved = match ? Number(match.approved) || 0 : 0;
      } else if (trackingCrm) {
        // Tracking ID match (timezone, country, browser, etc.)
        const match = crmKey ? trackingCrm.get(crmKey) : undefined;
        trials = match ? Math.round(match.trials) : 0;
        approved = match ? Math.round(match.approved) : 0;
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
