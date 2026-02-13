/**
 * POST /api/marketing-pipeline/messages — create a pipeline message (concept)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineMessage } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    if (!body.angleId || !body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'angleId and name are required' },
        { status: 400 },
      );
    }

    const message = await createPipelineMessage({
      angleId: body.angleId,
      name: body.name.trim(),
      description: body.description,
      pipelineStage: body.pipelineStage,
    });

    if (message) {
      recordCreation(
        'pipeline_message',
        message.id,
        message as unknown as Record<string, unknown>,
        changedBy,
      ).catch(err => console.error('Failed to record message creation:', err));
    }

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error creating pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create message' },
      { status: 500 },
    );
  }
});
