/**
 * PATCH  /api/marketing-pipeline/angles/[angleId] — update a pipeline angle
 * DELETE /api/marketing-pipeline/angles/[angleId] — soft-delete a pipeline angle
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deletePipelineAngle, getAngleMessageCount, updatePipelineAngle } from '@/lib/marketing-pipeline/db';
import { executeQuery } from '@/lib/server/db';
import { renameDriveFolder } from '@/lib/server/googleDrive';
import { updatePipelineAngleSchema } from '@/lib/schemas/marketingPipeline';
import { withPermission } from '@/lib/rbac';
import { isValidUUID } from '@/lib/utils/validation';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const PATCH = withPermission('admin.data_maps', 'can_edit', async (
  request: NextRequest,
  _user: AppUser,
  { params }: { params: Promise<{ angleId: string }> },
): Promise<NextResponse> => {
  try {
    const { angleId } = await params;
    if (!isValidUUID(angleId)) {
      return NextResponse.json({ success: false, error: 'Invalid angle ID' }, { status: 400 });
    }
    const rawBody = await request.json();
    const body = updatePipelineAngleSchema.parse(rawBody);

    // Build update data from all provided fields
    const updateData: Record<string, string> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description ?? '';
    if (body.targetAudience !== undefined) updateData.targetAudience = body.targetAudience ?? '';
    if (body.emotionalDriver !== undefined) updateData.emotionalDriver = body.emotionalDriver ?? '';

    const angle = await updatePipelineAngle(angleId, updateData);

    // Rename Drive folder in background if name changed (non-blocking)
    if (body.name && angle.driveFolderId) {
      renameDriveFolder(angle.driveFolderId, body.name).catch(() => {});
    }

    return NextResponse.json({ success: true, data: angle });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid request data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to update angle' }, { status: 500 });
  }
});

export const DELETE = withPermission('tools.marketing_pipeline', 'can_delete', async (
  _request: NextRequest,
  user: AppUser,
  { params }: { params: Promise<{ angleId: string }> },
): Promise<NextResponse> => {
  try {
    const { angleId } = await params;
    if (!isValidUUID(angleId)) {
      return NextResponse.json({ success: false, error: 'Invalid angle ID' }, { status: 400 });
    }

    // Check if angle has messages — prevent deletion if so
    const messageCount = await getAngleMessageCount(angleId);
    if (messageCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete angle with ${messageCount} message(s). Remove messages first.` },
        { status: 409 },
      );
    }

    // Fetch name + Drive folder ID before soft-deleting
    const rows = await executeQuery<{ name: string; drive_folder_id: string | null }>(
      'SELECT name, drive_folder_id FROM app_pipeline_angles WHERE id = $1 AND deleted_at IS NULL',
      [angleId],
    );

    await deletePipelineAngle(angleId);

    // Rename Drive folder to signal deletion (non-blocking)
    if (rows[0]?.drive_folder_id) {
      renameDriveFolder(rows[0].drive_folder_id, `[deleted] ${rows[0].name}`).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete angle' },
      { status: 500 },
    );
  }
});
