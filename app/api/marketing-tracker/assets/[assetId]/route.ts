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

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

/**
 * GET /api/marketing-tracker/assets/[assetId]
 * Get a single asset with its parent context
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
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
}

/**
 * PUT /api/marketing-tracker/assets/[assetId]
 * Update an asset
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { assetId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    // Get old asset for history diff
    const oldAsset = await getAssetById(assetId);

    if (!oldAsset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Validate geo if provided
    if (body.geo) {
      const validGeos: Geography[] = ['NO', 'SE', 'DK'];
      if (!validGeos.includes(body.geo)) {
        return NextResponse.json(
          { success: false, error: 'Invalid geography value' },
          { status: 400 }
        );
      }
    }

    // Validate type if provided
    if (body.type) {
      const validTypes: AssetType[] = ['landing_page', 'text_ad', 'brief', 'research'];
      if (!validTypes.includes(body.type)) {
        return NextResponse.json(
          { success: false, error: 'Invalid asset type' },
          { status: 400 }
        );
      }
    }

    // Update the asset in the database
    const updatedAsset = await updateAsset(assetId, {
      name: body.name,
      geo: body.geo,
      type: body.type,
      url: body.url,
      content: body.content,
      notes: body.notes,
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
    console.error('Error updating asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update asset' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/marketing-tracker/assets/[assetId]
 * Delete an asset (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
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
}
