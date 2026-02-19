/**
 * CRM Sales Query Builder
 *
 * Runs 3 parallel queries returning 1 row per sale event:
 * - Q1: Subscriptions (date = s.date_create)
 * - Q2: OTS invoices (type=3, date = i.order_date)
 * - Q3: Upsell invoices (tag parent-sub-id, date = parent sub's date_create)
 *
 * SQL tested in MariaDB GUI — 73ms for a full day.
 */

import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { toTitleCase } from '@/lib/formatters';
import type { SaleRow } from '@/types/sales';

/**
 * Format a Date for MariaDB BETWEEN queries (YYYY-MM-DD HH:MM:SS).
 * Uses UTC methods because date-only strings ("YYYY-MM-DD") from
 * formatLocalDate are parsed as UTC midnight per the Date spec.
 */
function formatDateForMariaDB(date: Date, endOfDay: boolean = false): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${year}-${month}-${day} ${time}`;
}

type SqlParam = string | number;

interface DateRange {
  start: Date;
  end: Date;
}

export interface FetchCRMSalesOptions {
  /** Include status + cancel_reason fields (adds 2 JOINs each to Q1/Q3). Default: false */
  includeCancelInfo?: boolean;
}

// ---------------------------------------------------------------------------
// Q1 — Subscriptions
// ---------------------------------------------------------------------------

function buildSubscriptionQuery(dateRange: DateRange, opts: FetchCRMSalesOptions = {}): { query: string; params: SqlParam[] } {
  const startDate = formatDateForMariaDB(dateRange.start, false);
  const endDate = formatDateForMariaDB(dateRange.end, true);
  const cancelInfo = opts.includeCancelInfo ?? false;

  const query = `
    SELECT
      s.id,
      'subscription'                                    AS type,
      NULL                                              AS parent_subscription_id,
      s.date_create                                     AS date,
      c.id                                              AS customer_id,
      CONCAT(c.first_name, ' ', c.last_name)            AS customer_name,
      (DATE(c.date_registered) = DATE(s.date_create))   AS is_new_customer,
      c.country,
      COALESCE(pg.group_name, pg_sub.group_name)        AS product_group,
      COALESCE(p.product_name, p_sub.product_name)      AS product,
      COALESCE(p.sku, p_sub.sku)                        AS sku,
      COALESCE(sr.source, sr_sub.source)                AS source,
      s.tracking_id,
      s.tracking_id_2,
      s.tracking_id_3,
      s.tracking_id_4,
      s.tracking_id_5,
      i.total,
      (i.id IS NOT NULL)                                AS has_trial,
      COALESCE(i.is_marked = 1, 0)                      AS is_approved,
      (i.on_hold_date IS NOT NULL)                       AS is_on_hold,
      0                                                  AS is_deleted,
      (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub,
      ${cancelInfo ? `CASE s.status
        WHEN 1 THEN 'active'
        WHEN 4 THEN 'cancel_soft'
        WHEN 5 THEN 'cancel_forever'
        ELSE s.status
      END` : 'NULL'}                                    AS status,
      ${cancelInfo ? 'cr.caption' : 'NULL'}             AS cancel_reason
    FROM subscription s
    LEFT JOIN customer c           ON c.id = s.customer_id
    LEFT JOIN invoice i            ON i.id = (
      SELECT MIN(i2.id) FROM invoice i2
      WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
    )
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) AS product_id
      FROM invoice_product GROUP BY invoice_id
    ) fp                           ON fp.invoice_id = i.id
    LEFT JOIN product p            ON p.id = fp.product_id
    LEFT JOIN product_group pg     ON pg.id = p.product_group_id
    LEFT JOIN product p_sub        ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr            ON sr.id = i.source_id
    LEFT JOIN source sr_sub        ON sr_sub.id = s.source_id
    ${cancelInfo ? `LEFT JOIN subscription_cancel_reason scr ON scr.id = (
      SELECT MAX(scr2.id) FROM subscription_cancel_reason scr2
      WHERE scr2.subscription_id = s.id
    )
    LEFT JOIN cancel_reason cr     ON cr.id = scr.cancel_reason_id` : ''}
    WHERE s.date_create BETWEEN ? AND ?
  `;

  return { query, params: [startDate, endDate] };
}

// ---------------------------------------------------------------------------
// Q2 — OTS (type-3 invoices)
// ---------------------------------------------------------------------------

function buildOtsQuery(dateRange: DateRange): { query: string; params: SqlParam[] } {
  const startDate = formatDateForMariaDB(dateRange.start, false);
  const endDate = formatDateForMariaDB(dateRange.end, true);

  const query = `
    SELECT
      i.id,
      'ots'                                             AS type,
      NULL                                              AS parent_subscription_id,
      i.order_date                                      AS date,
      c.id                                              AS customer_id,
      CONCAT(c.first_name, ' ', c.last_name)            AS customer_name,
      NULL                                              AS is_new_customer,
      c.country,
      COALESCE(pg.group_name, pg_sub.group_name)        AS product_group,
      COALESCE(p.product_name, p_sub.product_name)      AS product,
      COALESCE(p.sku, p_sub.sku)                        AS sku,
      COALESCE(sr.source, sr_sub.source)                AS source,
      COALESCE(i.tracking_id, s.tracking_id)            AS tracking_id,
      COALESCE(i.tracking_id_2, s.tracking_id_2)        AS tracking_id_2,
      COALESCE(i.tracking_id_3, s.tracking_id_3)        AS tracking_id_3,
      COALESCE(i.tracking_id_4, s.tracking_id_4)        AS tracking_id_4,
      COALESCE(i.tracking_id_5, s.tracking_id_5)        AS tracking_id_5,
      i.total,
      NULL                                              AS has_trial,
      COALESCE(i.is_marked = 1, 0)                      AS is_approved,
      (i.on_hold_date IS NOT NULL)                       AS is_on_hold,
      0                                                  AS is_deleted,
      0                                                  AS is_upsell_sub,
      NULL                                              AS status,
      NULL                                              AS cancel_reason
    FROM invoice i
    LEFT JOIN subscription s       ON s.id = i.subscription_id
    LEFT JOIN customer c           ON c.id = i.customer_id
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) AS product_id
      FROM invoice_product GROUP BY invoice_id
    ) fp                           ON fp.invoice_id = i.id
    LEFT JOIN product p            ON p.id = fp.product_id
    LEFT JOIN product_group pg     ON pg.id = p.product_group_id
    LEFT JOIN product p_sub        ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr            ON sr.id = i.source_id
    LEFT JOIN source sr_sub        ON sr_sub.id = s.source_id
    WHERE i.type = 3 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND (s.id IS NULL OR s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `;

  return { query, params: [startDate, endDate] };
}

// ---------------------------------------------------------------------------
// Q3 — Upsells (invoices with parent-sub-id tag)
// ---------------------------------------------------------------------------

function buildUpsellQuery(dateRange: DateRange, opts: FetchCRMSalesOptions = {}): { query: string; params: SqlParam[] } {
  const startDate = formatDateForMariaDB(dateRange.start, false);
  const endDate = formatDateForMariaDB(dateRange.end, true);
  const cancelInfo = opts.includeCancelInfo ?? false;

  const query = `
    SELECT
      i.id,
      'upsell'                                          AS type,
      ps.id                                             AS parent_subscription_id,
      ps.date_create                                    AS date,
      c.id                                              AS customer_id,
      CONCAT(c.first_name, ' ', c.last_name)            AS customer_name,
      (DATE(c.date_registered) = DATE(ps.date_create))  AS is_new_customer,
      c.country,
      pg.group_name                                     AS product_group,
      p.product_name                                    AS product,
      p.sku                                             AS sku,
      sr.source                                         AS source,
      ps.tracking_id,
      ps.tracking_id_2,
      ps.tracking_id_3,
      ps.tracking_id_4,
      ps.tracking_id_5,
      i.total,
      NULL                                              AS has_trial,
      COALESCE(i.is_marked = 1, 0)                      AS is_approved,
      (i.on_hold_date IS NOT NULL)                       AS is_on_hold,
      i.deleted                                          AS is_deleted,
      0                                                  AS is_upsell_sub,
      ${cancelInfo ? `CASE ps.status
        WHEN 1 THEN 'active'
        WHEN 4 THEN 'cancel_soft'
        WHEN 5 THEN 'cancel_forever'
        ELSE ps.status
      END` : 'NULL'}                                    AS status,
      ${cancelInfo ? 'cr.caption' : 'NULL'}             AS cancel_reason
    FROM invoice i
    JOIN subscription ps           ON ps.id = CAST(
      SUBSTRING_INDEX(i.tag, 'parent-sub-id=', -1) AS UNSIGNED
    ) AND ps.customer_id = i.customer_id
    LEFT JOIN customer c           ON c.id = i.customer_id
    LEFT JOIN product p            ON p.id = ps.product_id
    LEFT JOIN product_group pg     ON pg.id = p.product_group_id
    LEFT JOIN source sr            ON sr.id = ps.source_id
    ${cancelInfo ? `LEFT JOIN subscription_cancel_reason scr ON scr.id = (
      SELECT MAX(scr2.id) FROM subscription_cancel_reason scr2
      WHERE scr2.subscription_id = ps.id
    )
    LEFT JOIN cancel_reason cr     ON cr.id = scr.cancel_reason_id` : ''}
    WHERE i.tag LIKE '%parent-sub-id=%'
      AND ps.date_create BETWEEN ? AND ?
  `;

  return { query, params: [startDate, endDate] };
}

// ---------------------------------------------------------------------------
// Orchestrator — runs all 3 in parallel
// ---------------------------------------------------------------------------

/** Normalize a dimension string: trim whitespace + title-case, fallback to 'Unknown' */
function normalizeDimension(raw: unknown): string {
  const str = raw != null ? String(raw).trim() : '';
  return str ? toTitleCase(str) : 'Unknown';
}

function normalizeRow(raw: Record<string, unknown>): SaleRow {
  return {
    id: Number(raw.id),
    type: raw.type as SaleRow['type'],
    parent_subscription_id: raw.parent_subscription_id != null ? Number(raw.parent_subscription_id) : null,
    date: raw.date instanceof Date
      ? `${raw.date.getFullYear()}-${String(raw.date.getMonth() + 1).padStart(2, '0')}-${String(raw.date.getDate()).padStart(2, '0')}`
      : String(raw.date ?? ''),
    customer_id: Number(raw.customer_id),
    customer_name: raw.customer_name != null ? String(raw.customer_name).trim() : '',
    is_new_customer: Boolean(Number(raw.is_new_customer)),
    country: normalizeDimension(raw.country),
    product_group: normalizeDimension(raw.product_group),
    product: normalizeDimension(raw.product),
    sku: raw.sku != null ? String(raw.sku).trim() : '',
    source: normalizeDimension(raw.source),
    tracking_id: raw.tracking_id != null ? String(raw.tracking_id).trim() : null,
    tracking_id_2: raw.tracking_id_2 != null ? String(raw.tracking_id_2).trim() : null,
    tracking_id_3: raw.tracking_id_3 != null ? String(raw.tracking_id_3).trim() : null,
    tracking_id_4: raw.tracking_id_4 != null ? String(raw.tracking_id_4).trim() : null,
    tracking_id_5: raw.tracking_id_5 != null ? String(raw.tracking_id_5).trim() : null,
    total: Number(raw.total ?? 0),
    has_trial: Boolean(Number(raw.has_trial)),
    is_approved: Boolean(Number(raw.is_approved)),
    is_on_hold: Boolean(Number(raw.is_on_hold)),
    is_deleted: Boolean(Number(raw.is_deleted)),
    is_upsell_sub: Boolean(Number(raw.is_upsell_sub)),
    status: raw.status != null ? String(raw.status) : null,
    cancel_reason: raw.cancel_reason != null ? String(raw.cancel_reason).trim() : null,
  };
}

export async function fetchCRMSales(dateRange: DateRange, opts: FetchCRMSalesOptions = {}): Promise<SaleRow[]> {
  const sub = buildSubscriptionQuery(dateRange, opts);
  const ots = buildOtsQuery(dateRange);
  const upsell = buildUpsellQuery(dateRange, opts);

  const [subRows, otsRows, upsellRows] = await Promise.all([
    executeMariaDBQuery<Record<string, unknown>>(sub.query, sub.params),
    executeMariaDBQuery<Record<string, unknown>>(ots.query, ots.params),
    executeMariaDBQuery<Record<string, unknown>>(upsell.query, upsell.params),
  ]);

  return [
    ...subRows.map(normalizeRow),
    ...otsRows.map(normalizeRow),
    ...upsellRows.map(normalizeRow),
  ];
}
