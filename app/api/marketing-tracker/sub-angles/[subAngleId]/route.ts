import { NextRequest, NextResponse } from 'next/server';
import type { SubAngle, AngleStatus } from '@/types';
import {
  getSubAngleById,
  getAssetsForSubAngle,
  getMainAngleById,
  getProductById,
  getCreativesForMessage,
} from '@/lib/marketing-tracker/dummy-data';

interface RouteParams {
  params: Promise<{ subAngleId: string }>;
}

/**
 * @deprecated Use /api/marketing-tracker/messages/[messageId] instead
 * GET /api/marketing-tracker/sub-angles/[subAngleId]
 * Get a single sub-angle (message) with its assets and creatives
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
    const creatives = getCreativesForMessage(subAngleId);
    const angle = getMainAngleById(subAngle.angleId);
    const product = angle ? getProductById(angle.productId) : null;

    return NextResponse.json({
      success: true,
      data: {
        subAngle,
        assets,
        creatives,
        // Legacy field names for backward compatibility
        mainAngle: angle,
        // New field names
        angle,
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
 * @deprecated Use /api/marketing-tracker/messages/[messageId] instead
 * PUT /api/marketing-tracker/sub-angles/[subAngleId]
 * Update a sub-angle (message)
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
      angleId: subAngle.angleId, // Cannot change parent
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
 * @deprecated Use /api/marketing-tracker/messages/[messageId] instead
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
 * @deprecated Use /api/marketing-tracker/messages/[messageId] instead
 * DELETE /api/marketing-tracker/sub-angles/[subAngleId]
 * Delete a sub-angle (cascades to assets and creatives)
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
    const creatives = getCreativesForMessage(subAngleId);

    // TODO: Replace with actual database delete with cascade
    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
        affectedAssets: assets.length,
        affectedCreatives: creatives.length,
        message: `Sub-angle "${subAngle.name}" and ${assets.length} asset(s) and ${creatives.length} creative(s) would be deleted`,
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
