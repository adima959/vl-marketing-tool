/**
 * PATCH  /api/marketing-pipeline/campaigns/[campaignId] — update campaign
 * DELETE /api/marketing-pipeline/campaigns/[campaignId] — soft delete campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
updatePipelineCampaign,
  deletePipelineCampaign,
} from '@/lib/marketing-pipeline/db';
import { recordUpdate, recordDeletion } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

export const PATCH = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { campaignId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    const updated = await updatePipelineCampaign(campaignId, {
      channel: body.channel,
      geo: body.geo,
      externalId: body.externalId,
      externalUrl: body.externalUrl,
      status: body.status,
      spend: body.spend,
      conversions: body.conversions,
      cpa: body.cpa,
    });

    // Record history (non-blocking)
    recordUpdate(
      'campaign',
      campaignId,
      {} as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record campaign update:', err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error updating campaign:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update campaign' },
      { status: 500 },
    );
  }
});

export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { campaignId } = await params;
    const changedBy = await getChangedBy(request);

    await deletePipelineCampaign(campaignId);

    // Record history (non-blocking)
    recordDeletion(
      'campaign',
      campaignId,
      {} as Record<string, unknown>,
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
