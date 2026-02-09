import type { DateRange } from '@/types';

/**
 * Context passed when a metric cell is clicked in On-Page Analysis
 * Uses generic dimension filters since dimensions are user-selected
 */
export interface OnPageViewClickContext {
  metricId: string;
  metricLabel: string;
  value: number;
  filters: {
    dateRange: DateRange;
    dimensionFilters: Record<string, string>; // dimension ID → value
  };
}

/**
 * Individual page view record shown in the detail modal
 */
export interface OnPageDetailRecord {
  id: string;
  createdAt: string;
  urlPath: string;
  urlFull: string | null;
  ffVisitorId: string;
  visitNumber: number | null;
  activeTimeS: number | null;
  scrollPercent: number | null;
  heroScrollPassed: boolean;
  formView: boolean;
  formStarted: boolean;
  deviceType: string | null;
  countryCode: string | null;
  pageType: string | null;
}

/**
 * Page type tab with count, sorted by count descending
 */
export interface PageTypeSummary {
  pageType: string;
  count: number;
}

/**
 * API request body for on-page detail endpoint
 */
export interface OnPageDetailRequest {
  dateRange: { start: string; end: string };
  dimensionFilters: Record<string, string>;
  metricId?: string;
  pageTypeFilter?: string;
  pagination?: { page: number; pageSize: number };
}

