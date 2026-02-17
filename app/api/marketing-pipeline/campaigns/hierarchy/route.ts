/**
 * GET /api/marketing-pipeline/campaigns/hierarchy
 *
 * Fetches adset + ad level performance for a single campaign.
 * Requires ?externalId=<campaign_external_id>.
 * Optional: &start=YYYY-MM-DD&end=YYYY-MM-DD or &days=N (default 7).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac';
import { handleApiError } from '@/lib/server/apiErrorHandler';
import { getCampaignHierarchy } from '@/lib/marketing-pipeline/campaignPerformance';
import type { AppUser } from '@/types/user';

export const GET = withPermission(
  'tools.marketing_pipeline',
  'can_view',
  async (request: NextRequest, _user: AppUser): Promise<NextResponse> => {
    try {
      const { searchParams } = new URL(request.url);
      const externalId = searchParams.get('externalId');

      if (!externalId) {
        return NextResponse.json(
          { success: false, error: 'externalId is required' },
          { status: 400 },
        );
      }

      const now = new Date();
      const daysParam = searchParams.get('days');
      const defaultDays = daysParam ? parseInt(daysParam, 10) || 7 : 7;
      const defaultStart = new Date(now);
      defaultStart.setDate(defaultStart.getDate() - defaultDays);

      const startStr = searchParams.get('start');
      const endStr = searchParams.get('end');
      const start = startStr ? new Date(startStr) : defaultStart;
      const end = endStr ? new Date(endStr) : now;

      const data = await getCampaignHierarchy(externalId, { start, end });

      return NextResponse.json({ success: true, data });
    } catch (error) {
      return handleApiError(error, 'campaign-hierarchy');
    }
  },
);
