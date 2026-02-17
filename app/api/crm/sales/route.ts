import { NextRequest, NextResponse } from 'next/server';
import { fetchCRMSales } from '@/lib/server/crmQueryBuilder';
import { salesQueryRequestSchema } from '@/lib/schemas/api';
import { withPermission } from '@/lib/rbac';
import { handleApiError } from '@/lib/server/apiErrorHandler';
import type { AppUser } from '@/types/user';
import type { SaleRow } from '@/types/sales';

interface SalesQueryResponse {
  success: boolean;
  data?: SaleRow[];
  error?: string;
}

/**
 * POST /api/crm/sales
 * Returns flat sale rows for the given date range.
 * Frontend aggregates by dimensions client-side.
 */
async function handleCRMSalesQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse<SalesQueryResponse>> {
  try {
    const rawBody = await request.json();
    const body = salesQueryRequestSchema.parse(rawBody);

    const dateRange = {
      start: new Date(body.dateRange.start),
      end: new Date(body.dateRange.end),
    };

    const data = await fetchCRMSales(dateRange, {
      includeCancelInfo: body.includeCancelInfo,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return handleApiError(error, 'CRM sales query');
  }
}

export const POST = withPermission('analytics.dashboard', 'can_view', handleCRMSalesQuery);
