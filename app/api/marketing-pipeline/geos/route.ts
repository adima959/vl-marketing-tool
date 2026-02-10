/**
 * POST /api/marketing-pipeline/geos — add a geo to a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { addMessageGeo } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { Geography } from '@/types';
import type { AppUser } from '@/types/user';

const VALID_GEOS: Geography[] = ['NO', 'SE', 'DK'];

export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    if (!body.messageId || !body.geo) {
      return NextResponse.json(
        { success: false, error: 'messageId and geo are required' },
        { status: 400 },
      );
    }

    if (!VALID_GEOS.includes(body.geo)) {
      return NextResponse.json(
        { success: false, error: 'Invalid geo' },
        { status: 400 },
      );
    }

    const geo = await addMessageGeo({
      messageId: body.messageId,
      geo: body.geo,
      isPrimary: body.isPrimary,
      spendThreshold: body.spendThreshold,
    });

    recordCreation(
      'pipeline_message',
      geo.id,
      geo as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record geo creation:', err));

    return NextResponse.json({ success: true, data: geo });
  } catch (error) {
    console.error('Error adding message geo:', error);
    const message = error instanceof Error ? error.message : 'Failed to add geo';
    const status = message.includes('unique') || message.includes('duplicate') ? 409 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
});
