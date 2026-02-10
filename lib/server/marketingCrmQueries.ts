import { executeMariaDBQuery } from './mariadb';
import { CRM_METRICS, OTS_METRICS, CRM_JOINS, OTS_JOINS, CRM_WHERE } from './crmMetrics';

type SqlParam = string | number | boolean | null | Date;

export interface CRMSubscriptionRow {
  source: string | null; // Can be null in MariaDB data
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  subscription_count: number;
  approved_count: number;
  trial_count: number;
  customer_count: number;
  upsell_count: number;
  upsells_approved_count: number;
}

export interface CRMOtsRow {
  source: string | null;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  ots_count: number;
  ots_approved_count: number;
}

export interface CRMQueryFilters {
  dateStart: string; // 'YYYY-MM-DD HH:MM:SS'
  dateEnd: string;   // 'YYYY-MM-DD HH:MM:SS'
  productFilter?: string; // Optional: e.g., '%Balansera%'
  // Optional filters to reduce fetched data
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
}

/**
 * Get primary subscriptions from MariaDB with optional product filtering
 *
 * Excludes upsells (invoice.tag LIKE '%parent-sub-id=%')
 * Only counts invoice.type = 1 (trials/primary subscriptions)
 *
 * subscription_count: All subscriptions (including canceled/deleted invoices)
 * approved_count: Only non-deleted invoices with is_marked = 1
 *
 * @param filters - Date range and optional product filter
 * @returns CRM subscription rows grouped by source, campaign, adset, ad, date
 */
export async function getCRMSubscriptions(
  filters: CRMQueryFilters
): Promise<CRMSubscriptionRow[]> {
  // Build dynamic WHERE clauses (shared constants from crmMetrics.ts)
  const whereClauses: string[] = [
    's.date_create BETWEEN ? AND ?',
    CRM_WHERE.deletedSubExclusion,
    CRM_WHERE.upsellExclusion,
    ...CRM_WHERE.trackingIdValidation,
  ];

  const params: SqlParam[] = [filters.dateStart, filters.dateEnd];

  // Add optional filters
  if (filters.campaign_id) {
    whereClauses.push('s.tracking_id_4 = ?');
    params.push(filters.campaign_id);
  }
  if (filters.adset_id) {
    whereClauses.push('s.tracking_id_2 = ?');
    params.push(filters.adset_id);
  }
  if (filters.ad_id) {
    whereClauses.push('s.tracking_id = ?');
    params.push(filters.ad_id);
  }
  // Product filter uses EXISTS subquery to avoid overcounting from product JOINs
  if (filters.productFilter) {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM invoice_product ip
      INNER JOIN product p ON p.id = ip.product_id
      WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
    )`);
    params.push(filters.productFilter);
  }

  const query = `
    SELECT
      sr.source,
      s.tracking_id_4 as campaign_id,
      s.tracking_id_2 as adset_id,
      s.tracking_id as ad_id,
      DATE(s.date_create) as date,
      ${CRM_METRICS.subscriptionCount.expr} as subscription_count,
      ${CRM_METRICS.trialsApprovedCount.innerJoinExpr} as approved_count,
      ${CRM_METRICS.trialCount.innerJoinExpr} as trial_count,
      ${CRM_METRICS.customerCount.expr} as customer_count,
      ${CRM_METRICS.upsellCount.expr} as upsell_count,
      ${CRM_METRICS.upsellsApprovedCount.expr} as upsells_approved_count
    FROM subscription s
    ${CRM_JOINS.invoiceTrialInner}
    ${CRM_JOINS.customer}
    ${CRM_JOINS.sourceFromSub}
    ${CRM_JOINS.upsell}
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create)
  `;

  return executeMariaDBQuery<CRMSubscriptionRow>(query, params);
}

/**
 * Get OTS (one-time sale) invoices from MariaDB with tracking ID attribution.
 *
 * OTS invoices (type=3) are standalone — not linked to subscriptions.
 * They have their own tracking IDs directly on the invoice, so attribution
 * works the same way as subscriptions: match via (tracking_id_4, tracking_id_2, tracking_id).
 *
 * @param filters - Date range (uses order_date, not date_create)
 * @returns CRM OTS rows grouped by source, campaign, adset, ad, date
 */
export async function getCRMOts(
  filters: CRMQueryFilters
): Promise<CRMOtsRow[]> {
  const whereClauses: string[] = [
    CRM_WHERE.otsBase,
    'i.order_date BETWEEN ? AND ?',
    ...CRM_WHERE.otsTrackingIdValidation,
  ];

  const params: SqlParam[] = [filters.dateStart, filters.dateEnd];

  if (filters.campaign_id) {
    whereClauses.push('i.tracking_id_4 = ?');
    params.push(filters.campaign_id);
  }
  if (filters.adset_id) {
    whereClauses.push('i.tracking_id_2 = ?');
    params.push(filters.adset_id);
  }
  if (filters.ad_id) {
    whereClauses.push('i.tracking_id = ?');
    params.push(filters.ad_id);
  }

  const query = `
    SELECT
      sr.source,
      i.tracking_id_4 as campaign_id,
      i.tracking_id_2 as adset_id,
      i.tracking_id as ad_id,
      DATE(i.order_date) as date,
      ${OTS_METRICS.otsCount.expr} as ${OTS_METRICS.otsCount.alias},
      ${OTS_METRICS.otsApprovedCount.expr} as ${OTS_METRICS.otsApprovedCount.alias}
    FROM invoice i
    ${OTS_JOINS.source}
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY sr.source, i.tracking_id_4, i.tracking_id_2, i.tracking_id, DATE(i.order_date)
  `;

  return executeMariaDBQuery<CRMOtsRow>(query, params);
}

