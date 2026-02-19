/**
 * GET /api/marketing-pipeline/campaigns/performance
 *
 * Fetches live performance data (ads + CRM + on-page) for all campaigns
 * belonging to a message. Requires ?messageId=<uuid>.
 * Optional: &days=N (default 7) or &start=YYYY-MM-DD&end=YYYY-MM-DD.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac';
import { handleApiError } from '@/lib/server/apiErrorHandler';
import { getCampaignPerformance } from '@/lib/marketing-pipeline/campaignPerformance';
import { executeQuery } from '@/lib/server/db';
import type { AppUser } from '@/types/user';

interface CampaignRow {
  id: string;
  external_id: string | null;
}

export const GET = withPermission(
  'tools.marketing_pipeline',
  'can_view',
  async (request: NextRequest, _user: AppUser): Promise<NextResponse> => {
    try {
      const { searchParams } = new URL(request.url);
      const messageId = searchParams.get('messageId');

      if (!messageId) {
        return NextResponse.json(
          { success: false, error: 'messageId is required' },
          { status: 400 },
        );
      }

      // Parse date range (default: last 7 days; also accepts &days=N shorthand)
      const now = new Date();
      const daysParam = searchParams.get('days');
      const defaultDays = daysParam ? parseInt(daysParam, 10) || 7 : 7;
      const defaultStart = new Date(now);
      defaultStart.setDate(defaultStart.getDate() - defaultDays);

      const startStr = searchParams.get('start');
      const endStr = searchParams.get('end');
      const start = startStr ? new Date(startStr) : defaultStart;
      const end = endStr ? new Date(endStr) : now;

      // Fetch campaigns for this message
      const campaigns = await executeQuery<CampaignRow>(
        `SELECT id, external_id FROM app_pipeline_campaigns
         WHERE message_id = $1 AND deleted_at IS NULL`,
        [messageId],
      );

      // Build externalId → campaignId mapping
      const idMapping = new Map<string, string[]>();
      for (const c of campaigns) {
        if (c.external_id) {
          const existing = idMapping.get(c.external_id);
          if (existing) existing.push(c.id);
          else idMapping.set(c.external_id, [c.id]);
        }
      }

      const externalIds = [...idMapping.keys()];

      // Fetch performance data from all 3 sources
      const perfByExternal = await getCampaignPerformance(externalIds, { start, end });

      // Map back to campaign IDs (a single externalId might appear on multiple campaigns)
      const result: Record<string, typeof perfByExternal[string]> = {};
      for (const [extId, perf] of Object.entries(perfByExternal)) {
        const campaignIds = idMapping.get(extId);
        if (campaignIds) {
          for (const cid of campaignIds) {
            result[cid] = perf;
          }
        }
      }

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, 'campaign-performance');
    }
  },
);
