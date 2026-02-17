import { executeQuery } from './db';
import { formatLocalDate } from '@/lib/types/api';

type SqlParam = string | number | boolean | null | Date;

type FilterOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains';

export interface MarketingFlatParams {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  filters?: Array<{ field: string; operator: FilterOperator; value: string }>;
}

/** Maps dimension IDs to database column names */
const dimensionMap: Record<string, string> = {
  network: 'network',
  campaign: 'campaign_name',
  adset: 'adset_name',
  ad: 'ad_name',
  date: 'date',
};

/** Ad-hierarchy dimensions that have a companion ID column for CRM matching */
const dimensionIdMap: Record<string, string> = {
  campaign: 'campaign_id',
  adset: 'adset_id',
  ad: 'ad_id',
};

/** Classification dimensions requiring JOINs */
const classificationDimMap: Record<string, { selectExpr: string; groupByExpr: string; filterExpr: string }> = {
  classifiedProduct: {
    selectExpr: "COALESCE(ap.name, 'Unknown')",
    groupByExpr: 'ap.name',
    filterExpr: 'ap.name',
  },
  classifiedCountry: {
    selectExpr: "COALESCE(cc.country_code, 'Unknown')",
    groupByExpr: 'cc.country_code',
    filterExpr: 'cc.country_code',
  },
};

function isClassificationDim(dim: string): boolean {
  return dim in classificationDimMap;
}

/**
 * Fetches marketing data grouped by ALL selected dimensions in a single query.
 * Returns flat rows with dimension values + base metrics only.
 * Derived metrics (CTR, CPC, CPM, conversion rate) are computed client-side.
 */
export async function getMarketingDataFlat(
  params: MarketingFlatParams,
): Promise<Record<string, string | number>[]> {
  const { dateRange, dimensions, filters } = params;

  // Validate all dimensions
  for (const dim of dimensions) {
    if (!dimensionMap[dim] && !classificationDimMap[dim]) {
      throw new Error('Unknown dimension: ' + dim);
    }
  }

  const needsJoins = dimensions.some(isClassificationDim)
    || (filters ?? []).some(f => isClassificationDim(f.field));

  const pgParams: SqlParam[] = [
    formatLocalDate(dateRange.start),
    formatLocalDate(dateRange.end),
  ];

  const { clause: filterClause, params: filterParams } = buildTableFilters(filters, pgParams.length);
  pgParams.push(...filterParams);

  // Build SELECT and GROUP BY for every dimension
  const selectParts: string[] = [];
  const groupByParts: string[] = [];

  for (const dim of dimensions) {
    const cc = classificationDimMap[dim];
    if (cc) {
      selectParts.push(cc.selectExpr + ' AS "' + dim + '"');
      groupByParts.push(cc.groupByExpr);
    } else {
      const col = dimensionMap[dim];
      selectParts.push('m.' + col + ' AS "' + dim + '"');
      groupByParts.push('m.' + col);
    }

    // Also include companion ID column for CRM matching (1:1 with name, no extra rows)
    const idCol = dimensionIdMap[dim];
    if (idCol) {
      selectParts.push('m.' + idCol + ' AS "_' + idCol + '"');
      groupByParts.push('m.' + idCol);
    }
  }

  const joinClause = needsJoins
    ? 'LEFT JOIN app_campaign_classifications cc ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false LEFT JOIN app_products ap ON cc.product_id = ap.id'
    : '';

  const query = [
    'SELECT',
    '  ' + selectParts.join(', ') + ',',
    '  SUM(m.cost::numeric) AS cost,',
    '  SUM(m.clicks::integer) AS clicks,',
    '  SUM(m.impressions::integer) AS impressions,',
    '  SUM(m.conversions::numeric) AS conversions',
    'FROM merged_ads_spending m',
    joinClause,
    'WHERE m.date::date BETWEEN $1::date AND $2::date',
    filterClause,
    'GROUP BY ' + groupByParts.join(', '),
  ].filter(Boolean).join('\n');

  const rows = await executeQuery<Record<string, unknown>>(query, pgParams);

  return rows.map(row => {
    const result: Record<string, string | number> = {};
    for (const dim of dimensions) {
      const raw: unknown = row[dim];
      if (raw instanceof Date) {
        const d = String(raw.getUTCDate()).padStart(2, '0');
        const mo = String(raw.getUTCMonth() + 1).padStart(2, '0');
        const y = String(raw.getUTCFullYear());
        result[dim] = d + '/' + mo + '/' + y;
      } else {
        result[dim] = raw != null ? String(raw) : 'Unknown';
      }

      // Include companion ID for CRM matching
      const idCol = dimensionIdMap[dim];
      if (idCol) {
        const idKey = '_' + idCol;
        result[idKey] = row[idKey] != null ? String(row[idKey]) : '';
      }
    }
    result.cost = Number(row.cost) || 0;
    result.clicks = Number(row.clicks) || 0;
    result.impressions = Number(row.impressions) || 0;
    result.conversions = Number(row.conversions) || 0;
    return result;
  });
}

/** Build WHERE clause fragments from user-defined table filters */
function buildTableFilters(
  filters: MarketingFlatParams['filters'],
  paramOffset: number,
): { clause: string; params: SqlParam[] } {
  if (!filters || filters.length === 0) {
    return { clause: '', params: [] };
  }

  const params: SqlParam[] = [];
  const conditions: string[] = [];

  for (const filter of filters) {
    if (!filter.value && filter.operator !== 'equals' && filter.operator !== 'not_equals') continue;

    const sqlColumn = dimensionMap[filter.field];
    const classConfig = classificationDimMap[filter.field];
    if (!sqlColumn && !classConfig) continue;

    const colExpr = sqlColumn ? ('m.' + sqlColumn) : classConfig!.filterExpr;
    const textExpr = colExpr + '::text';

    switch (filter.operator) {
      case 'equals':
        if (!filter.value) {
          conditions.push(colExpr + ' IS NULL');
        } else {
          params.push(filter.value);
          conditions.push(textExpr + ' = $' + String(paramOffset + params.length));
        }
        break;
      case 'not_equals':
        if (!filter.value) {
          conditions.push(colExpr + ' IS NOT NULL');
        } else {
          params.push(filter.value);
          conditions.push('(' + colExpr + ' IS NULL OR ' + textExpr + ' != $' + String(paramOffset + params.length) + ')');
        }
        break;
      case 'contains':
        params.push('%' + filter.value + '%');
        conditions.push(textExpr + ' ILIKE $' + String(paramOffset + params.length));
        break;
      case 'not_contains':
        params.push('%' + filter.value + '%');
        conditions.push('(' + colExpr + ' IS NULL OR ' + textExpr + ' NOT ILIKE $' + String(paramOffset + params.length) + ')');
        break;
    }
  }

  if (conditions.length === 0) return { clause: '', params: [] };

  return {
    clause: 'AND ' + conditions.join(' AND '),
    params,
  };
}
