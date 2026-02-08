import { executeMariaDBQuery } from './mariadb';

export interface CRMSubscriptionRow {
  source: string | null; // Can be null in MariaDB data
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  subscription_count: number;
  approved_count: number;
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
  // Build dynamic WHERE clauses
  const whereClauses: string[] = [
    's.date_create BETWEEN ? AND ?',
    's.deleted = 0',
    '(i.tag IS NULL OR i.tag NOT LIKE \'%parent-sub-id=%\')',
    's.tracking_id_4 IS NOT NULL',
    's.tracking_id_4 != \'null\'',
    's.tracking_id_2 IS NOT NULL',
    's.tracking_id_2 != \'null\'',
    's.tracking_id IS NOT NULL',
    's.tracking_id != \'null\''
  ];

  const params: any[] = [filters.dateStart, filters.dateEnd];

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
      COUNT(DISTINCT s.id) as subscription_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 AND i.deleted = 0 THEN i.id END) as approved_count
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id
      AND i.type = 1
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create)
  `;

  return executeMariaDBQuery<CRMSubscriptionRow>(query, params);
}

