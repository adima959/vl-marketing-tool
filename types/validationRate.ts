/**
 * Validation Rate Report Types
 *
 * Shared types for all validation rate pages (approval, pay, buy).
 * Pivot-style report showing rates across time periods.
 * Rows: Hierarchical dimensions (country → source → product)
 * Columns: Dynamic time periods (weekly/biweekly/monthly)
 */

import type { DateRange } from './report';

// Rate type discriminator
export type ValidationRateType = 'approval' | 'pay' | 'buy';

// Time period options
export type TimePeriod = 'weekly' | 'biweekly' | 'monthly';

// A single time period column definition
export interface TimePeriodColumn {
  key: string;       // 'period_0', 'period_1', etc.
  label: string;     // 'Jan 1-7', 'Jan 8-14', 'January', etc.
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string;   // ISO date 'YYYY-MM-DD'
}

// Metric value for a single period (rate + count)
export interface ValidationRateMetric {
  rate: number;      // 0-1 scale (e.g., 0.85 = 85%)
  trials: number;    // Total trial count
  approved: number;  // Matched count (approved/paid/bought depending on rate type)
}

// A row in the validation rate table
export interface ValidationRateRow {
  key: string;                                        // 'SWEDEN::Adwords' (dimension values joined by ::)
  attribute: string;                                  // Display name for this row
  depth: number;                                      // 0=first dimension, 1=second, etc.
  hasChildren?: boolean;                              // True if row can be expanded
  children?: ValidationRateRow[];                     // Lazy-loaded child rows
  metrics: Record<string, ValidationRateMetric>;      // { period_0: { rate: 0.76, trials: 100, approved: 76 } }
}

// API request body
export interface ValidationRateQueryParams {
  rateType: ValidationRateType;
  dateRange: DateRange;
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  timePeriod: TimePeriod;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

// API response
export interface ValidationRateResponse {
  success: boolean;
  data: ValidationRateRow[];
  periodColumns: TimePeriodColumn[];
  error?: string;
}

// Store state interface
export interface ValidationRateState {
  // Time period
  timePeriod: TimePeriod;
  loadedTimePeriod: TimePeriod;
  periodColumns: TimePeriodColumn[];

  // Date range (active = editing, loaded = server truth)
  dateRange: DateRange;
  loadedDateRange: DateRange;

  // Dimensions
  dimensions: string[];
  loadedDimensions: string[];

  // Data
  reportData: ValidationRateRow[];
  expandedRowKeys: string[];

  // Sorting
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;

  // UI state
  isLoading: boolean;
  isLoadingSubLevels: boolean;
  hasUnsavedChanges: boolean;
  hasLoadedOnce: boolean;
}

// Store actions
export interface ValidationRateActions {
  // Time period
  setTimePeriod: (period: TimePeriod) => void;

  // Date range
  setDateRange: (range: DateRange) => void;

  // Dimensions
  addDimension: (id: string) => void;
  removeDimension: (id: string) => void;
  reorderDimensions: (newOrder: string[]) => void;

  // Expanded rows
  setExpandedRowKeys: (keys: string[]) => void;

  // Sorting
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;

  // Data loading
  loadData: () => Promise<void>;
  loadChildData: (parentKey: string, parentValue: string, parentDepth: number) => Promise<void>;

  // Loaded state setters (for URL sync)
  setLoadedDimensions: (dimensions: string[]) => void;
  setLoadedDateRange: (range: DateRange) => void;
  setLoadedTimePeriod: (period: TimePeriod) => void;
  setPeriodColumns: (columns: TimePeriodColumn[]) => void;
  setReportData: (data: ValidationRateRow[]) => void;

  // Reset
  resetFilters: () => void;
}

export type ValidationRateStore = ValidationRateState & ValidationRateActions;
