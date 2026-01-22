import { NextRequest, NextResponse } from 'next/server';
import type { Asset, CreateAssetRequest, Geography, AssetType } from '@/types';
import {
  DUMMY_ASSETS,
  getAssetsForSubAngle,
  getSubAngleById,
} from '@/lib/marketing-tracker/dummy-data';

/**
 * GET /api/marketing-tracker/assets
 * List assets, optionally filtered by subAngleId and/or geo
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const subAngleId = searchParams.get('subAngleId');
    const geo = searchParams.get('geo');
    const type = searchParams.get('type');

    let assets = subAngleId
      ? getAssetsForSubAngle(subAngleId)
      : [...DUMMY_ASSETS];

    // Filter by geo if provided
    if (geo && geo !== 'all') {
      assets = assets.filter((a) => a.geo === geo);
    }

    // Filter by type if provided
    if (type && type !== 'all') {
      assets = assets.filter((a) => a.type === type);
    }

    return NextResponse.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/marketing-tracker/assets
 * Create a new asset
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreateAssetRequest = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Asset name is required' },
        { status: 400 }
      );
    }

    if (!body.subAngleId) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle ID is required' },
        { status: 400 }
      );
    }

    if (!body.geo) {
      return NextResponse.json(
        { success: false, error: 'Geography is required' },
        { status: 400 }
      );
    }

    if (!body.type) {
      return NextResponse.json(
        { success: false, error: 'Asset type is required' },
        { status: 400 }
      );
    }

    // Validate geo
    const validGeos: Geography[] = ['NO', 'SE', 'DK'];
    if (!validGeos.includes(body.geo)) {
      return NextResponse.json(
        { success: false, error: 'Invalid geography value' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes: AssetType[] = ['landing_page', 'image_ads', 'ugc_video', 'text_ad', 'brief', 'research'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid asset type' },
        { status: 400 }
      );
    }

    // Verify sub-angle exists
    const subAngle = getSubAngleById(body.subAngleId);
    if (!subAngle) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle not found' },
        { status: 404 }
      );
    }

    // TODO: Replace with actual database insert
    const newAsset: Asset = {
      id: `asset-${Date.now()}`,
      subAngleId: body.subAngleId,
      geo: body.geo,
      type: body.type,
      name: body.name,
      url: body.url,
      content: body.content,
      notes: body.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: newAsset,
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create asset' },
      { status: 500 }
    );
  }
}
