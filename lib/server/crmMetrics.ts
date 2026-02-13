/**
 * Shared CRM Metric Definitions — Single Source of Truth
 *
 * Both the dashboard and marketing report import from this module
 * to ensure identical metric calculations. When a formula is fixed
 * here, all consumers get the fix automatically.
 *
 * Key concepts:
 * - Subscription-based metrics use `s.*` (subscription table alias)
 * - Invoice-based metrics use `i.*` (trial invoice, type=1) or `i_ots.*` (OTS invoice, type=3)
 * - Customer metrics use `c.*` (customer table alias)
 * - Upsell metrics use `uo.*` (upsell invoice alias)
 * - Some metrics have leftJoin/innerJoin variants depending on the JOIN type used
 */

// ---------------------------------------------------------------------------
// Metric SELECT expressions
// ---------------------------------------------------------------------------

/**
 * Subscription-based metric SQL expressions.
 *
 * Metrics with leftJoinExpr/innerJoinExpr have two forms:
 * - leftJoinExpr: For use when invoice is LEFT JOINed (aggregate queries — both dashboard and marketing).
 *   Must filter by i.type in CASE WHEN since unmatched rows have NULL.
 * - innerJoinExpr: For use when invoice is INNER JOINed (detail/drilldown queries only).
 *   JOIN already filters to type=1, so CASE WHEN is simpler.
 *
 * Both forms produce identical results given their respective JOIN contexts.
 */
export const CRM_METRICS = {
  customerCount: {
    alias: 'customer_count',
    expr: 'COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END)',
  },
  subscriptionCount: {
    alias: 'subscription_count',
    expr: 'COUNT(DISTINCT s.id)',
  },
  trialCount: {
    alias: 'trial_count',
    leftJoinExpr: 'COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END)',
    innerJoinExpr: 'COUNT(DISTINCT i.id)',
  },
  trialsApprovedCount: {
    alias: 'trials_approved_count',
    leftJoinExpr: 'COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END)',
    innerJoinExpr: 'COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END)',
  },
  upsellCount: {
    alias: 'upsell_count',
    expr: 'COUNT(DISTINCT uo.id)',
  },
  upsellSubCount: {
    alias: 'upsell_sub_count',
    expr: 'COUNT(DISTINCT CASE WHEN uo.type = 1 THEN uo.id END)',
  },
  upsellOtsCount: {
    alias: 'upsell_ots_count',
    expr: 'COUNT(DISTINCT CASE WHEN uo.type = 3 THEN uo.id END)',
  },
  upsellsApprovedCount: {
    alias: 'upsells_approved_count',
    expr: 'COUNT(DISTINCT CASE WHEN uo.is_marked = 1 THEN uo.id END)',
  },
} as const;

/** OTS metric SQL expressions (standalone invoice-based, no subscription). */
export const OTS_METRICS = {
  otsCount: {
    alias: 'ots_count',
    expr: 'COUNT(DISTINCT i.id)',
  },
  otsApprovedCount: {
    alias: 'ots_approved_count',
    expr: 'COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END)',
  },
} as const;

/**
 * Trial metric SQL expressions (invoice-based, no upsell exclusion).
 *
 * Used by the separate trial query that counts trials using i.order_date
 * instead of s.date_create, and includes trials from upsell subscriptions.
 * This matches CRM trial counting: i.type=1, i.deleted=0, i.order_date in range.
 */
export const TRIAL_METRICS = {
  trialCount: {
    alias: 'trial_count',
    expr: 'COUNT(DISTINCT i.id)',
  },
  trialsApprovedCount: {
    alias: 'trials_approved_count',
    expr: 'COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END)',
  },
  onHoldCount: {
    alias: 'on_hold_count',
    expr: 'COUNT(DISTINCT CASE WHEN i.on_hold_date IS NOT NULL THEN i.id END)',
  },
} as const;

// ---------------------------------------------------------------------------
// JOIN clause templates
// ---------------------------------------------------------------------------

/** Standard subscription-based JOINs. Aliased consistently across all reports. */
export const CRM_JOINS = {
  /** Customer table — needed for customer_count metric and country dimension */
  customer: 'LEFT JOIN customer c ON s.customer_id = c.id',

  /** Trial invoice (type=1) — LEFT JOIN for aggregate queries, INNER JOIN for detail/drilldown queries */
  invoiceTrialLeft: 'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0',
  invoiceTrialInner: 'INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0',

  /** Product from invoice path */
  invoiceProduct: 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id',
  product: 'LEFT JOIN product p ON p.id = ip.product_id',

  /** Product from subscription path (fallback) */
  productSub: 'LEFT JOIN product p_sub ON p_sub.id = s.product_id',

  /** Product groups */
  productGroup: 'LEFT JOIN product_group pg ON pg.id = p.product_group_id',
  productGroupSub: 'LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id',

  /** Source from invoice path */
  sourceFromInvoice: 'LEFT JOIN source sr ON sr.id = i.source_id',
  /** Source from subscription path */
  sourceFromSub: 'LEFT JOIN source sr ON sr.id = s.source_id',
  /** Source from subscription path (secondary alias for dashboard COALESCE) */
  sourceFromSubAlt: 'LEFT JOIN source sr_sub ON sr_sub.id = s.source_id',

  /** Upsell invoices — matched via tag pattern on customer */
  upsell: "LEFT JOIN invoice uo ON uo.customer_id = s.customer_id\n    AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')",
  /** Upsell invoices — INNER JOIN variant for detail queries */
  upsellInner: "INNER JOIN invoice uo ON uo.customer_id = s.customer_id\n      AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')",

  /** Customer table — INNER JOIN variant (for detail queries that require customer) */
  customerInner: 'INNER JOIN customer c ON s.customer_id = c.id',

  /** Cancel reason JOINs (subscription → cancel_reason) */
  cancelReason: 'LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id\n      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id',

  /** Invoice INNER JOIN (generic, no type filter) — used by validation rate queries */
  invoiceInner: 'INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0',

  /** Invoice processed table — used by pay/buy rate calculations */
  invoiceProcessed: 'INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id',

  /** Invoice product with MIN deduplication — one product per invoice for accurate grouping */
  invoiceProductDeduped: `LEFT JOIN (
    SELECT invoice_id, MIN(product_id) as product_id
    FROM invoice_product
    GROUP BY invoice_id
  ) ip ON ip.invoice_id = i.id`,
} as const;

/** OTS JOINs (standalone invoice-based, no subscription). */
export const OTS_JOINS = {
  customer: 'LEFT JOIN customer c ON c.id = i.customer_id',
  invoiceProduct: 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id',
  product: 'LEFT JOIN product p ON p.id = ip.product_id',
  productGroup: 'LEFT JOIN product_group pg ON pg.id = p.product_group_id',
  source: 'LEFT JOIN source sr ON sr.id = i.source_id',
} as const;

// ---------------------------------------------------------------------------
// WHERE clause fragments
// ---------------------------------------------------------------------------

export const CRM_WHERE = {
  /** Excludes upsell subscriptions (matched by subscription tag, not invoice tag) */
  upsellExclusion: "(s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')",

  /** Excludes deleted subscriptions (used by detail/drilldown queries only) */
  deletedSubExclusion: 's.deleted = 0',

  /** Requires valid tracking IDs for ad attribution matching */
  trackingIdValidation: [
    's.tracking_id_4 IS NOT NULL',
    "s.tracking_id_4 != 'null'",
    's.tracking_id_2 IS NOT NULL',
    "s.tracking_id_2 != 'null'",
    's.tracking_id IS NOT NULL',
    "s.tracking_id != 'null'",
  ] as readonly string[],

  /** OTS invoice base filter */
  otsBase: 'i.type = 3 AND i.deleted = 0',

  /** Trial invoice base filter (for standalone trial query) */
  trialBase: 'i.type = 1 AND i.deleted = 0',

  /** OTS tracking ID validation (on invoice fields, not subscription) */
  otsTrackingIdValidation: [
    'i.tracking_id_4 IS NOT NULL',
    "i.tracking_id_4 != 'null'",
    'i.tracking_id_2 IS NOT NULL',
    "i.tracking_id_2 != 'null'",
    'i.tracking_id IS NOT NULL',
    "i.tracking_id != 'null'",
  ] as readonly string[],
} as const;

// ---------------------------------------------------------------------------
// Detail modal contracts — aggregate ↔ modal consistency
// ---------------------------------------------------------------------------

/**
 * Single source of truth for which date field and required WHERE clauses
 * each metric type uses. Both crmQueryBuilder (aggregate COUNTs) and
 * crmDetailModalQueryBuilder (individual rows) import these to guarantee
 * that clicking a metric cell in the table opens a modal with a matching
 * row count.
 *
 * Rule: if you change a contract here, both query builders automatically
 * pick up the change. Never hardcode date fields or base WHERE clauses
 * directly in the modal builder — always reference these contracts.
 */
export const CRM_DETAIL_CONTRACTS = {
  /** Customers / Subscriptions — subscription-based, always excludes upsell subs */
  subscription: {
    dateField: 's.date_create',
    alwaysWhere: [CRM_WHERE.upsellExclusion],
  },
  /** Trials / TrialsApproved — invoice date, no upsell exclusion */
  trial: {
    dateField: 'i.order_date',
    alwaysWhere: [] as readonly string[],
  },
  /** OTS — standalone invoice-based */
  ots: {
    dateField: 'i.order_date',
    alwaysWhere: [CRM_WHERE.otsBase],
  },
  /** Upsells — subscription date, no upsell exclusion (they ARE upsells) */
  upsell: {
    dateField: 's.date_create',
    alwaysWhere: [] as readonly string[],
  },
} as const;

// ---------------------------------------------------------------------------
// Rate type configurations (validation rate queries)
// ---------------------------------------------------------------------------

/**
 * Rate type configurations for validation rate pivot queries.
 * Defines the SQL fragments that differ between approval, pay, and buy rates.
 *
 * - approval: Denominator = subscriptions (s.id), numerator = approved trials (i.is_marked=1).
 *   Uses LEFT JOIN so subscriptions without trial invoices are still counted.
 *   Date = s.date_create (subscription creation date).
 * - pay: Denominator = invoices (i.id), numerator = paid invoices (date_paid IS NOT NULL).
 *   Uses INNER JOIN — only invoices matter. Date = i.invoice_date.
 * - buy: Denominator = invoices (i.id), numerator = bought invoices (date_bought IS NOT NULL).
 *   Uses INNER JOIN — only invoices matter. Date = i.invoice_date.
 */
export const RATE_TYPE_CONFIGS = {
  approval: {
    matchedCondition: 'AND i.is_marked = 1',
    extraJoin: '',
    invoiceFilter: '',  // type=1 is in the JOIN condition
    invoiceJoin: CRM_JOINS.invoiceTrialLeft,  // LEFT JOIN keeps subscriptions without trials
    denominatorId: 's.id',  // Count subscriptions
    dateField: 's.date_create',
  },
  pay: {
    matchedCondition: 'AND ipr.date_paid IS NOT NULL',
    extraJoin: CRM_JOINS.invoiceProcessed,
    invoiceFilter: 'AND i.type != 4',
    invoiceJoin: CRM_JOINS.invoiceInner,
    denominatorId: 'i.id',  // Count invoices
    dateField: 'i.invoice_date',
  },
  buy: {
    matchedCondition: 'AND ipr.date_bought IS NOT NULL',
    extraJoin: CRM_JOINS.invoiceProcessed,
    invoiceFilter: 'AND i.type != 4',
    invoiceJoin: CRM_JOINS.invoiceInner,
    denominatorId: 'i.id',  // Count invoices
    dateField: 'i.invoice_date',
  },
} as const;

// ---------------------------------------------------------------------------
// Source matching (consolidated — was duplicated in 3 files)
// ---------------------------------------------------------------------------

/**
 * Maps ad network names to their CRM source equivalents.
 * Used for matching PostgreSQL ads data to MariaDB CRM data.
 */
export const SOURCE_MAPPING: Record<string, string[]> = {
  'google ads': ['adwords', 'google'],
  'facebook': ['facebook', 'meta', 'fb'],
};

/**
 * Match an ad network name to a CRM source string (JS-side matching).
 * Used by marketing report when joining ads data with CRM data.
 *
 * @param network - Ad network name from PostgreSQL (e.g., 'Google Ads', 'Facebook')
 * @param source - CRM source string from MariaDB (e.g., 'adwords', 'facebook')
 * @returns true if the source belongs to the network
 */
export function matchNetworkToSource(network: string, source: string | null): boolean {
  if (!source) return false;

  const networkLower = network.toLowerCase();
  const sourceLower = source.toLowerCase();

  const validSources = SOURCE_MAPPING[networkLower];
  return validSources ? validSources.includes(sourceLower) : false;
}

/**
 * Build a parameterized SQL WHERE clause fragment for source/network filtering in MariaDB.
 * Used by marketing detail query builder for SQL-side source matching.
 *
 * @param network - Ad network name (e.g., 'Google Ads', 'Facebook')
 * @param sourceExpr - SQL expression for the source column. Defaults to 'sr.source'.
 *   Use 'COALESCE(sr.source, sr_sub.source)' when both invoice and subscription source JOINs are present.
 * @returns Object with whereClause (with ? placeholders) and params array, or null if network is not recognized
 */
export function buildSourceFilterParams(
  network: string,
  sourceExpr: string = 'sr.source'
): {
  whereClause: string;
  params: string[];
} | null {
  const networkLower = network.toLowerCase();
  const validSources = SOURCE_MAPPING[networkLower];
  if (!validSources) return null;

  const placeholders = validSources.map(() => '?').join(', ');
  return {
    whereClause: `LOWER(${sourceExpr}) IN (${placeholders})`,
    params: validSources.map(s => s.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// Detail metric IDs — Single source of truth
// ---------------------------------------------------------------------------

/**
 * Dashboard detail metric IDs (drilldown queries).
 * Used by: types/dashboardDetails, lib/schemas/api, crmDetailModalQueryBuilder,
 * ClickableMetricCell, dashboard details API route.
 */
export const DASHBOARD_DETAIL_METRIC_IDS = [
  'customers', 'subscriptions', 'trials', 'trialsApproved', 'onHold', 'ots', 'upsells',
] as const;

export type DashboardDetailMetricId = typeof DASHBOARD_DETAIL_METRIC_IDS[number];

/**
 * Marketing detail metric IDs (marketing report drilldown queries).
 * Now unified with Dashboard - uses same IDs for consistency.
 * Used by: types/marketingDetails, crmDetailModalQueryBuilder,
 * MarketingClickableMetricCell, DataTable, marketing details API route.
 */
export const MARKETING_DETAIL_METRIC_IDS = [
  'subscriptions', 'trialsApproved', 'trials', 'customers', 'onHold', 'ots', 'upsells',
] as const;

export type MarketingDetailMetricId = typeof MARKETING_DETAIL_METRIC_IDS[number];

// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

/**
 * Format a Date returned by mysql2 from a MariaDB DATE/DATETIME column.
 * mysql2 interprets DATE values in the server's local timezone (Europe/Oslo, CET),
 * so local methods correctly recover the original calendar day.
 *
 * Do NOT use getUTC* here — that would shift the date back one day for CET.
 */
export function formatMariaDBDateResult(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date for MariaDB BETWEEN queries (YYYY-MM-DD HH:MM:SS).
 * Uses UTC components to avoid timezone shifts.
 */
export function formatDateForMariaDB(date: Date, endOfDay: boolean = false): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${year}-${month}-${day} ${time}`;
}

/**
 * Build LIMIT/OFFSET clause for paginated MariaDB queries.
 * Default: LIMIT 50 (no offset).
 */
export function buildPaginationClause(pagination?: { page: number; pageSize: number }): {
  limitClause: string;
  params: number[];
} {
  if (!pagination) {
    return { limitClause: 'LIMIT ?', params: [50] };
  }
  const offset = (pagination.page - 1) * pagination.pageSize;
  return {
    limitClause: 'LIMIT ? OFFSET ?',
    params: [pagination.pageSize, offset],
  };
}
