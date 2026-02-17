/**
 * POST /api/marketing-pipeline/geos — add a geo to a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { addMessageGeo } from '@/lib/marketing-pipeline/db';
import { executeQuery } from '@/lib/server/db';
import { createDriveSubfolder } from '@/lib/server/googleDrive';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { Geography } from '@/types';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const VALID_GEOS: Geography[] = ['NO', 'SE', 'DK'];

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
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

    // Create Drive subfolder for this geo inside the message's Drive folder
    let driveFolderId: string | undefined;
    const msgRows = await executeQuery<{ drive_folder_id: string | null }>(
      'SELECT drive_folder_id FROM app_pipeline_messages WHERE id = $1 AND deleted_at IS NULL',
      [body.messageId],
    );
    if (msgRows[0]?.drive_folder_id) {
      const folderId = await createDriveSubfolder(msgRows[0].drive_folder_id, body.geo);
      if (folderId) driveFolderId = folderId;
    }

    const geo = await addMessageGeo({
      messageId: body.messageId,
      geo: body.geo,
      isPrimary: body.isPrimary,
      spendThreshold: body.spendThreshold,
      driveFolderId,
    });

    await recordCreation(
      'pipeline_message',
      geo.id,
      geo as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record geo creation:', err));

    return NextResponse.json({ success: true, data: geo });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error adding message geo:', error);
    const message = error instanceof Error ? error.message : 'Failed to add geo';
    const status = message.includes('unique') || message.includes('duplicate') ? 409 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
});
