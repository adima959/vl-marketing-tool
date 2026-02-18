/**
 * PATCH /api/marketing-pipeline/messages/[messageId]/move
 * Move a message to a different pipeline stage (handles verdict logic)
 */

import { NextRequest, NextResponse } from 'next/server';
import { movePipelineMessage } from '@/lib/marketing-pipeline/db';
import { recordUpdate } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import { isValidUUID } from '@/lib/utils/validation';
import type { PipelineStage, VerdictType } from '@/types';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const VALID_STAGES: PipelineStage[] = [
  'backlog', 'production', 'testing', 'scaling', 'retired',
];

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

export const PATCH = withPermission('tools.marketing_pipeline', 'can_edit', async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    if (!isValidUUID(messageId)) {
      return NextResponse.json({ success: false, error: 'Invalid message ID' }, { status: 400 });
    }
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    const targetStage = body.targetStage as PipelineStage;
    const verdictType = body.verdictType as VerdictType | undefined;
    const verdictNotes = body.verdictNotes as string | undefined;

    if (!targetStage || !VALID_STAGES.includes(targetStage)) {
      return NextResponse.json(
        { success: false, error: 'Invalid target stage' },
        { status: 400 },
      );
    }

    const result = await movePipelineMessage(messageId, targetStage, verdictType, verdictNotes);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    await recordUpdate(
      'pipeline_message',
      messageId,
      { pipelineStage: 'unknown' },
      { pipelineStage: targetStage, verdictType, verdictNotes },
      changedBy,
    ).catch(err => console.error('Failed to record move history:', err));

    return NextResponse.json({
      success: true,
      data: { newMessageId: result.newMessageId },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error moving pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to move message' },
      { status: 500 },
    );
  }
});
