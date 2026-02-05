import { executeMariaDBQuery } from './mariadb';
import {
  VALIDATION_RATE_DIMENSION_COLUMN_MAP,
  getValidationRateDimensionColumn,
} from '@/config/validationRateDimensions';
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
 * Rate type differences (the ONLY SQL-level change):
 * - approval: i.is_marked = 1 (no extra join)
 * - pay: ipr.date_paid IS NOT NULL (needs invoice_proccessed join)
 * - buy: ipr.date_bought IS NOT NULL (needs invoice_proccessed join)
 *
 * IMPORTANT: Table joins:
 *   subscription s
 *   → customer c (via s.customer_id)
 *   → invoice i (INNER JOIN via i.subscription_id, type=1 for trials)
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
    periods.push({
      key: `period_${periodIndex}`,
      label: formatPeriodLabel(currentStart, currentEnd, periodType),
      startDate: formatDateForSQL(currentStart),
      endDate: formatDateForSQL(currentEnd),
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
 * Format date as YYYY-MM-DD for SQL
 */
function formatDateForSQL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the SQL matched condition and extra JOIN based on rate type
 */
function getRateTypeConfig(rateType: ValidationRateType): {
  matchedCondition: string;
  extraJoin: string;
} {
  switch (rateType) {
    case 'approval':
      return {
        matchedCondition: 'AND i.is_marked = 1',
        extraJoin: '',
      };
    case 'pay':
      return {
        matchedCondition: 'AND ipr.date_paid IS NOT NULL',
        extraJoin: 'LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id',
      };
    case 'buy':
      return {
        matchedCondition: 'AND ipr.date_bought IS NOT NULL',
        extraJoin: 'LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id',
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

  const { matchedCondition, extraJoin } = getRateTypeConfig(rateType);
  const params: (string | number | boolean | null | Date)[] = [];

  // Build period SELECT columns
  const periodSelects = periods.map((period) => {
    // Add params for trial count (date range check)
    params.push(period.startDate, period.endDate);

    // Add params for matched count (same date range)
    params.push(period.startDate, period.endDate);

    return `
      COUNT(DISTINCT CASE
        WHEN DATE(s.date_create) BETWEEN ? AND ?
        THEN i.id
      END) as ${period.key}_trials,
      COUNT(DISTINCT CASE
        WHEN DATE(s.date_create) BETWEEN ? AND ?
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
    return `COUNT(DISTINCT CASE WHEN DATE(s.date_create) BETWEEN ? AND ? THEN i.id END) >= 3`;
  });
  const havingClause = `HAVING (${havingConditions.join(' OR ')})`;

  // Build full query
  const query = `
    SELECT
      ${dimensionColumn} AS dimension_value,
      ${periodSelects}
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = s.source_id
    ${extraJoin}
    WHERE 1=1
      ${parentWhereClause}
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
  return rows.map((row) => {
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
      attribute: dimensionValue,
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
