/**
 * POST /api/marketing-pipeline/messages — create a pipeline message (concept)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineMessage } from '@/lib/marketing-pipeline/db';
import { executeQuery } from '@/lib/server/db';
import { createDriveSubfolder } from '@/lib/server/googleDrive';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
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

    // Auto-create Drive subfolder if angle has a linked Drive folder
    let driveFolderId: string | undefined;
    const angleRows = await executeQuery<{ drive_folder_id: string | null }>(
      'SELECT drive_folder_id FROM app_pipeline_angles WHERE id = $1 AND deleted_at IS NULL',
      [body.angleId],
    );
    if (angleRows.length > 0 && angleRows[0].drive_folder_id) {
      const folderId = await createDriveSubfolder(angleRows[0].drive_folder_id, body.name.trim());
      if (folderId) driveFolderId = folderId;
    }

    const message = await createPipelineMessage({
      angleId: body.angleId,
      name: body.name.trim(),
      description: body.description,
      pipelineStage: body.pipelineStage,
      driveFolderId,
    });

    if (message) {
      await recordCreation(
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
