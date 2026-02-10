/**
 * DELETE /api/marketing-pipeline/assets/[assetId] — soft delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { deletePipelineAsset } from '@/lib/marketing-pipeline/db';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { recordDeletion } from '@/lib/marketing-tracker/historyService';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { assetId } = await params;
    const changedBy = await getChangedBy(request);

    await deletePipelineAsset(assetId);

    recordDeletion('asset', assetId, { id: assetId }, changedBy)
      .catch(err => console.error('Failed to record asset deletion:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete asset' }, { status: 500 });
  }
});
