/**
 * PATCH  /api/marketing-pipeline/campaigns/[campaignId] — update campaign
 * DELETE /api/marketing-pipeline/campaigns/[campaignId] — soft delete campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import {
  getPipelineCampaignById,
  updatePipelineCampaign,
  deletePipelineCampaign,
} from '@/lib/marketing-pipeline/db';
import { updateCampaignSchema } from '@/lib/schemas/marketingPipeline';
import { recordUpdate, recordDeletion } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import { isValidUUID } from '@/lib/utils/validation';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

export const PATCH = withPermission('tools.marketing_pipeline', 'can_edit', async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { campaignId } = await params;
    if (!isValidUUID(campaignId)) {
      return NextResponse.json({ success: false, error: 'Invalid campaign ID' }, { status: 400 });
    }
    const rawBody = await request.json();
    const body = updateCampaignSchema.parse(rawBody);
    const changedBy = await getChangedBy(request);

    const existing = await getPipelineCampaignById(campaignId);

    const updated = await updatePipelineCampaign(campaignId, {
      channel: body.channel,
      geo: body.geo,
      externalId: body.externalId ?? undefined,
      externalUrl: body.externalUrl ?? undefined,
      spend: body.spend ?? undefined,
      conversions: body.conversions ?? undefined,
      cpa: body.cpa ?? undefined,
    });

    await recordUpdate(
      'campaign',
      campaignId,
      (existing ?? {}) as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record campaign update:', err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid request data' }, { status: 400 });
    }
    console.error('Error updating campaign:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update campaign' },
      { status: 500 },
    );
  }
});

export const DELETE = withPermission('tools.marketing_pipeline', 'can_delete', async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { campaignId } = await params;
    if (!isValidUUID(campaignId)) {
      return NextResponse.json({ success: false, error: 'Invalid campaign ID' }, { status: 400 });
    }
    const changedBy = await getChangedBy(request);

    const existing = await getPipelineCampaignById(campaignId);

    await deletePipelineCampaign(campaignId);

    await recordDeletion(
      'campaign',
      campaignId,
      (existing ?? { id: campaignId }) as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record campaign deletion:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete campaign' },
      { status: 500 },
    );
  }
});
