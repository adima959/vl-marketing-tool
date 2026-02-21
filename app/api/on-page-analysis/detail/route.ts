import { NextRequest, NextResponse } from 'next/server';
import { getTrackerDetail } from '@/lib/server/trackerQueryBuilder';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import type { OnPageDetailRequest } from '@/types/onPageDetails';
import { unstable_rethrow } from 'next/navigation';

interface RawPageViewRow {
  id: string;
  created_at: string;
  url_path: string;
  url_full: string | null;
  ff_visitor_id: string;
  session_id: string | null;
  visit_number: number | null;
  active_time_s: number | null;
  scroll_percent: number | null;
  hero_scroll_passed: boolean;
  form_view: boolean;
  form_started: boolean;
  cta_viewed: boolean;
  cta_clicked: boolean;
  device_type: string | null;
  country_code: string | null;
  page_type: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_medium: string | null;
  utm_term: string | null;
  keyword: string | null;
  placement: string | null;
  referrer: string | null;
  user_agent: string | null;
  language: string | null;
  platform: string | null;
  os_name: string | null;
  browser_name: string | null;
  fcp_s: string | null;
  lcp_s: string | null;
  tti_s: string | null;
  dcl_s: string | null;
  load_s: string | null;
  timezone: string | null;
  local_hour_of_day: number | null;
  form_errors: string | null;
  form_errors_detail: unknown;
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

    const { records: rawRows, total } = await getTrackerDetail({
      dateRange: {
        start: new Date(body.dateRange.start),
        end: new Date(body.dateRange.end),
      },
      dimensionFilters: body.dimensionFilters || {},
      metricId: body.metricId,
      page,
      pageSize,
    });

    const rows = rawRows as unknown as RawPageViewRow[];

    const records = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      urlPath: row.url_path,
      urlFull: row.url_full,
      ffVisitorId: row.ff_visitor_id,
      sessionId: row.session_id,
      visitNumber: row.visit_number != null ? Number(row.visit_number) : null,
      activeTimeS: row.active_time_s != null ? Number(row.active_time_s) : null,
      scrollPercent: row.scroll_percent != null ? Number(row.scroll_percent) : null,
      heroScrollPassed: Boolean(row.hero_scroll_passed),
      formView: Boolean(row.form_view),
      formStarted: Boolean(row.form_started),
      ctaViewed: Boolean(row.cta_viewed),
      ctaClicked: Boolean(row.cta_clicked),
      deviceType: row.device_type,
      countryCode: row.country_code,
      pageType: row.page_type,
      utmSource: row.utm_source,
      utmCampaign: row.utm_campaign,
      utmContent: row.utm_content,
      utmMedium: row.utm_medium,
      utmTerm: row.utm_term,
      keyword: row.keyword,
      placement: row.placement,
      referrer: row.referrer,
      userAgent: row.user_agent,
      language: row.language,
      platform: row.platform,
      osName: row.os_name,
      browserName: row.browser_name,
      fcpS: row.fcp_s != null ? Number(row.fcp_s) : null,
      lcpS: row.lcp_s != null ? Number(row.lcp_s) : null,
      ttiS: row.tti_s != null ? Number(row.tti_s) : null,
      dclS: row.dcl_s != null ? Number(row.dcl_s) : null,
      loadS: row.load_s != null ? Number(row.load_s) : null,
      timezone: row.timezone,
      localHourOfDay: row.local_hour_of_day,
      formErrors: Number(row.form_errors) || 0,
      formErrorsDetail: row.form_errors_detail as Array<{ field: string; error_count: number }> | null,
    }));

    return NextResponse.json({
      success: true,
      data: { records, total, page, pageSize },
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    const { message, statusCode } = maskErrorForClient(error, 'On-Page Detail API');
    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}

export const POST = withPermission('analytics.on_page_analysis', 'can_view', handleOnPageDetail);
