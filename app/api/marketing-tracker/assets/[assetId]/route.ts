import { NextRequest, NextResponse } from 'next/server';
import type { Geography, AssetType } from '@/types';
import {
  getAssetById,
  getMessageById,
  getAngleById,
  getProductById,
  updateAsset,
  deleteAsset,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { updateAssetSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

/**
 * GET /api/marketing-tracker/assets/[assetId]
 * Get a single asset with its parent context
 */
export const GET = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { assetId } = await params;
    const asset = await getAssetById(assetId);

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    const message = await getMessageById(asset.messageId);
    const angle = message ? await getAngleById(message.angleId) : null;
    const product = angle ? await getProductById(angle.productId) : null;

    return NextResponse.json({
      success: true,
      data: {
        asset,
        message,
        angle,
        product,
      },
    });
  } catch (error) {
    console.error('Error fetching asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch asset' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/marketing-tracker/assets/[assetId]
 * Update an asset
 */
export const PUT = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { assetId } = await params;
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = updateAssetSchema.parse(rawBody);

    // Get old asset for history diff
    const oldAsset = await getAssetById(assetId);

    if (!oldAsset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Update the asset in the database
    const updatedAsset = await updateAsset(assetId, {
      name: body.name,
      geo: body.geo,
      type: body.type,
      url: body.url ?? undefined,
      content: body.content ?? undefined,
      notes: body.notes ?? undefined,
    });

    // Record update history
    await recordUpdate(
      'asset',
      assetId,
      oldAsset as unknown as Record<string, unknown>,
      updatedAsset as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: updatedAsset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error updating asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update asset' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/marketing-tracker/assets/[assetId]
 * Delete an asset (soft delete)
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { assetId } = await params;
    const changedBy = await getChangedBy(request);

    // Get asset first for history snapshot
    const asset = await getAssetById(assetId);

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Soft delete the asset
    await deleteAsset(assetId);

    // Record deletion history
    await recordDeletion(
      'asset',
      assetId,
      asset as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete asset' },
      { status: 500 }
    );
  }
});
