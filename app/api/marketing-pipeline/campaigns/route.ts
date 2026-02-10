/**
 * POST /api/marketing-pipeline/campaigns — create a campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineCampaign } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import { createCampaignSchema } from '@/lib/schemas/marketingPipeline';
import type { AppUser } from '@/types/user';

export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate with Zod schema
    const body = createCampaignSchema.parse(rawBody);

    const campaign = await createPipelineCampaign({
      messageId: body.messageId,
      channel: body.channel,
      geo: body.geo,
      externalId: body.externalId || undefined,
      externalUrl: body.externalUrl || undefined,
    });

    // Record history (non-blocking)
    recordCreation(
      'campaign',
      campaign.id,
      campaign as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record campaign creation:', err));

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);

    // Handle Zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: (error as any).issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create campaign' },
      { status: 500 },
    );
  }
});
