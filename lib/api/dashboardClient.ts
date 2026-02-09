import { serializeQueryParams, formatLocalDate } from '@/lib/types/api';
import type { QueryParams, QueryRequest } from '@/lib/types/api';
import type { DashboardRow, DateRange, TimeSeriesDataPoint } from '@/types/dashboard';
import { createQueryClient } from '@/lib/api/createApiClient';

const queryDashboard = createQueryClient<QueryRequest, DashboardRow[]>('/api/dashboard/query');

/**
 * Fetch dashboard data from API with timeout support
 */
export async function fetchDashboardData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<DashboardRow[]> {
  const body = serializeQueryParams(params);
  return queryDashboard(body, timeoutMs);
}

interface TimeSeriesBody {
  dateRange: { start: string; end: string };
}

const queryTimeSeries = createQueryClient<TimeSeriesBody, TimeSeriesDataPoint[]>('/api/dashboard/timeseries');

/**
 * Fetch time series data for dashboard chart
 */
export async function fetchDashboardTimeSeries(
  dateRange: DateRange,
  timeoutMs: number = 30000
): Promise<TimeSeriesDataPoint[]> {
  const body = {
    dateRange: {
      start: formatLocalDate(dateRange.start),
      end: formatLocalDate(dateRange.end),
    },
  };
  return queryTimeSeries(body, timeoutMs);
}
