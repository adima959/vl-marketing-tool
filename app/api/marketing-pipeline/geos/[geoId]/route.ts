/**
 * PATCH  /api/marketing-pipeline/geos/[geoId] — update geo stage/fields
 * DELETE /api/marketing-pipeline/geos/[geoId] — soft delete geo
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateMessageGeo, deleteMessageGeo } from '@/lib/marketing-pipeline/db';
import { recordUpdate, recordDeletion } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { GeoStage } from '@/types';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const VALID_GEO_STAGES: GeoStage[] = ['setup', 'production', 'testing', 'live', 'paused'];

interface RouteParams {
  params: Promise<{ geoId: string }>;
}

export const PATCH = withPermission('tools.marketing_pipeline', 'can_edit', async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { geoId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    if (body.stage && !VALID_GEO_STAGES.includes(body.stage)) {
      return NextResponse.json(
        { success: false, error: 'Invalid geo stage' },
        { status: 400 },
      );
    }

    const updated = await updateMessageGeo(geoId, {
      stage: body.stage,
      spendThreshold: body.spendThreshold,
      notes: body.notes,
      launchedAt: body.launchedAt,
    });

    recordUpdate(
      'pipeline_message',
      geoId,
      {} as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record geo update:', err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error updating message geo:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update geo' },
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
    const { geoId } = await params;
    const changedBy = await getChangedBy(request);

    await deleteMessageGeo(geoId);

    recordDeletion(
      'pipeline_message',
      geoId,
      {} as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record geo deletion:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error deleting message geo:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete geo' },
      { status: 500 },
    );
  }
});
