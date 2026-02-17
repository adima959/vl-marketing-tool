/**
 * POST /api/marketing-pipeline/campaigns — create a campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineCampaign } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import { createCampaignSchema } from '@/lib/schemas/marketingPipeline';
import type { AppUser } from '@/types/user';
import { ZodError } from 'zod';
import { unstable_rethrow } from 'next/navigation';

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate with Zod schema
    const body = createCampaignSchema.parse(rawBody);

    const campaign = await createPipelineCampaign({
      messageId: body.messageId,
      name: body.name || undefined,
      channel: body.channel,
      geo: body.geo,
      externalId: body.externalId || undefined,
      externalUrl: body.externalUrl || undefined,
    });

    await recordCreation(
      'campaign',
      campaign.id,
      campaign as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record campaign creation:', err));

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error creating campaign:', error);

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create campaign' },
      { status: 500 },
    );
  }
});
