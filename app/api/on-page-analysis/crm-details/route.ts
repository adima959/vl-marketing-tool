import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { CRM_DIMENSION_MAP } from '@/lib/server/onPageCrmQueries';
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
 * Format date for MariaDB BETWEEN queries using UTC methods.
 * Input dates are parsed from YYYY-MM-DD strings (UTC midnight).
 */
function formatDateForMariaDB(dateStr: string, endOfDay: boolean): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${dateStr} ${time}`;
}

/**
 * Build CRM WHERE clauses from on-page dimension filters.
 * Maps on-page dimension IDs to CRM fields using CRM_DIMENSION_MAP.
 */
function buildCrmFilters(
  dimensionFilters: Record<string, string>
): { conditions: string[]; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const mapping = CRM_DIMENSION_MAP[dimId];
    if (!mapping) continue;

    if (value === 'Unknown') {
      if (mapping.isSource) {
        conditions.push('sr.source IS NULL');
      } else {
        conditions.push(`${mapping.filterField} IS NULL`);
      }
      continue;
    }

    if (mapping.isSource) {
      const variants = SOURCE_VARIANTS[value.toLowerCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        conditions.push(`LOWER(sr.source) IN (${placeholders})`);
        params.push(...variants);
      } else {
        conditions.push('LOWER(sr.source) = ?');
        params.push(value.toLowerCase());
      }
    } else if (dimId === 'date') {
      conditions.push('DATE(s.date_create) = ?');
      params.push(value);
    } else {
      conditions.push(`${mapping.filterField} = ?`);
      params.push(value);
    }
  }

  return { conditions, params };
}

/**
 * Build the detail query for CRM subscriptions matching on-page filters.
 */
function buildDetailQuery(
  metricId: 'crmTrials' | 'crmApproved',
  dateRange: { start: string; end: string },
  dimensionFilters: Record<string, string>,
  pagination: { page: number; pageSize: number }
): { query: string; params: any[]; countQuery: string; countParams: any[] } {
  const startDate = formatDateForMariaDB(dateRange.start, false);
  const endDate = formatDateForMariaDB(dateRange.end, true);
  const { conditions: filterConditions, params: filterParams } = buildCrmFilters(dimensionFilters);

  const approvedJoin = metricId === 'crmApproved'
    ? 'INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0'
    : 'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1';

  const baseConditions = [
    's.date_create BETWEEN ? AND ?',
    's.deleted = 0',
    "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",
    's.tracking_id_4 IS NOT NULL',
    "s.tracking_id_4 != 'null'",
    's.tracking_id_2 IS NOT NULL',
    "s.tracking_id_2 != 'null'",
    's.tracking_id IS NOT NULL',
    "s.tracking_id != 'null'",
    ...filterConditions,
  ];

  const whereClause = baseConditions.join(' AND ');
  const baseParams = [startDate, endDate, ...filterParams];

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
 * Queries MariaDB directly using on-page dimension filters (tracking IDs).
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

    const { query, params, countQuery, countParams } = buildDetailQuery(
      body.metricId,
      body.dateRange,
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
