/**
 * GET    /api/marketing-pipeline/messages/[messageId] — message detail
 * PATCH  /api/marketing-pipeline/messages/[messageId] — update fields
 * DELETE /api/marketing-pipeline/messages/[messageId] — soft delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import {
  getPipelineMessageDetail,
  updatePipelineMessage,
  deletePipelineMessage,
} from '@/lib/marketing-pipeline/db';
import { updatePipelineMessageSchema } from '@/lib/schemas/marketingPipeline';
import { recordUpdate, recordDeletion } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { renameDriveFolder, moveDriveFolder } from '@/lib/server/googleDrive';
import { executeQuery } from '@/lib/server/db';
import { withPermission } from '@/lib/rbac';
import { isValidUUID } from '@/lib/utils/validation';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

export const GET = withPermission('tools.marketing_pipeline', 'can_view', async (
  _request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    if (!isValidUUID(messageId)) {
      return NextResponse.json({ success: false, error: 'Invalid message ID' }, { status: 400 });
    }
    const detail = await getPipelineMessageDetail(messageId);

    if (!detail) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: detail });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch message' },
      { status: 500 },
    );
  }
});

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
    const rawBody = await request.json();
    const body = updatePipelineMessageSchema.parse(rawBody);
    const changedBy = await getChangedBy(request);

    // Get old state for history diff
    const oldMessage = await getPipelineMessageDetail(messageId);
    if (!oldMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    const updated = await updatePipelineMessage(messageId, {
      name: body.name,
      description: body.description ?? undefined,
      angleId: body.angleId,
      specificPainPoint: body.specificPainPoint ?? undefined,
      corePromise: body.corePromise ?? undefined,
      keyIdea: body.keyIdea ?? undefined,
      primaryHookDirection: body.primaryHookDirection ?? undefined,
      headlines: body.headlines,
      copyVariations: body.copyVariations,
      spendThreshold: body.spendThreshold ?? undefined,
      notes: body.notes ?? undefined,
    });

    // Move Drive folder if angle changed (non-blocking)
    if (body.angleId && body.angleId !== oldMessage.angle?.id && updated?.driveFolderId && oldMessage.angle?.driveFolderId) {
      const newAngleRows = await executeQuery<{ drive_folder_id: string | null }>(
        'SELECT drive_folder_id FROM app_pipeline_angles WHERE id = $1 AND deleted_at IS NULL',
        [body.angleId],
      );
      const newAngleFolderId = newAngleRows[0]?.drive_folder_id;
      if (newAngleFolderId) {
        moveDriveFolder(updated.driveFolderId, newAngleFolderId, oldMessage.angle.driveFolderId).catch(() => {});
      }
    }

    // Rename Drive folder in background if name changed (non-blocking)
    if (body.name && body.name !== oldMessage.name && updated?.driveFolderId) {
      renameDriveFolder(updated.driveFolderId, body.name).catch(() => {});
    }

    // Record history before responding so the client can fetch it immediately
    await recordUpdate(
      'pipeline_message',
      messageId,
      oldMessage as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record pipeline message history:', err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid request data' }, { status: 400 });
    }
    console.error('Error updating pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message' },
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
    const { messageId } = await params;
    if (!isValidUUID(messageId)) {
      return NextResponse.json({ success: false, error: 'Invalid message ID' }, { status: 400 });
    }
    const changedBy = await getChangedBy(request);

    const existing = await getPipelineMessageDetail(messageId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    await deletePipelineMessage(messageId);

    // Rename Drive folder to signal deletion (non-blocking)
    if (existing.driveFolderId) {
      renameDriveFolder(existing.driveFolderId, `[deleted] ${existing.name}`).catch(() => {});
    }

    await recordDeletion(
      'pipeline_message',
      messageId,
      existing as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record message deletion:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error deleting pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete message' },
      { status: 500 },
    );
  }
});
