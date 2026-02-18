/**
 * PUT   /api/marketing-pipeline/products/[productId] — Update product details
 * PATCH /api/marketing-pipeline/products/[productId] — Update product CPA targets
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductById, updateProductCpaTargets, updateProduct } from '@/lib/marketing-pipeline/db';
import { recordUpdate } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { renameDriveFolder } from '@/lib/server/googleDrive';
import { withPermission } from '@/lib/rbac';
import { isValidUUID } from '@/lib/utils/validation';
import type { AppUser } from '@/types/user';
import { updateProductSchema } from '@/lib/schemas/marketingPipeline';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

interface RouteParams {
  params: Promise<{ productId: string }>;
}

export const PATCH = withPermission('tools.marketing_pipeline', 'can_edit', async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    if (!isValidUUID(productId)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 });
    }
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    const existing = await getProductById(productId);

    const updated = await updateProductCpaTargets(productId, {
      cpaTargetNo: body.cpaTargetNo,
      cpaTargetSe: body.cpaTargetSe,
      cpaTargetDk: body.cpaTargetDk,
    });

    await recordUpdate(
      'product',
      productId,
      (existing ?? {}) as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 },
    );
  }
});

export const PUT = withPermission('admin.product_settings', 'can_edit', async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    if (!isValidUUID(productId)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 });
    }
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);
    const body = updateProductSchema.parse(rawBody);

    const existing = await getProductById(productId);

    // Strip undefined keys so updateProduct only touches fields the client sent
    const updateData = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    ) as Parameters<typeof updateProduct>[1];
    const updated = await updateProduct(productId, updateData);

    // Rename Drive folder if product name changed
    if (body.name && existing?.driveFolderId && body.name !== existing.name) {
      renameDriveFolder(existing.driveFolderId, body.name).catch(() => {});
    }

    await recordUpdate(
      'product',
      productId,
      (existing ?? {}) as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 },
    );
  }
});
