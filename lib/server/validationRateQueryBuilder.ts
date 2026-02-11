import { executeMariaDBQuery } from './mariadb';
import { CRM_JOINS, CRM_WHERE, RATE_TYPE_CONFIGS, formatDateForMariaDB } from './crmMetrics';
import { FilterBuilder } from './queryBuilderUtils';
import {
  VALIDATION_RATE_DIMENSION_COLUMN_MAP,
  getValidationRateDimensionColumn,
} from '@/config/validationRateDimensions';
import { toTitleCase } from '@/lib/formatters';
import type {
  ValidationRateType,
  TimePeriod,
  TimePeriodColumn,
  ValidationRateRow,
  ValidationRateQueryParams,
  ValidationRateResponse,
} from '@/types';

/**
 * Validation Rate Query Builder
 *
 * Generates pivot-style data with rates by dimension and time period.
 * Supports approval rate, pay rate, and buy rate calculations.
 * Data source: MariaDB CRM database only (no PostgreSQL).
 *
 * Uses shared primitives from crmMetrics.ts:
 * - CRM_JOINS for table joins (matches dashboard patterns)
 * - CRM_WHERE for filter conditions
 * - RATE_TYPE_CONFIGS for approval/pay/buy differences
 *
 * Rate type configs are defined in crmMetrics.ts (single source of truth).
 *
 * Table joins (via CRM_JOINS):
 *   subscription s
 *   → customer c (LEFT JOIN via s.customer_id)
 *   → invoice i (INNER JOIN via i.subscription_id, no type filter — type in WHERE)
 *   → invoice_product ip (deduped MIN subquery — one product per invoice)
 *   → product p (via ip.product_id) + p_sub fallback (via s.product_id)
 *   → source sr (via i.source_id) + sr_sub fallback (via s.source_id)
 *   → invoice_proccessed ipr (via ipr.invoice_id) [pay/buy only]
 */

// Raw row from MariaDB query
interface RawValidationRow {
  dimension_value: string | null;
  [key: string]: string | number | null; // Dynamic period columns
}

/** FilterBuilder for validation rate parent filters (case-insensitive country matching) */
const validationFilterBuilder = new FilterBuilder({
  dbType: 'mariadb',
  dimensionMap: {
    country: {
      column: VALIDATION_RATE_DIMENSION_COLUMN_MAP.country,
      nullCheck: `(${VALIDATION_RATE_DIMENSION_COLUMN_MAP.country} IS NULL OR ${VALIDATION_RATE_DIMENSION_COLUMN_MAP.country} = '')`,
      caseInsensitive: true,
    },
    source: {
      column: VALIDATION_RATE_DIMENSION_COLUMN_MAP.source,
      nullCheck: `(${VALIDATION_RATE_DIMENSION_COLUMN_MAP.source} IS NULL OR ${VALIDATION_RATE_DIMENSION_COLUMN_MAP.source} = '')`,
    },
    product: {
      column: VALIDATION_RATE_DIMENSION_COLUMN_MAP.product,
      nullCheck: `(${VALIDATION_RATE_DIMENSION_COLUMN_MAP.product} IS NULL OR ${VALIDATION_RATE_DIMENSION_COLUMN_MAP.product} = '')`,
    },
  },
});

/** Create a Date at UTC midnight for the given year/month/day */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Compute the start date for a period ending at `currentEnd` */
function computePeriodStart(currentEnd: Date, periodType: TimePeriod): Date {
  if (periodType === 'weekly') {
    const start = new Date(currentEnd);
    start.setUTCDate(start.getUTCDate() - 6);
    return start;
  }
  if (periodType === 'biweekly') {
    // Half-month boundaries: 1-14 and 15-end of month
    return currentEnd.getUTCDate() >= 15
      ? utcDate(currentEnd.getUTCFullYear(), currentEnd.getUTCMonth(), 15)
      : utcDate(currentEnd.getUTCFullYear(), currentEnd.getUTCMonth(), 1);
  }
  // monthly: first day of month
  return utcDate(currentEnd.getUTCFullYear(), currentEnd.getUTCMonth(), 1);
}

/** Advance backwards: return the end date of the period before `currentStart` */
function advanceToPreviousPeriod(currentStart: Date, periodType: TimePeriod): Date {
  if (periodType === 'monthly') {
    const end = new Date(currentStart);
    end.setUTCDate(end.getUTCDate() - 1);
    return end;
  }
  if (periodType === 'biweekly') {
    return currentStart.getUTCDate() === 15
      ? utcDate(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 14)
      : utcDate(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0);
  }
  // weekly
  const end = new Date(currentStart);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

/**
 * Generate time period columns based on date range and period type
 *
 * All date arithmetic uses UTC to match the canonical formatDateForMariaDB() in crmMetrics.ts.
 * Input dates are expected at UTC midnight (as created by the frontend DateRangePicker).
 *
 * Periods are generated from the END date backwards to maintain
 * consistent ordering (most recent first in array index 0).
 *
 * Biweekly uses half-month boundaries: 1-14 and 15-end of month
 */
export function generateTimePeriods(
  startDate: Date,
  endDate: Date,
  periodType: TimePeriod
): TimePeriodColumn[] {
  const periods: TimePeriodColumn[] = [];

  let currentEnd = new Date(endDate);
  let periodIndex = 0;

  // Work backwards from end date
  while (currentEnd >= startDate) {
    let currentStart = computePeriodStart(currentEnd, periodType);

    // Don't go before the requested start date
    if (currentStart < startDate) {
      currentStart = new Date(startDate);
    }

    periods.push({
      key: `period_${periodIndex}`,
      label: formatPeriodLabel(currentStart, currentEnd, periodType),
      startDate: formatDateForMariaDB(currentStart, false),
      endDate: formatDateForMariaDB(currentEnd, true),
    });

    currentEnd = advanceToPreviousPeriod(currentStart, periodType);
    periodIndex++;

    // Safety: Max 52 periods (1 year of weeks)
    if (periodIndex > 52) break;
  }

  // Reverse so oldest is first (left to right in table)
  return periods.reverse();
}

/**
 * Format period label for display (uses UTC to match SQL date boundaries)
 */
function formatPeriodLabel(start: Date, end: Date, periodType: TimePeriod): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (periodType === 'monthly') {
    // Show month name + year if different from current year
    const monthName = months[start.getUTCMonth()];
    const currentYear = new Date().getUTCFullYear();
    if (start.getUTCFullYear() !== currentYear) {
      return `${monthName} ${start.getUTCFullYear()}`;
    }
    return monthName;
  }

  // Weekly/biweekly: Show date range
  const startMonth = months[start.getUTCMonth()];
  const endMonth = months[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

/**
 * Build SQL query for validation rates with dynamic period columns.
 *
 * Uses shared primitives from crmMetrics.ts for JOINs, WHERE clauses, and rate type configs.
 * Uses FilterBuilder from queryBuilderUtils.ts for parent filter generation.
 */
function buildValidationRateQuery(
  rateType: ValidationRateType,
  dimension: string,
  periods: TimePeriodColumn[],
  parentFilters?: Record<string, string>
): { query: string; params: (string | number | boolean | null | Date)[] } {
  const dimensionColumn = getValidationRateDimensionColumn(dimension);
  if (!dimensionColumn) {
    throw new Error(`Unknown dimension: ${dimension}`);
  }

  const { matchedCondition, extraJoin, invoiceFilter, dateField, invoiceJoin, denominatorId } = RATE_TYPE_CONFIGS[rateType];

  // Build parent filters via shared FilterBuilder (handles case-insensitive country, Unknown→NULL)
  const filterResult = validationFilterBuilder.buildParentFilters(parentFilters);

  // Get overall date range for WHERE clause (critical for performance!)
  // Periods are sorted oldest-first, so first period has earliest start, last has latest end
  const overallStartDate = periods[0].startDate;
  const overallEndDate = periods[periods.length - 1].endDate;

  // Build params in SQL clause order (no splice hack needed)
  const params: (string | number | boolean | null | Date)[] = [];

  // 1. Period SELECT params: 4 per period (2 for denominator count, 2 for approved count)
  // Denominator: s.id for approval (subscriptions), i.id for pay/buy (invoices)
  // Numerator: always i.id (matched invoices)
  const periodSelects = periods.map((period) => {
    params.push(period.startDate, period.endDate);
    params.push(period.startDate, period.endDate);

    return `
      COUNT(DISTINCT CASE
        WHEN ${dateField} BETWEEN ? AND ?
        THEN ${denominatorId}
      END) as ${period.key}_trials,
      COUNT(DISTINCT CASE
        WHEN ${dateField} BETWEEN ? AND ?
        ${matchedCondition}
        THEN i.id
      END) as ${period.key}_approved`;
  }).join(',\n      ');

  // 2. Overall date range params (WHERE clause)
  params.push(overallStartDate, overallEndDate);

  // 3. Parent filter params
  params.push(...filterResult.params);

  // 4. HAVING params: filter out dimension values below display threshold (3 minimum)
  const havingConditions = periods.map((period) => {
    params.push(period.startDate, period.endDate);
    return `COUNT(DISTINCT CASE WHEN ${dateField} BETWEEN ? AND ? THEN ${denominatorId} END) >= 3`;
  });
  const havingClause = `HAVING (${havingConditions.join(' OR ')})`;

  // Build full query using shared CRM_JOINS
  // JOINs match dashboard geography mode patterns for consistent dimension resolution:
  // - invoiceProductDeduped: MIN(product_id) prevents multi-product invoice duplication
  // - sourceFromInvoice + sourceFromSubAlt: COALESCE for source resolution
  // - product + productSub: COALESCE for product resolution
  const query = `
    SELECT
      ${dimensionColumn} AS dimension_value,
      ${periodSelects}
    FROM subscription s
    ${CRM_JOINS.customer}
    ${invoiceJoin}
    ${CRM_JOINS.invoiceProductDeduped}
    ${CRM_JOINS.product}
    ${CRM_JOINS.productSub}
    ${CRM_JOINS.sourceFromInvoice}
    ${CRM_JOINS.sourceFromSubAlt}
    ${extraJoin}
    WHERE 1=1
      ${invoiceFilter}
      AND ${CRM_WHERE.upsellExclusion}
      AND ${dateField} BETWEEN ? AND ?
      AND ${dimensionColumn} IS NOT NULL
      AND LENGTH(TRIM(${dimensionColumn})) > 0
      ${filterResult.whereClause}
    GROUP BY ${dimensionColumn}
    ${havingClause}
    ORDER BY ${dimensionColumn}
  `;

  return { query, params };
}

/**
 * Transform raw SQL results to ValidationRateRow format
 */
function transformResults(
  rows: RawValidationRow[],
  periods: TimePeriodColumn[],
  dimensions: string[],
  depth: number,
  parentKey: string
): ValidationRateRow[] {
  return rows
    .filter((row) => {
      // Filter out rows with NULL, empty, or whitespace-only dimension values
      // These would display as empty rows in the table
      // Use Boolean coercion for robust falsy check
      const value = row.dimension_value;
      return Boolean(value && String(value).trim());
    })
    .map((row) => {
    const dimensionValue = row.dimension_value ?? 'Unknown';
    const key = parentKey ? `${parentKey}::${dimensionValue}` : dimensionValue;

    // Build metrics with rate, trials, and approved for each period
    const metrics: Record<string, { rate: number; trials: number; approved: number }> = {};
    for (const period of periods) {
      const trials = Number(row[`${period.key}_trials`]) || 0;
      const approved = Number(row[`${period.key}_approved`]) || 0;
      const rate = trials > 0 ? approved / trials : 0;
      metrics[period.key] = { rate, trials, approved };
    }

    // Check if there are more dimensions to drill into
    const hasChildren = depth < dimensions.length - 1;

    return {
      key,
      attribute: toTitleCase(dimensionValue),
      depth,
      hasChildren,
      metrics,
    };
  });
}

/**
 * Main query function for validation rate data
 */
export async function getValidationRateData(
  params: ValidationRateQueryParams
): Promise<ValidationRateResponse> {
  const {
    rateType,
    dateRange,
    dimensions,
    depth,
    parentFilters,
    timePeriod,
  } = params;

  // Validate
  if (dimensions.length === 0) {
    return { success: false, data: [], periodColumns: [], error: 'No dimensions specified' };
  }

  if (depth >= dimensions.length) {
    return { success: false, data: [], periodColumns: [], error: 'Invalid depth' };
  }

  // Generate time periods
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  const periodColumns = generateTimePeriods(startDate, endDate, timePeriod);

  if (periodColumns.length === 0) {
    return { success: false, data: [], periodColumns: [], error: 'No time periods generated' };
  }

  // Get current dimension to query
  const currentDimension = dimensions[depth];

  // Build parent key for child rows
  let parentKey = '';
  if (parentFilters) {
    const parentValues = dimensions.slice(0, depth).map((dim) => parentFilters[dim] || 'Unknown');
    parentKey = parentValues.join('::');
  }

  try {
    // Build and execute query
    const { query, params: queryParams } = buildValidationRateQuery(
      rateType,
      currentDimension,
      periodColumns,
      parentFilters
    );

    const rows = await executeMariaDBQuery<RawValidationRow>(query, queryParams);

    // Transform to ValidationRateRow format
    const data = transformResults(rows, periodColumns, dimensions, depth, parentKey);

    return {
      success: true,
      data,
      periodColumns,
    };
  } catch (error) {
    console.error(`Validation rate query error (${rateType}):`, error);
    return {
      success: false,
      data: [],
      periodColumns,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
