import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { onPageQueryBuilder } from '@/lib/server/onPageQueryBuilder';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import type { OnPageDetailRequest } from '@/types/onPageDetails';

interface RawPageViewRow {
  id: string;
  created_at: string;
  url_path: string;
  url_full: string | null;
  ff_visitor_id: string;
  visit_number: number | null;
  active_time_s: number | null;
  scroll_percent: number | null;
  hero_scroll_passed: boolean;
  form_view: boolean;
  form_started: boolean;
  device_type: string | null;
  country_code: string | null;
  page_type: string | null;
}

/**
 * POST /api/on-page-analysis/detail
 * Returns individual page view records + page type summary for tabs
 */
async function handleOnPageDetail(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body: OnPageDetailRequest = await request.json();

    if (!body.dateRange?.start || !body.dateRange?.end) {
      const error = createValidationError('dateRange is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const page = body.pagination?.page ?? 1;
    const pageSize = body.pagination?.pageSize ?? 100;

    const { query, countQuery, summaryQuery, params, summaryParams } =
      onPageQueryBuilder.buildDetailQuery({
        dateRange: {
          start: new Date(body.dateRange.start),
          end: new Date(body.dateRange.end),
        },
        dimensionFilters: body.dimensionFilters || {},
        metricId: body.metricId,
        pageTypeFilter: body.pageTypeFilter,
        page,
        pageSize,
      });

    const [rows, countResult, summaryResult] = await Promise.all([
      executeQuery<RawPageViewRow>(query, params),
      executeQuery<{ total: string }>(countQuery, params),
      executeQuery<{ page_type: string; count: string }>(summaryQuery, summaryParams),
    ]);

    const total = Number(countResult[0]?.total) || 0;

    const records = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      urlPath: row.url_path,
      urlFull: row.url_full,
      ffVisitorId: row.ff_visitor_id,
      visitNumber: row.visit_number != null ? Number(row.visit_number) : null,
      activeTimeS: row.active_time_s != null ? Number(row.active_time_s) : null,
      scrollPercent: row.scroll_percent != null ? Number(row.scroll_percent) : null,
      heroScrollPassed: Boolean(row.hero_scroll_passed),
      formView: Boolean(row.form_view),
      formStarted: Boolean(row.form_started),
      deviceType: row.device_type,
      countryCode: row.country_code,
      pageType: row.page_type,
    }));

    const pageTypeSummary = summaryResult.map((r) => ({
      pageType: r.page_type,
      count: Number(r.count),
    }));

    return NextResponse.json({
      success: true,
      data: { records, total, page, pageSize, pageTypeSummary },
    });
  } catch (error: unknown) {
    const { message, statusCode } = maskErrorForClient(error, 'On-Page Detail API');
    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}

export const POST = withAuth(handleOnPageDetail);
