import { executeMariaDBQuery } from './mariadb';

/**
 * Maps country codes to possible CRM country values for filtering.
 * CRM database may contain uppercase codes, lowercase codes, or full country names.
 */
const COUNTRY_CODE_VARIANTS: Record<string, string[]> = {
  DK: ['DK', 'dk', 'Denmark', 'denmark', 'DNK', 'dnk'],
  SE: ['SE', 'se', 'Sweden', 'sweden', 'SWE', 'swe'],
  NO: ['NO', 'no', 'Norway', 'norway', 'NOR', 'nor'],
  FI: ['FI', 'fi', 'Finland', 'finland', 'FIN', 'fin'],
};

/**
 * Maps on-page dimension IDs to CRM query fields.
 * Only dimensions with a CRM equivalent are listed here.
 */
export const CRM_DIMENSION_MAP: Record<string, {
  groupBy: string;
  filterField: string;
  isSource?: boolean;
  isCountry?: boolean;
}> = {
  utmSource: {
    groupBy: "LOWER(sr.source)",
    filterField: 'sr.source',
    isSource: true,
  },
  campaign: {
    groupBy: 's.tracking_id_4',
    filterField: 's.tracking_id_4',
  },
  adset: {
    groupBy: 's.tracking_id_2',
    filterField: 's.tracking_id_2',
  },
  ad: {
    groupBy: 's.tracking_id',
    filterField: 's.tracking_id',
  },
  date: {
    groupBy: "DATE_FORMAT(s.date_create, '%Y-%m-%d')",
    filterField: 'DATE(s.date_create)',
  },
  countryCode: {
    groupBy: `CASE
      WHEN c.country IN ('DK', 'dk', 'Denmark', 'denmark', 'DNK', 'dnk') THEN 'DK'
      WHEN c.country IN ('SE', 'se', 'Sweden', 'sweden', 'SWE', 'swe') THEN 'SE'
      WHEN c.country IN ('NO', 'no', 'Norway', 'norway', 'NOR', 'nor') THEN 'NO'
      WHEN c.country IN ('FI', 'fi', 'Finland', 'finland', 'FIN', 'fin') THEN 'FI'
      ELSE COALESCE(c.country, 'Unknown')
    END`,
    filterField: 'c.country',
    isCountry: true,
  },
};

/**
 * Source normalization: expands an on-page utm_source value to matching CRM source variants.
 * Mirrors matchSource() logic from marketingQueryBuilder.ts.
 */
const SOURCE_VARIANTS: Record<string, string[]> = {
  google: ['google', 'adwords'],
  facebook: ['facebook', 'meta'],
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

interface OnPageCRMOptions {
  dateRange: { start: string; end: string };
  groupByExpression: string;
  parentCrmFilters: { dimensionId: string; value: string }[];
}

/**
 * Query CRM subscription data grouped by a dimension for on-page matching.
 *
 * Uses the same subscription/invoice JOIN pattern as the dashboard query builder,
 * matching its exclusion rules:
 * - s.deleted = 0
 * - Upsells excluded (invoice.tag NOT LIKE '%parent-sub-id=%')
 * - i.type = 1 (trial/primary subscriptions only)
 *
 * Note: Does NOT require tracking IDs to be non-null (unlike marketingCrmQueries).
 * Sources like Orionmedia/Leadbit may not have campaign/adset/ad tracking.
 */
export async function getOnPageCRMData(
  options: OnPageCRMOptions
): Promise<OnPageCRMRow[]> {
  const { dateRange, groupByExpression, parentCrmFilters } = options;

  const whereClauses: string[] = [
    's.date_create BETWEEN ? AND ?',
    's.deleted = 0',
    "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",
  ];

  const params: (string | number)[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];

  // Apply parent filters (translated from on-page dimensions to CRM fields)
  for (const filter of parentCrmFilters) {
    const mapping = CRM_DIMENSION_MAP[filter.dimensionId];
    if (!mapping) continue;

    if (filter.value === 'Unknown') {
      if (mapping.isSource) {
        whereClauses.push('sr.source IS NULL');
      } else if (mapping.isCountry) {
        whereClauses.push('c.country IS NULL');
      } else {
        whereClauses.push(`${mapping.filterField} IS NULL`);
      }
      continue;
    }

    if (mapping.isSource) {
      // Expand source to matching CRM variants
      const variants = SOURCE_VARIANTS[filter.value.toLowerCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        whereClauses.push(`LOWER(sr.source) IN (${placeholders})`);
        params.push(...variants);
      } else {
        whereClauses.push('LOWER(sr.source) = ?');
        params.push(filter.value.toLowerCase());
      }
    } else if (mapping.isCountry) {
      // Expand country code to matching CRM variants
      const variants = COUNTRY_CODE_VARIANTS[filter.value.toUpperCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        whereClauses.push(`c.country IN (${placeholders})`);
        params.push(...variants);
      } else {
        whereClauses.push('c.country = ?');
        params.push(filter.value);
      }
    } else {
      whereClauses.push(`${mapping.filterField} = ?`);
      params.push(filter.value);
    }
  }

  const query = `
    SELECT
      ${groupByExpression} AS dimension_value,
      COUNT(DISTINCT s.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 AND i.deleted = 0 THEN s.id END) AS approved
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY ${groupByExpression}
  `;

  return executeMariaDBQuery<OnPageCRMRow>(query, params);
}

/**
 * Normalized source expression for MariaDB CRM queries.
 * Maps variant source names to canonical form for cross-database matching.
 */
const CRM_NORMALIZED_SOURCE = `
  CASE
    WHEN LOWER(sr.source) IN ('google', 'adwords') THEN 'google'
    WHEN LOWER(sr.source) IN ('facebook', 'meta') THEN 'facebook'
    ELSE LOWER(COALESCE(sr.source, ''))
  END`;

/**
 * Query CRM subscriptions grouped by full tracking ID combo (source + campaign + adset + ad).
 * Used for cross-database matching: CRM conversions are attributed to ANY page view dimension
 * by joining on shared tracking IDs in application code.
 */
export async function getOnPageCRMByTrackingIds(
  options: Omit<OnPageCRMOptions, 'groupByExpression'>
): Promise<OnPageCRMTrackingRow[]> {
  const { dateRange, parentCrmFilters } = options;

  const whereClauses: string[] = [
    's.date_create BETWEEN ? AND ?',
    's.deleted = 0',
    "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",
  ];

  const params: (string | number)[] = [
    `${dateRange.start} 00:00:00`,
    `${dateRange.end} 23:59:59`,
  ];

  for (const filter of parentCrmFilters) {
    const mapping = CRM_DIMENSION_MAP[filter.dimensionId];
    if (!mapping) continue;

    if (filter.value === 'Unknown') {
      if (mapping.isSource) {
        whereClauses.push('sr.source IS NULL');
      } else if (mapping.isCountry) {
        whereClauses.push('c.country IS NULL');
      } else {
        whereClauses.push(`${mapping.filterField} IS NULL`);
      }
      continue;
    }

    if (mapping.isSource) {
      const variants = SOURCE_VARIANTS[filter.value.toLowerCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        whereClauses.push(`LOWER(sr.source) IN (${placeholders})`);
        params.push(...variants);
      } else {
        whereClauses.push('LOWER(sr.source) = ?');
        params.push(filter.value.toLowerCase());
      }
    } else if (mapping.isCountry) {
      const variants = COUNTRY_CODE_VARIANTS[filter.value.toUpperCase()];
      if (variants) {
        const placeholders = variants.map(() => '?').join(', ');
        whereClauses.push(`c.country IN (${placeholders})`);
        params.push(...variants);
      } else {
        whereClauses.push('c.country = ?');
        params.push(filter.value);
      }
    } else {
      whereClauses.push(`${mapping.filterField} = ?`);
      params.push(filter.value);
    }
  }

  const query = `
    SELECT
      ${CRM_NORMALIZED_SOURCE} AS source,
      COALESCE(s.tracking_id_4, '') AS campaign_id,
      COALESCE(s.tracking_id_2, '') AS adset_id,
      COALESCE(s.tracking_id, '') AS ad_id,
      COUNT(DISTINCT s.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 AND i.deleted = 0 THEN s.id END) AS approved
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY ${CRM_NORMALIZED_SOURCE},
             COALESCE(s.tracking_id_4, ''),
             COALESCE(s.tracking_id_2, ''),
             COALESCE(s.tracking_id, '')
  `;

  return executeMariaDBQuery<OnPageCRMTrackingRow>(query, params);
}
