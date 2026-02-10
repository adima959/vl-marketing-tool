import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { executeQuery } from '@/lib/server/db';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import type { DetailRecord } from '@/types/dashboardDetails';
import { maskErrorForClient } from '@/lib/types/errors';

/**
 * Source normalization: expands on-page utm_source values to CRM source variants.
 */
const SOURCE_VARIANTS: Record<string, string[]> = {
  google: ['google', 'adwords'],
  facebook: ['facebook', 'meta'],
};

/**
 * Maps on-page dimension IDs to PostgreSQL column names in event_page_view_enriched_v2.
 */
const PG_DIMENSION_MAP: Record<string, string> = {
  urlPath: 'url_path',
  pageType: 'page_type',
  utmSource: 'LOWER(utm_source)',
  campaign: 'utm_campaign',
  adset: 'adset_id',
  ad: 'ad_id',
  webmasterId: 'utm_medium',
  utmTerm: 'utm_term',
  keyword: 'keyword',
  placement: 'placement',
  referrer: 'referrer',
  deviceType: 'device_type',
  osName: 'os_name',
  browserName: 'browser_name',
  countryCode: 'country_code',
  timezone: 'timezone',
  visitNumber: 'visit_number',
  localHour: 'local_hour_of_day',
  date: 'created_at::date',
};

interface TrackingIdCombo {
  utm_source: string | null;
  utm_campaign: string | null;
  adset_id: string | null;
  ad_id: string | null;
}

/**
 * Query PostgreSQL page views to extract unique tracking ID combinations
 * matching ALL dimension filters (including non-CRM dimensions like urlPath).
 *
 * Tracking ID mapping (page views → CRM):
 * - utm_source → sr.source
 * - utm_campaign → s.tracking_id_4 (campaign)
 * - utm_content → s.tracking_id_2 (adset)
 * - utm_medium → s.tracking_id (ad)
 */
async function getTrackingIdCombinations(
  dateRange: { start: string; end: string },
  dimensionFilters: Record<string, string>
): Promise<TrackingIdCombo[]> {
  const conditions: string[] = [
    'created_at BETWEEN $1 AND $2',
  ];
  const params: any[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];

  // Build WHERE conditions for all dimension filters
  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const pgColumn = PG_DIMENSION_MAP[dimId];
    if (!pgColumn) continue; // Skip unknown dimensions

    params.push(value);
    conditions.push(`${pgColumn}::text = $${params.length}`);
  }

  const query = `
    SELECT DISTINCT
      LOWER(utm_source) as utm_source,
      COALESCE(utm_campaign, '') as utm_campaign,
      COALESCE(utm_content, '') as adset_id,
      COALESCE(utm_medium, '') as ad_id
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE ${conditions.join(' AND ')}
      AND utm_source IS NOT NULL
  `;

  return executeQuery<TrackingIdCombo>(query, params);
}

/**
 * Format date for MariaDB BETWEEN queries using UTC methods.
 * Input dates are parsed from YYYY-MM-DD strings (UTC midnight).
 */
function formatDateForMariaDB(dateStr: string, endOfDay: boolean): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${dateStr} ${time}`;
}

/**
 * Maps country codes to possible CRM country values.
 * CRM database may contain uppercase codes, lowercase codes, or full country names.
 */
const COUNTRY_CODE_VARIANTS: Record<string, string[]> = {
  DK: ['DK', 'dk', 'Denmark', 'denmark', 'DNK', 'dnk'],
  SE: ['SE', 'se', 'Sweden', 'sweden', 'SWE', 'swe'],
  NO: ['NO', 'no', 'Norway', 'norway', 'NOR', 'nor'],
  FI: ['FI', 'fi', 'Finland', 'finland', 'FIN', 'fin'],
};

/**
 * Maps on-page dimension IDs to CRM fields that can be filtered directly.
 */
const CRM_DIRECT_FILTER_MAP: Record<string, string> = {
  countryCode: 'c.country',
  utmSource: 'sr.source',
  webmasterId: 's.tracking_id',
};

/**
 * Build tracking ID filter conditions for MariaDB query.
 * Matches subscriptions that have ANY of the tracking ID combinations.
 */
function buildTrackingIdFilters(
  trackingCombos: TrackingIdCombo[]
): { conditions: string[]; params: (string | number)[] } {
  if (trackingCombos.length === 0) {
    // No matching page views with tracking IDs - don't add tracking filter
    return { conditions: [], params: [] };
  }

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Build OR condition for each tracking ID combination
  const orConditions: string[] = [];
  for (const combo of trackingCombos) {
    const subConditions: string[] = [];

    // Match source (with variants)
    if (combo.utm_source) {
      const variants = SOURCE_VARIANTS[combo.utm_source.toLowerCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        subConditions.push(`LOWER(sr.source) IN (${placeholders})`);
        params.push(...variants);
      } else {
        subConditions.push('LOWER(sr.source) = ?');
        params.push(combo.utm_source.toLowerCase());
      }
    }

    // Match campaign, adset, ad (only if non-empty)
    if (combo.utm_campaign) {
      subConditions.push('s.tracking_id_4 = ?');
      params.push(combo.utm_campaign);
    }
    if (combo.adset_id) {
      subConditions.push('s.tracking_id_2 = ?');
      params.push(combo.adset_id);
    }
    if (combo.ad_id) {
      subConditions.push('s.tracking_id = ?');
      params.push(combo.ad_id);
    }

    if (subConditions.length > 0) {
      orConditions.push(`(${subConditions.join(' AND ')})`);
    }
  }

  if (orConditions.length > 0) {
    conditions.push(`(${orConditions.join(' OR ')})`);
  }

  return { conditions, params };
}

/**
 * Build direct CRM dimension filter conditions for dimensions that have CRM equivalents.
 * Used in addition to tracking ID matching for sources without complete tracking data.
 */
function buildDirectCrmFilters(
  dimensionFilters: Record<string, string>
): { conditions: string[]; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const crmField = CRM_DIRECT_FILTER_MAP[dimId];
    if (!crmField) continue;

    // Special handling for country code - match against all possible variants
    if (dimId === 'countryCode') {
      const variants = COUNTRY_CODE_VARIANTS[value.toUpperCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        conditions.push(`${crmField} IN (${placeholders})`);
        params.push(...variants);
      } else {
        // Fallback: if unknown country code, try exact match
        conditions.push(`${crmField} = ?`);
        params.push(value);
      }
    }
    // Special handling for utm source - match against source variants
    else if (dimId === 'utmSource') {
      const variants = SOURCE_VARIANTS[value.toLowerCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        conditions.push(`LOWER(${crmField}) IN (${placeholders})`);
        params.push(...variants);
      } else {
        conditions.push(`LOWER(${crmField}) = ?`);
        params.push(value.toLowerCase());
      }
    }
    else {
      conditions.push(`${crmField} = ?`);
      params.push(value);
    }
  }

  return { conditions, params };
}

/**
 * Build the detail query for CRM subscriptions matching tracking ID combinations
 * and direct CRM dimension filters.
 */
function buildDetailQuery(
  metricId: 'crmTrials' | 'crmApproved',
  dateRange: { start: string; end: string },
  trackingCombos: TrackingIdCombo[],
  dimensionFilters: Record<string, string>,
  pagination: { page: number; pageSize: number }
): { query: string; params: any[]; countQuery: string; countParams: any[] } {
  const startDate = formatDateForMariaDB(dateRange.start, false);
  const endDate = formatDateForMariaDB(dateRange.end, true);

  // Build tracking ID filters (for page view matching)
  const { conditions: trackingConditions, params: trackingParams } = buildTrackingIdFilters(trackingCombos);

  // Build direct CRM dimension filters (for dimensions like country that exist in CRM)
  const { conditions: directConditions, params: directParams } = buildDirectCrmFilters(dimensionFilters);

  const approvedJoin = metricId === 'crmApproved'
    ? 'INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0'
    : 'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1';

  const baseConditions = [
    's.date_create BETWEEN ? AND ?',
    's.deleted = 0',
    "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",
    // Note: Do NOT require tracking IDs to be non-null
    // Sources like Leadbit/Orionmedia may not have campaign/adset/ad tracking
    ...trackingConditions,
    ...directConditions,
  ];

  const whereClause = baseConditions.join(' AND ');
  const baseParams = [startDate, endDate, ...trackingParams, ...directParams];

  const offset = (pagination.page - 1) * pagination.pageSize;

  const query = `
    SELECT
      s.id as id,
      s.id as subscriptionId,
      CONCAT(c.first_name, ' ', c.last_name) as customerName,
      c.email as customerEmail,
      c.id as customerId,
      COALESCE(sr.source, '(not set)') as source,
      s.tracking_id as trackingId1,
      s.tracking_id_2 as trackingId2,
      s.tracking_id_3 as trackingId3,
      s.tracking_id_4 as trackingId4,
      s.tracking_id_5 as trackingId5,
      COALESCE(i.total, s.trial_price, 0) as amount,
      s.date_create as date,
      COALESCE(p.product_name, '(not set)') as productName,
      c.country,
      IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
      s.status as subscriptionStatus,
      cr.caption as cancelReason,
      s.canceled_reason_about as cancelReasonAbout,
      c.date_registered as customerDateRegistered
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    ${approvedJoin}
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
    LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
    WHERE ${whereClause}
    ORDER BY s.date_create DESC
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(DISTINCT s.id) as total
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    ${approvedJoin}
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE ${whereClause}
  `;

  return {
    query,
    params: [...baseParams, pagination.pageSize, offset],
    countQuery,
    countParams: baseParams,
  };
}

/**
 * POST /api/on-page-analysis/crm-details
 *
 * Fetch individual CRM detail records for a clicked CRM metric in On-Page Analysis.
 * Two-step process:
 * 1. Query PostgreSQL page views filtered by ALL dimensions (including urlPath, countryCode)
 * 2. Extract tracking ID combinations and query MariaDB CRM for matching subscriptions
 */
async function handleOnPageCrmDetails(
  request: NextRequest,
  _user: AppUser
) {
  try {
    const body = await request.json();

    if (!body.metricId || !['crmTrials', 'crmApproved'].includes(body.metricId)) {
      return NextResponse.json(
        { success: false, error: "metricId must be 'crmTrials' or 'crmApproved'" },
        { status: 400 }
      );
    }

    if (!body.dateRange?.start || !body.dateRange?.end) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: dateRange' },
        { status: 400 }
      );
    }

    const pagination = body.pagination || { page: 1, pageSize: 100 };
    const dimensionFilters: Record<string, string> = body.dimensionFilters || {};

    // Step 1: Get tracking ID combinations from page views matching ALL dimension filters
    const trackingCombos = await getTrackingIdCombinations(
      body.dateRange,
      dimensionFilters
    );

    // Step 2: Query CRM subscriptions matching those tracking ID combinations
    const { query, params, countQuery, countParams } = buildDetailQuery(
      body.metricId,
      body.dateRange,
      trackingCombos,
      dimensionFilters,
      pagination
    );

    const [records, countResult] = await Promise.all([
      executeMariaDBQuery<DetailRecord>(query, params),
      executeMariaDBQuery<{ total: number }>(countQuery, countParams),
    ]);

    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      success: true,
      data: {
        records,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  } catch (error) {
    const { message, statusCode } = maskErrorForClient(error, 'On-Page CRM Details API');

    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}

export const POST = withAuth(handleOnPageCrmDetails);
