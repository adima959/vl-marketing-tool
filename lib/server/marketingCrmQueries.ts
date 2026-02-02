import { executeMariaDBQuery } from './mariadb';

export interface CRMSubscriptionRow {
  source: string | null; // Can be null in MariaDB data
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  product_name: string | null;
  country: string | null; // Customer country
  sku: string | null; // Product SKU
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
 * @param filters - Date range and optional product filter
 * @returns CRM subscription rows grouped by source, campaign, adset, ad, date, product
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
  if (filters.productFilter) {
    whereClauses.push('p.product_name LIKE ?');
    params.push(filters.productFilter);
  }

  const query = `
    SELECT
      sr.source,
      s.tracking_id_4 as campaign_id,
      s.tracking_id_2 as adset_id,
      s.tracking_id as ad_id,
      DATE(s.date_create) as date,
      p.product_name,
      c.country,
      UPPER(TRIM(p.sku)) as sku,
      COUNT(DISTINCT s.id) as subscription_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) as approved_count
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id
      AND i.type = 1
      AND i.deleted = 0
    INNER JOIN customer c ON c.id = s.customer_id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create), p.product_name, c.country, p.sku
  `;

  return executeMariaDBQuery<CRMSubscriptionRow>(query, params);
}
