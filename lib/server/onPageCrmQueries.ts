import { executeMariaDBQuery } from './mariadb';

/**
 * Maps on-page dimension IDs to crm_subscription_enriched columns.
 * All queries target the enriched table (single table, pre-computed).
 *
 * Source/country normalization is done at refresh time — no runtime CASE/IN needed.
 */
export const CRM_DIMENSION_MAP: Record<string, {
  groupBy: string;
  filterField: string;
  /** What the enriched table stores for NULL/unknown values */
  nullValue?: string;
  /** Normalize filter value to match enriched table format */
  normalizeValue?: (v: string) => string;
}> = {
  utmSource: {
    groupBy: 'source_normalized',
    filterField: 'source_normalized',
    nullValue: '',
    normalizeValue: (v: string): string => {
      const lower = v.toLowerCase();
      if (lower === 'adwords') return 'google';
      return lower;
    },
  },
  campaign: {
    groupBy: 'tracking_id_4',
    filterField: 'tracking_id_4',
    nullValue: '',
  },
  adset: {
    groupBy: 'tracking_id_2',
    filterField: 'tracking_id_2',
    nullValue: '',
  },
  ad: {
    groupBy: 'tracking_id',
    filterField: 'tracking_id',
    nullValue: '',
  },
  date: {
    groupBy: "DATE_FORMAT(date_create, '%Y-%m-%d')",
    filterField: 'DATE(date_create)',
  },
  countryCode: {
    groupBy: 'country_normalized',
    filterField: 'country_normalized',
    nullValue: 'Unknown',
    normalizeValue: (v: string): string => v.toUpperCase(),
  },
};

interface OnPageCRMRow {
  dimension_value: string;
  trials: number;
  approved: number;
}

export interface OnPageCRMTrackingRow {
  source: string;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  trials: number;
  approved: number;
}

export interface OnPageCRMVisitorRow {
  ff_vid: string;
  trials: number;
  approved: number;
}

interface OnPageCRMOptions {
  dateRange: { start: string; end: string };
  groupByExpression: string;
  parentCrmFilters: { dimensionId: string; value: string }[];
}

/**
 * Build WHERE clauses and params for enriched table queries.
 */
function buildEnrichedFilters(
  dateRange: { start: string; end: string },
  parentCrmFilters: { dimensionId: string; value: string }[]
): { whereClauses: string[]; params: (string | number)[] } {
  const whereClauses: string[] = [
    'date_create BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];

  for (const filter of parentCrmFilters) {
    const mapping = CRM_DIMENSION_MAP[filter.dimensionId];
    if (!mapping) continue;

    if (filter.value === 'Unknown' && mapping.nullValue !== undefined) {
      whereClauses.push(`${mapping.filterField} = ?`);
      params.push(mapping.nullValue);
    } else {
      const value = mapping.normalizeValue
        ? mapping.normalizeValue(filter.value)
        : filter.value;
      whereClauses.push(`${mapping.filterField} = ?`);
      params.push(value);
    }
  }

  return { whereClauses, params };
}

/**
 * Query CRM data grouped by a dimension for direct matching.
 * Single-table scan on crm_subscription_enriched.
 */
export async function getOnPageCRMData(
  options: OnPageCRMOptions
): Promise<OnPageCRMRow[]> {
  const { dateRange, groupByExpression, parentCrmFilters } = options;
  const { whereClauses, params } = buildEnrichedFilters(dateRange, parentCrmFilters);

  const query = `
    SELECT
      ${groupByExpression} AS dimension_value,
      COUNT(*) AS trials,
      SUM(is_approved) AS approved
    FROM crm_subscription_enriched
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY ${groupByExpression}
  `;

  return executeMariaDBQuery<OnPageCRMRow>(query, params);
}

/**
 * Query CRM data grouped by tracking combo (source + campaign + adset + ad).
 * Used for cross-database matching via shared tracking IDs.
 */
export async function getOnPageCRMByTrackingIds(
  options: Omit<OnPageCRMOptions, 'groupByExpression'>
): Promise<OnPageCRMTrackingRow[]> {
  const { dateRange, parentCrmFilters } = options;
  const { whereClauses, params } = buildEnrichedFilters(dateRange, parentCrmFilters);

  const query = `
    SELECT
      source_normalized AS source,
      tracking_id_4 AS campaign_id,
      tracking_id_2 AS adset_id,
      tracking_id AS ad_id,
      COUNT(*) AS trials,
      SUM(is_approved) AS approved
    FROM crm_subscription_enriched
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY source_normalized, tracking_id_4, tracking_id_2, tracking_id
  `;

  return executeMariaDBQuery<OnPageCRMTrackingRow>(query, params);
}

/**
 * Query CRM data grouped by ff_vid for visitor-ID matching.
 * Returns all ff_vid -> {trials, approved} pairs for the date range.
 * Application code matches these against PG ff_visitor_id values.
 * Parent CRM filters are applied to avoid over-attribution during drill-down.
 */
export async function getOnPageCRMByVisitorIds(
  options: Omit<OnPageCRMOptions, 'groupByExpression'>
): Promise<OnPageCRMVisitorRow[]> {
  const { dateRange, parentCrmFilters } = options;
  const { whereClauses, params } = buildEnrichedFilters(dateRange, parentCrmFilters);

  const query = `
    SELECT
      ff_vid,
      COUNT(*) AS trials,
      SUM(is_approved) AS approved
    FROM crm_subscription_enriched
    WHERE ${whereClauses.join(' AND ')}
      AND ff_vid IS NOT NULL
    GROUP BY ff_vid
  `;

  return executeMariaDBQuery<OnPageCRMVisitorRow>(query, params);
}
