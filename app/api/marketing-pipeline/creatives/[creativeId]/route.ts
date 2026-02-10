/**
 * DELETE /api/marketing-pipeline/creatives/[creativeId] — soft delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { deletePipelineCreative } from '@/lib/marketing-pipeline/db';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { recordDeletion } from '@/lib/marketing-tracker/historyService';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ creativeId: string }>;
}

export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { creativeId } = await params;
    const changedBy = await getChangedBy(request);

    await deletePipelineCreative(creativeId);

    recordDeletion('creative', creativeId, { id: creativeId }, changedBy)
      .catch(err => console.error('Failed to record creative deletion:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting creative:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete creative' }, { status: 500 });
  }
});
