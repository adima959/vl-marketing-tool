import { NextRequest, NextResponse } from 'next/server';
import type { MainAngle, AngleStatus } from '@/types';
import {
  getMainAngleById,
  getSubAnglesForMainAngle,
  getProductById,
} from '@/lib/marketing-tracker/dummy-data';

interface RouteParams {
  params: Promise<{ angleId: string }>;
}

/**
 * GET /api/marketing-tracker/angles/[angleId]
 * Get a single main angle with its sub-angles
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { angleId } = await params;
    const angle = getMainAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    const subAngles = getSubAnglesForMainAngle(angleId);
    const product = getProductById(angle.productId);

    return NextResponse.json({
      success: true,
      data: {
        angle,
        subAngles,
        product,
      },
    });
  } catch (error) {
    console.error('Error fetching angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch angle' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/marketing-tracker/angles/[angleId]
 * Update an angle
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { angleId } = await params;
    const body = await request.json();
    const angle = getMainAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    // Handle status change - set launchedAt when going live
    let launchedAt = angle.launchedAt;
    if (body.status === 'live' && !angle.launchedAt) {
      launchedAt = new Date().toISOString();
    }

    // TODO: Replace with actual database update
    const updatedAngle: MainAngle = {
      ...angle,
      ...body,
      id: angleId,
      productId: angle.productId, // Cannot change parent
      launchedAt,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: updatedAngle,
    });
  } catch (error) {
    console.error('Error updating angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update angle' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/marketing-tracker/angles/[angleId]
 * Update angle status only
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { angleId } = await params;
    const body = await request.json();
    const angle = getMainAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
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
    let launchedAt = angle.launchedAt;
    if (body.status === 'live' && !angle.launchedAt) {
      launchedAt = new Date().toISOString();
    }

    // TODO: Replace with actual database update
    const updatedAngle: MainAngle = {
      ...angle,
      status: body.status,
      launchedAt,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: updatedAngle,
    });
  } catch (error) {
    console.error('Error updating angle status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update angle status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/marketing-tracker/angles/[angleId]
 * Delete an angle (cascades to sub-angles and assets)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { angleId } = await params;
    const angle = getMainAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    const subAngles = getSubAnglesForMainAngle(angleId);

    // TODO: Replace with actual database delete with cascade
    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
        affectedSubAngles: subAngles.length,
        message: `Angle "${angle.name}" and ${subAngles.length} sub-angle(s) would be deleted`,
      },
    });
  } catch (error) {
    console.error('Error deleting angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete angle' },
      { status: 500 }
    );
  }
}
