/**
 * PATCH  /api/marketing-pipeline/angles/[angleId] — rename a pipeline angle
 * DELETE /api/marketing-pipeline/angles/[angleId] — soft-delete a pipeline angle
 */

import { NextRequest, NextResponse } from 'next/server';
import { deletePipelineAngle, getAngleMessageCount, updatePipelineAngle } from '@/lib/marketing-pipeline/db';
import { executeQuery } from '@/lib/server/db';
import { renameDriveFolder } from '@/lib/server/googleDrive';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const PATCH = withPermission('admin.data_maps', 'can_edit', async (
  request: NextRequest,
  _user: AppUser,
  { params }: { params: Promise<{ angleId: string }> },
): Promise<NextResponse> => {
  try {
    const { angleId } = await params;
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    const angle = await updatePipelineAngle(angleId, { name });

    // Rename Drive folder in background (non-blocking)
    if (angle.driveFolderId) {
      renameDriveFolder(angle.driveFolderId, name).catch(() => {});
    }

    return NextResponse.json({ success: true, data: angle });
  } catch (error) {
    unstable_rethrow(error);
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

    if (!angleId) {
      return NextResponse.json(
        { success: false, error: 'angleId is required' },
        { status: 400 },
      );
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
