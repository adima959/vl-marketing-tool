import { NextRequest, NextResponse } from 'next/server';
import type { SubAngle, AngleStatus } from '@/types';
import {
  getSubAngleById,
  getAssetsForSubAngle,
  getMainAngleById,
  getProductById,
} from '@/lib/marketing-tracker/dummy-data';

interface RouteParams {
  params: Promise<{ subAngleId: string }>;
}

/**
 * GET /api/marketing-tracker/sub-angles/[subAngleId]
 * Get a single sub-angle with its assets
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { subAngleId } = await params;
    const subAngle = getSubAngleById(subAngleId);

    if (!subAngle) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle not found' },
        { status: 404 }
      );
    }

    const assets = getAssetsForSubAngle(subAngleId);
    const mainAngle = getMainAngleById(subAngle.mainAngleId);
    const product = mainAngle ? getProductById(mainAngle.productId) : null;

    return NextResponse.json({
      success: true,
      data: {
        subAngle,
        assets,
        mainAngle,
        product,
      },
    });
  } catch (error) {
    console.error('Error fetching sub-angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sub-angle' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/marketing-tracker/sub-angles/[subAngleId]
 * Update a sub-angle
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { subAngleId } = await params;
    const body = await request.json();
    const subAngle = getSubAngleById(subAngleId);

    if (!subAngle) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle not found' },
        { status: 404 }
      );
    }

    // Handle status change - set launchedAt when going live
    let launchedAt = subAngle.launchedAt;
    if (body.status === 'live' && !subAngle.launchedAt) {
      launchedAt = new Date().toISOString();
    }

    // TODO: Replace with actual database update
    const updatedSubAngle: SubAngle = {
      ...subAngle,
      ...body,
      id: subAngleId,
      mainAngleId: subAngle.mainAngleId, // Cannot change parent
      launchedAt,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: updatedSubAngle,
    });
  } catch (error) {
    console.error('Error updating sub-angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update sub-angle' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/marketing-tracker/sub-angles/[subAngleId]
 * Update sub-angle status only
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { subAngleId } = await params;
    const body = await request.json();
    const subAngle = getSubAngleById(subAngleId);

    if (!subAngle) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle not found' },
        { status: 404 }
      );
    }

    if (!body.status) {
      return NextResponse.json(
        { success: false, error: 'Status is required' },
        { status: 400 }
      );
    }

    const validStatuses: AngleStatus[] = ['idea', 'in_production', 'live', 'paused', 'retired'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status value' },
        { status: 400 }
      );
    }

    // Handle status change - set launchedAt when going live
    let launchedAt = subAngle.launchedAt;
    if (body.status === 'live' && !subAngle.launchedAt) {
      launchedAt = new Date().toISOString();
    }

    // TODO: Replace with actual database update
    const updatedSubAngle: SubAngle = {
      ...subAngle,
      status: body.status,
      launchedAt,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: updatedSubAngle,
    });
  } catch (error) {
    console.error('Error updating sub-angle status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update sub-angle status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/marketing-tracker/sub-angles/[subAngleId]
 * Delete a sub-angle (cascades to assets)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { subAngleId } = await params;
    const subAngle = getSubAngleById(subAngleId);

    if (!subAngle) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle not found' },
        { status: 404 }
      );
    }

    const assets = getAssetsForSubAngle(subAngleId);

    // TODO: Replace with actual database delete with cascade
    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
        affectedAssets: assets.length,
        message: `Sub-angle "${subAngle.name}" and ${assets.length} asset(s) would be deleted`,
      },
    });
  } catch (error) {
    console.error('Error deleting sub-angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete sub-angle' },
      { status: 500 }
    );
  }
}
