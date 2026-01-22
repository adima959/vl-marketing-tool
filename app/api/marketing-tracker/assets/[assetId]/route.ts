import { NextRequest, NextResponse } from 'next/server';
import type { Asset, Geography, AssetType } from '@/types';
import { DUMMY_ASSETS } from '@/lib/marketing-tracker/dummy-data';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

function getAssetById(assetId: string): Asset | undefined {
  return DUMMY_ASSETS.find((a) => a.id === assetId);
}

/**
 * GET /api/marketing-tracker/assets/[assetId]
 * Get a single asset
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { assetId } = await params;
    const asset = getAssetById(assetId);

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: asset,
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
    const asset = getAssetById(assetId);

    if (!asset) {
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
      const validTypes: AssetType[] = ['landing_page', 'image_ads', 'ugc_video', 'text_ad', 'brief', 'research'];
      if (!validTypes.includes(body.type)) {
        return NextResponse.json(
          { success: false, error: 'Invalid asset type' },
          { status: 400 }
        );
      }
    }

    // TODO: Replace with actual database update
    const updatedAsset: Asset = {
      ...asset,
      ...body,
      id: assetId,
      subAngleId: asset.subAngleId, // Cannot change parent
      updatedAt: new Date().toISOString(),
    };

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
 * Delete an asset
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { assetId } = await params;
    const asset = getAssetById(assetId);

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // TODO: Replace with actual database delete
    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
        message: `Asset "${asset.name}" would be deleted`,
      },
    });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
