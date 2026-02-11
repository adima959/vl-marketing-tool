import { executeMariaDBQuery } from './mariadb';
import { CRM_WHERE } from './crmMetrics';
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
 * Uses ? placeholders for MariaDB (NOT $1, $2 like PostgreSQL).
 *
 * Rate type differences:
 * - approval: Trial invoices only (type=1), date by s.date_create, matched = is_marked=1
 * - pay: ALL invoices except refunds (type!=4), date by i.order_date, matched = date_paid IS NOT NULL
 * - buy: Processed invoices only (INNER JOIN invoice_proccessed), date by i.invoice_date, matched = date_bought IS NOT NULL
 *
 * IMPORTANT for Buy Rate (matches CRM):
 * - Uses invoice_date (not order_date) - this is when invoice was finalized
 * - Only counts invoices in invoice_proccessed table (INNER JOIN, not LEFT JOIN)
 * - Country matching is case-insensitive
 *
 * IMPORTANT: Table joins:
 *   subscription s
 *   → customer c (via s.customer_id)
 *   → invoice i (INNER JOIN via i.subscription_id)
 *   → invoice_product ip (via ip.invoice_id)
 *   → product p (via ip.product_id)
 *   → source sr (via s.source_id)
 *   → invoice_proccessed ipr (via ipr.invoice_id) [pay/buy only]
 */

// Raw row from MariaDB query
interface RawValidationRow {
  dimension_value: string | null;
  [key: string]: string | number | null; // Dynamic period columns
}

/**
 * Generate time period columns based on date range and period type
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

  // Clone dates to avoid mutation
  let currentEnd = new Date(endDate);
  let currentStart: Date = new Date(endDate);
  let periodIndex = 0;

  // Work backwards from end date
  while (currentEnd >= startDate) {
    switch (periodType) {
      case 'weekly':
        // 7-day intervals
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() - 6);
        break;

      case 'biweekly':
        // Half-month boundaries: 1-14 and 15-end of month
        if (currentEnd.getDate() >= 15) {
          // Second half: 15 to end of month
          currentStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 15);
        } else {
          // First half: 1 to 14
          currentStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 1);
        }
        break;

      case 'monthly':
        // Calendar month
        currentStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 1);
        break;
    }

    // Don't go before the requested start date
    if (currentStart < startDate) {
      currentStart = new Date(startDate);
    }

    // Create period column
    // Use full datetime format (with time) to allow index usage on datetime columns
    periods.push({
      key: `period_${periodIndex}`,
      label: formatPeriodLabel(currentStart, currentEnd, periodType),
      startDate: formatDateForSQL(currentStart, false),  // 00:00:00
      endDate: formatDateForSQL(currentEnd, true),       // 23:59:59
    });

    // Move to previous period
    if (periodType === 'monthly') {
      // Go to last day of previous month
      currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() - 1);
    } else if (periodType === 'biweekly') {
      // Go to end of previous half-month
      if (currentStart.getDate() === 15) {
        // Was second half, go to 14th of same month
        currentEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 14);
      } else {
        // Was first half, go to end of previous month
        currentEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0);
      }
    } else {
      // Weekly: Go back by period length
      currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() - 1);
    }

    periodIndex++;

    // Safety: Max 52 periods (1 year of weeks)
    if (periodIndex > 52) break;
  }

  // Reverse so oldest is first (left to right in table)
  return periods.reverse();
}

/**
 * Format period label for display
 */
function formatPeriodLabel(start: Date, end: Date, periodType: TimePeriod): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (periodType === 'monthly') {
    // Show month name + year if different from current year
    const monthName = months[start.getMonth()];
    const currentYear = new Date().getFullYear();
    if (start.getFullYear() !== currentYear) {
      return `${monthName} ${start.getFullYear()}`;
    }
    return monthName;
  }

  // Weekly/biweekly: Show date range
  const startMonth = months[start.getMonth()];
  const endMonth = months[end.getMonth()];
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

/**
 * Format date as YYYY-MM-DD HH:MM:SS for SQL
 *
 * @param date - Date to format
 * @param endOfDay - If true, use 23:59:59; if false, use 00:00:00
 *
 * Using full datetime format allows MySQL/MariaDB to use indexes on datetime columns
 * (vs using DATE() function which prevents index usage)
 */
function formatDateForSQL(date: Date, endOfDay: boolean = false): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return `${year}-${month}-${day} ${time}`;
}

/**
 * Get the SQL matched condition, extra JOIN, invoice filter, and date field based on rate type
 *
 * Rate type differences:
 * - approval: Only trial invoices (type=1), date by subscription creation, matched = is_marked=1
 * - pay: Processed invoices only (INNER JOIN invoice_proccessed), date by invoice_date, matched = date_paid IS NOT NULL
 * - buy: Processed invoices only (INNER JOIN invoice_proccessed), date by invoice_date, matched = date_bought IS NOT NULL
 */
function getRateTypeConfig(rateType: ValidationRateType): {
  matchedCondition: string;
  extraJoin: string;
  invoiceFilter: string;
  dateField: string;
} {
  switch (rateType) {
    case 'approval':
      return {
        matchedCondition: 'AND i.is_marked = 1',
        extraJoin: '',
        invoiceFilter: 'AND i.type = 1', // Only trial invoices for approval rate
        dateField: 's.date_create', // Subscription creation date for approval (no DATE() wrapper for index usage)
      };
    case 'pay':
      // Pay rate uses invoice_date and only counts processed invoices (matches CRM)
      // - invoice_date: When invoice was finalized (not order_date which is creation)
      // - INNER JOIN: Only count invoices that exist in invoice_proccessed table
      // NOTE: No DATE() wrapper to allow index usage - use datetime range comparison instead
      return {
        matchedCondition: 'AND ipr.date_paid IS NOT NULL',
        extraJoin: 'INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id',
        invoiceFilter: 'AND i.type != 4', // Exclude refunds for pay rate
        dateField: 'i.invoice_date', // Invoice finalization date for pay (no DATE() wrapper for index usage)
      };
    case 'buy':
      // Buy rate uses invoice_date and only counts processed invoices (matches CRM)
      // - invoice_date: When invoice was finalized (not order_date which is creation)
      // - INNER JOIN: Only count invoices that exist in invoice_proccessed table
      // NOTE: No DATE() wrapper to allow index usage - use datetime range comparison instead
      return {
        matchedCondition: 'AND ipr.date_bought IS NOT NULL',
        extraJoin: 'INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id',
        invoiceFilter: 'AND i.type != 4', // Exclude refunds for buy rate
        dateField: 'i.invoice_date', // Invoice finalization date for buy (no DATE() wrapper for index usage)
      };
  }
}

/**
 * Build SQL query for validation rates with dynamic period columns
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

  const { matchedCondition, extraJoin, invoiceFilter, dateField } = getRateTypeConfig(rateType);
  const params: (string | number | boolean | null | Date)[] = [];

  // Build period SELECT columns
  const periodSelects = periods.map((period) => {
    // Add params for trial count (date range check)
    params.push(period.startDate, period.endDate);

    // Add params for matched count (same date range)
    params.push(period.startDate, period.endDate);

    return `
      COUNT(DISTINCT CASE
        WHEN ${dateField} BETWEEN ? AND ?
        THEN i.id
      END) as ${period.key}_trials,
      COUNT(DISTINCT CASE
        WHEN ${dateField} BETWEEN ? AND ?
        ${matchedCondition}
        THEN i.id
      END) as ${period.key}_approved`;
  }).join(',\n      ');

  // Build parent filter WHERE clause
  let parentWhereClause = '';
  if (parentFilters && Object.keys(parentFilters).length > 0) {
    const parentConditions: string[] = [];

    for (const [dim, value] of Object.entries(parentFilters)) {
      const parentColumn = VALIDATION_RATE_DIMENSION_COLUMN_MAP[dim];
      if (!parentColumn) continue;

      if (value === 'Unknown' || value === '') {
        // Handle NULL values
        parentConditions.push(`(${parentColumn} IS NULL OR ${parentColumn} = '')`);
      } else if (dim === 'country') {
        // Case-insensitive matching for country (matches CRM behavior)
        parentConditions.push(`LOWER(${parentColumn}) = LOWER(?)`);
        params.push(value);
      } else {
        parentConditions.push(`${parentColumn} = ?`);
        params.push(value);
      }
    }

    if (parentConditions.length > 0) {
      parentWhereClause = `AND ${parentConditions.join(' AND ')}`;
    }
  }

  // Build HAVING clause to filter out dimension values below display threshold
  // Matches MIN_SUBSCRIPTIONS_THRESHOLD (3) in ValidationRateCell.tsx
  // Rows where no period reaches 3+ trials would have all cells hidden
  const havingConditions = periods.map((period) => {
    params.push(period.startDate, period.endDate);
    return `COUNT(DISTINCT CASE WHEN ${dateField} BETWEEN ? AND ? THEN i.id END) >= 3`;
  });
  const havingClause = `HAVING (${havingConditions.join(' OR ')})`;

  // Get overall date range for WHERE clause (critical for performance!)
  // This allows the database to filter rows BEFORE aggregation
  // Periods are already sorted oldest-first, so first period has earliest start, last has latest end
  const overallStartDate = periods[0].startDate;
  const overallEndDate = periods[periods.length - 1].endDate;

  // Build full query
  // Filter out NULL/empty dimension values at SQL level to prevent empty rows
  // Use multiple checks: COALESCE for NULL, TRIM for whitespace, LENGTH for any remaining edge cases
  // CRITICAL: The date range WHERE clause dramatically improves performance by filtering
  // rows before aggregation instead of scanning all rows
  const query = `
    SELECT
      ${dimensionColumn} AS dimension_value,
      ${periodSelects}
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = s.source_id
    ${extraJoin}
    WHERE 1=1
      ${invoiceFilter}
      AND ${CRM_WHERE.upsellExclusion}
      AND ${dateField} BETWEEN ? AND ?
      AND ${dimensionColumn} IS NOT NULL
      AND LENGTH(TRIM(${dimensionColumn})) > 0
      ${parentWhereClause}
    GROUP BY ${dimensionColumn}
    ${havingClause}
    ORDER BY ${dimensionColumn}
  `;

  // Add the overall date range params at the correct position (after periodSelects params, before parent filter params)
  // We need to insert them right after the period SELECT params but before the HAVING params
  // Actually, params are built in order, so we need to add these at the right spot
  // The current param order is: [periodSelects params...][parentFilter params...][having params...]
  // We need: [periodSelects params...][overall date range params][parentFilter params...][having params...]

  // Since we've already built params, we need to rebuild or insert at the right position
  // For simplicity, let's add the date range params right after periodSelects (before parentFilters)
  // Find the insertion point: after period params (4 per period) = periods.length * 4
  const insertIndex = periods.length * 4;
  params.splice(insertIndex, 0, overallStartDate, overallEndDate);

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
