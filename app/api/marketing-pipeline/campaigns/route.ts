/**
 * POST /api/marketing-pipeline/campaigns — create a campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineCampaign } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { Channel, Geography } from '@/types';
import type { AppUser } from '@/types/user';

const VALID_CHANNELS: Channel[] = ['meta', 'google', 'taboola', 'other'];
const VALID_GEOS: Geography[] = ['NO', 'SE', 'DK'];

export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate required fields
    if (!body.messageId || !body.channel || !body.geo) {
      return NextResponse.json(
        { success: false, error: 'messageId, channel, and geo are required' },
        { status: 400 },
      );
    }

    if (!VALID_CHANNELS.includes(body.channel)) {
      return NextResponse.json(
        { success: false, error: 'Invalid channel' },
        { status: 400 },
      );
    }

    if (!VALID_GEOS.includes(body.geo)) {
      return NextResponse.json(
        { success: false, error: 'Invalid geo' },
        { status: 400 },
      );
    }

    const campaign = await createPipelineCampaign({
      messageId: body.messageId,
      channel: body.channel,
      geo: body.geo,
      externalId: body.externalId,
      externalUrl: body.externalUrl,
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
    return NextResponse.json(
      { success: false, error: 'Failed to create campaign' },
      { status: 500 },
    );
  }
});
