import { NextRequest, NextResponse } from 'next/server';
import type { AngleStatus } from '@/types/marketing-tracker';
import {
  getAngleById,
  getProductById,
  getMessagesByAngleId,
  updateAngle,
  deleteAngle,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';

// Placeholder user ID until auth is implemented
const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000';

interface RouteParams {
  params: Promise<{ angleId: string }>;
}

/**
 * GET /api/marketing-tracker/angles/[angleId]
 * Get a single angle with its messages and parent product
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { angleId } = await params;
    const angle = await getAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    const messages = await getMessagesByAngleId(angleId);
    const product = await getProductById(angle.productId);

    return NextResponse.json({
      success: true,
      data: {
        angle,
        messages,
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

    // Get the old angle for history diff
    const oldAngle = await getAngleById(angleId);

    if (!oldAngle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    // Update the angle in the database
    const updatedAngle = await updateAngle(angleId, {
      name: body.name,
      description: body.description,
      status: body.status,
      launchedAt: body.launchedAt,
    });

    // Record update history
    await recordUpdate(
      'angle',
      angleId,
      oldAngle as unknown as Record<string, unknown>,
      updatedAngle as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

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

    // Get the old angle for history diff
    const oldAngle = await getAngleById(angleId);

    if (!oldAngle) {
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

    // Update the angle status in the database
    const updatedAngle = await updateAngle(angleId, {
      status: body.status,
    });

    // Record update history
    await recordUpdate(
      'angle',
      angleId,
      oldAngle as unknown as Record<string, unknown>,
      updatedAngle as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

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
 * Delete an angle (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { angleId } = await params;

    // Get angle first for history snapshot
    const angle = await getAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    // Soft delete the angle
    await deleteAngle(angleId);

    // Record deletion history
    await recordDeletion(
      'angle',
      angleId,
      angle as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete angle' },
      { status: 500 }
    );
  }
}
