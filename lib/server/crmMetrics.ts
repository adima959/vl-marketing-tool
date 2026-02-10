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
 * - leftJoinExpr: For use when invoice is LEFT JOINed (dashboard pattern).
 *   Must filter by i.type in CASE WHEN since unmatched rows have NULL.
 * - innerJoinExpr: For use when invoice is INNER JOINed (marketing pattern).
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

// ---------------------------------------------------------------------------
// JOIN clause templates
// ---------------------------------------------------------------------------

/** Standard subscription-based JOINs. Aliased consistently across all reports. */
export const CRM_JOINS = {
  /** Customer table — needed for customer_count metric and country dimension */
  customer: 'LEFT JOIN customer c ON s.customer_id = c.id',

  /** Trial invoice (type=1) — LEFT JOIN for dashboard, INNER JOIN for marketing */
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
  /** Excludes upsell invoices from trial counts */
  upsellExclusion: "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",

  /** Excludes deleted subscriptions (marketing uses this, dashboard does not) */
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
 * @returns Object with whereClause (with ? placeholders) and params array, or null if network is not recognized
 */
export function buildSourceFilterParams(network: string): {
  whereClause: string;
  params: string[];
} | null {
  const networkLower = network.toLowerCase();
  const validSources = SOURCE_MAPPING[networkLower];
  if (!validSources) return null;

  const placeholders = validSources.map(() => '?').join(', ');
  return {
    whereClause: `LOWER(sr.source) IN (${placeholders})`,
    params: validSources.map(s => s.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// Detail metric IDs — Single source of truth
// ---------------------------------------------------------------------------

/**
 * Dashboard detail metric IDs (drilldown queries).
 * Used by: types/dashboardDetails, lib/schemas/api, dashboardDrilldownQueryBuilder,
 * ClickableMetricCell, dashboard details API route.
 */
export const DASHBOARD_DETAIL_METRIC_IDS = [
  'customers', 'subscriptions', 'trials', 'trialsApproved', 'ots', 'upsells',
] as const;

export type DashboardDetailMetricId = typeof DASHBOARD_DETAIL_METRIC_IDS[number];

/**
 * Marketing detail metric IDs (marketing report drilldown queries).
 * Used by: types/marketingDetails, marketingDetailQueryBuilder,
 * MarketingClickableMetricCell, DataTable, marketing details API route.
 */
export const MARKETING_DETAIL_METRIC_IDS = [
  'crmSubscriptions', 'approvedSales', 'trials', 'customers', 'ots', 'upsells',
] as const;

export type MarketingDetailMetricId = typeof MARKETING_DETAIL_METRIC_IDS[number];

// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

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
