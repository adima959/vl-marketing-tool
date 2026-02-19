import type { DateRange } from '@/lib/types/api';

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
  sessionId: string | null;
  visitNumber: number | null;
  activeTimeS: number | null;
  scrollPercent: number | null;
  heroScrollPassed: boolean;
  formView: boolean;
  formStarted: boolean;
  ctaViewed: boolean;
  ctaClicked: boolean;
  deviceType: string | null;
  countryCode: string | null;
  pageType: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmMedium: string | null;
  utmTerm: string | null;
  keyword: string | null;
  placement: string | null;
  referrer: string | null;
  userAgent: string | null;
  language: string | null;
  platform: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  fcpS: number | null;
  lcpS: number | null;
  ttiS: number | null;
  dclS: number | null;
  loadS: number | null;
  timezone: string | null;
  localHourOfDay: number | null;
  formErrors: number;
  formErrorsDetail: Array<{ field: string; error_count: number }> | null;
}

/**
 * API request body for on-page detail endpoint
 */
export interface OnPageDetailRequest {
  dateRange: { start: string; end: string };
  dimensionFilters: Record<string, string>;
  metricId?: string;
  pagination?: { page: number; pageSize: number };
}

