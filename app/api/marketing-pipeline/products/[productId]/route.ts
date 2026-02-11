/**
 * PATCH /api/marketing-pipeline/products/[productId]
 * Update product CPA targets
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateProductCpaTargets } from '@/lib/marketing-pipeline/db';
import { recordUpdate } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

interface RouteParams {
  params: Promise<{ productId: string }>;
}

export const PATCH = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    const updated = await updateProductCpaTargets(productId, {
      cpaTargetNo: body.cpaTargetNo,
      cpaTargetSe: body.cpaTargetSe,
      cpaTargetDk: body.cpaTargetDk,
    });

    // Record history (non-blocking)
    recordUpdate(
      'product',
      productId,
      {} as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record product CPA update:', err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error updating product CPA targets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 },
    );
  }
});
