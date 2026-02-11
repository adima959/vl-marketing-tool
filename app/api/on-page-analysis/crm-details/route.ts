import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { executeQuery } from '@/lib/server/db';
import { CRM_DIMENSION_MAP } from '@/lib/server/onPageCrmQueries';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import type { DetailRecord } from '@/types/dashboardDetails';
import { maskErrorForClient } from '@/lib/types/errors';
import { unstable_rethrow } from 'next/navigation';

/** Maps dimension IDs to PG column names for filtering */
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

/**
 * Normalized source expression for PG queries.
 * Mirrors crm_subscription_enriched.source_normalized.
 */
const PG_NORMALIZED_SOURCE = `
  CASE
    WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google'
    WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook'
    ELSE LOWER(COALESCE(utm_source, ''))
  END`;

/** Max ff_visitor_ids to send in MariaDB IN clause */
const MAX_VISITOR_IDS = 20000;

interface TrackingCombo {
  source: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
}

/**
 * PG: Get normalized tracking combos from page views matching dimension filters.
 */
async function getTrackingCombos(
  dateRange: { start: string; end: string },
  dimensionFilters: Record<string, string>
): Promise<TrackingCombo[]> {
  const params: (string | number)[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];
  const conditions: string[] = ['created_at BETWEEN $1 AND $2'];

  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const pgCol = PG_DIMENSION_MAP[dimId];
    if (!pgCol) continue;
    params.push(value);
    conditions.push(`${pgCol}::text = $${params.length}`);
  }

  const query = `
    SELECT DISTINCT
      ${PG_NORMALIZED_SOURCE} as source,
      COALESCE(utm_campaign, '') as campaign_id,
      COALESCE(utm_content, '') as adset_id,
      COALESCE(utm_medium, '') as ad_id
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE ${conditions.join(' AND ')}
      AND utm_source IS NOT NULL
  `;

  return executeQuery<TrackingCombo>(query, params);
}

/**
 * PG: Get distinct ff_visitor_ids from page views matching dimension filters.
 * Limited to MAX_VISITOR_IDS for practical IN-clause sizes.
 */
async function getVisitorIds(
  dateRange: { start: string; end: string },
  dimensionFilters: Record<string, string>
): Promise<string[]> {
  const params: (string | number)[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];
  const conditions: string[] = [
    'created_at BETWEEN $1 AND $2',
    'ff_visitor_id IS NOT NULL',
  ];

  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const pgCol = PG_DIMENSION_MAP[dimId];
    if (!pgCol) continue;
    params.push(value);
    conditions.push(`${pgCol}::text = $${params.length}`);
  }

  const query = `
    SELECT DISTINCT ff_visitor_id
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE ${conditions.join(' AND ')}
    LIMIT ${String(MAX_VISITOR_IDS)}
  `;

  const rows = await executeQuery<{ ff_visitor_id: string }>(query, params);
  return rows.map(r => r.ff_visitor_id);
}

/**
 * MariaDB: Find subscription IDs from crm_subscription_enriched matching
 * ff_visitor_ids (exact) or tracking combos (approximate).
 * Applies CRM-matchable parent filters using pre-normalized columns.
 */
async function findMatchingSubscriptions(
  dateRange: { start: string; end: string },
  metricId: 'crmTrials' | 'crmApproved',
  trackingCombos: TrackingCombo[],
  visitorIds: string[],
  dimensionFilters: Record<string, string>
): Promise<number[]> {
  const conditions: string[] = ['date_create BETWEEN ? AND ?'];
  const params: (string | number)[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];

  if (metricId === 'crmApproved') {
    conditions.push('is_approved = 1');
  }

  // Apply CRM-matchable parent filters using enriched table columns
  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const mapping = CRM_DIMENSION_MAP[dimId];
    if (!mapping) continue;

    if (value === 'Unknown' && mapping.nullValue !== undefined) {
      conditions.push(`${mapping.filterField} = ?`);
      params.push(mapping.nullValue);
    } else {
      const normalized = mapping.normalizeValue
        ? mapping.normalizeValue(value)
        : value;
      conditions.push(`${mapping.filterField} = ?`);
      params.push(normalized);
    }
  }

  // Build matching: ff_vid OR tracking combos
  const matchParts: string[] = [];

  if (visitorIds.length > 0) {
    matchParts.push(`ff_vid IN (${visitorIds.map(() => '?').join(', ')})`);
    params.push(...visitorIds);
  }

  if (trackingCombos.length > 0) {
    const comboConds: string[] = [];
    for (const combo of trackingCombos) {
      const parts: string[] = [];
      if (combo.source) {
        parts.push('source_normalized = ?');
        params.push(combo.source);
      }
      if (combo.campaign_id) {
        parts.push('tracking_id_4 = ?');
        params.push(combo.campaign_id);
      }
      if (combo.adset_id) {
        parts.push('tracking_id_2 = ?');
        params.push(combo.adset_id);
      }
      if (combo.ad_id) {
        parts.push('tracking_id = ?');
        params.push(combo.ad_id);
      }
      if (parts.length > 0) {
        comboConds.push(`(${parts.join(' AND ')})`);
      }
    }
    if (comboConds.length > 0) {
      matchParts.push(`(${comboConds.join(' OR ')})`);
    }
  }

  if (matchParts.length === 0) {
    return [];
  }

  conditions.push(`(${matchParts.join(' OR ')})`);

  const query = `
    SELECT subscription_id
    FROM crm_subscription_enriched
    WHERE ${conditions.join(' AND ')}
  `;

  const rows = await executeMariaDBQuery<{ subscription_id: number }>(query, params);
  return rows.map(r => r.subscription_id);
}

/**
 * POST /api/on-page-analysis/crm-details
 *
 * Fetch individual CRM detail records for a clicked CRM metric in On-Page Analysis.
 * Three-step process:
 * 1. Query PG page views for tracking combos + visitor IDs (parallel)
 * 2. Find matching subscription IDs from enriched table (ff_vid + tracking combo)
 * 3. Fetch full detail records for matched subscription IDs
 */
async function handleOnPageCrmDetails(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
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

    // Step 1: PG — get tracking combos + visitor IDs in parallel
    const [trackingCombos, visitorIds] = await Promise.all([
      getTrackingCombos(body.dateRange, dimensionFilters),
      getVisitorIds(body.dateRange, dimensionFilters),
    ]);

    // Step 2: MariaDB — find matching subscription IDs from enriched table
    const subscriptionIds = await findMatchingSubscriptions(
      body.dateRange,
      body.metricId,
      trackingCombos,
      visitorIds,
      dimensionFilters
    );

    if (subscriptionIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { records: [], total: 0, page: pagination.page, pageSize: pagination.pageSize },
      });
    }

    // Step 3: MariaDB — fetch full detail records for matched subscription IDs
    const offset = (pagination.page - 1) * pagination.pageSize;
    const idPlaceholders = subscriptionIds.map(() => '?').join(', ');

    const approvedJoin = body.metricId === 'crmApproved'
      ? 'INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0'
      : 'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0';

    const detailQuery = `
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
      WHERE s.id IN (${idPlaceholders})
      ORDER BY s.date_create DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      ${approvedJoin}
      WHERE s.id IN (${idPlaceholders})
    `;

    const [records, countResult] = await Promise.all([
      executeMariaDBQuery<DetailRecord>(detailQuery, [...subscriptionIds, pagination.pageSize, offset]),
      executeMariaDBQuery<{ total: number }>(countQuery, [...subscriptionIds]),
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
    unstable_rethrow(error);
    const { message, statusCode } = maskErrorForClient(error, 'On-Page CRM Details API');

    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}

export const POST = withAuth(handleOnPageCrmDetails);
