import { createQueryClient } from '@/lib/api/createApiClient';
import type { SaleRow } from '@/types/sales';

interface SalesQueryBody {
  dateRange: { start: string; end: string };
  includeCancelInfo?: boolean;
}

export const fetchCRMSales = createQueryClient<SalesQueryBody, SaleRow[]>(
  '/api/crm/sales'
);

export const fetchCRMTimeseries = createQueryClient<SalesQueryBody, SaleRow[]>(
  '/api/crm/timeseries'
);
