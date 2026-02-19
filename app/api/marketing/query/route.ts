import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMarketingDataFlat } from '@/lib/server/marketingQueryBuilder';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { handleApiError } from '@/lib/server/apiErrorHandler';

const requestSchema = z.object({
  dateRange: z.object({
    start: z.string().date('start must be YYYY-MM-DD'),
    end: z.string().date('end must be YYYY-MM-DD'),
  }),
  dimensions: z.array(z.string()).min(1),
  filters: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains']),
    value: z.string(),
  })).optional(),
});

/**
 * POST /api/marketing/query
 *
 * Returns flat rows grouped by ALL requested dimensions in a single query.
 * Each row contains dimension values + base metrics (cost, clicks, impressions, conversions).
 * The client builds the hierarchical tree and computes derived metrics.
 */
async function handleMarketingQuery(
  request: NextRequest,
  _user: AppUser,
): Promise<NextResponse> {
  try {
    const body = requestSchema.parse(await request.json());

    const rows = await getMarketingDataFlat({
      dateRange: {
        start: new Date(body.dateRange.start),
        end: new Date(body.dateRange.end),
      },
      dimensions: body.dimensions,
      filters: body.filters,
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    return handleApiError(error, 'Marketing API');
  }
}

export const POST = withPermission('analytics.marketing_report', 'can_view', handleMarketingQuery);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'ok', endpoint: '/api/marketing/query', methods: ['POST'] });
}
