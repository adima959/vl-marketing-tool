import { NextRequest, NextResponse } from 'next/server';
import type { AngleStatus } from '@/types/marketing-tracker';
import {
  getAngleById,
  getProductByIdSimple,
  getMessagesByAngleId,
  updateAngle,
  deleteAngle,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';

// Use null for changed_by until auth is implemented
// The schema supports NULL: "NULL if system or auth not implemented"
const SYSTEM_USER_ID: string | null = null;

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

    // Run angle and messages queries in parallel (both only need angleId)
    const [angle, messages] = await Promise.all([
      getAngleById(angleId),
      getMessagesByAngleId(angleId),
    ]);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    // Now fetch product (needs angle.productId) - use simple query, no angle counts needed
    const product = await getProductByIdSimple(angle.productId);

    // Derive message count from actual messages array
    const angleWithAccurateCount = {
      ...angle,
      messageCount: messages.length,
    };

    return NextResponse.json({
      success: true,
      data: {
        angle: angleWithAccurateCount,
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
    const updatedAngleBase = await updateAngle(angleId, {
      name: body.name,
      description: body.description,
      status: body.status,
      launchedAt: body.launchedAt,
    });

    // Merge counts from old angle (they don't change on field updates)
    const updatedAngle = {
      ...updatedAngleBase,
      messageCount: oldAngle.messageCount,
    };

    // Record update history (non-blocking for performance)
    recordUpdate(
      'angle',
      angleId,
      oldAngle as unknown as Record<string, unknown>,
      updatedAngle as unknown as Record<string, unknown>,
      SYSTEM_USER_ID
    ).catch((err) => console.error('Failed to record angle update history:', err));

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
 * Partially update angle fields (name, description, status)
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

    // Validate status if provided
    if (body.status !== undefined) {
      const validStatuses: AngleStatus[] = ['idea', 'in_production', 'live', 'paused', 'retired'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status value' },
          { status: 400 }
        );
      }
    }

    // Build update object with only provided fields
    const updateData: Partial<{ name: string; description: string; status: AngleStatus }> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update the angle in the database
    const updatedAngleBase = await updateAngle(angleId, updateData);

    // Merge counts from old angle (they don't change on field updates)
    const updatedAngle = {
      ...updatedAngleBase,
      messageCount: oldAngle.messageCount,
    };

    // Record update history (non-blocking for performance)
    recordUpdate(
      'angle',
      angleId,
      oldAngle as unknown as Record<string, unknown>,
      updatedAngle as unknown as Record<string, unknown>,
      SYSTEM_USER_ID
    ).catch((err) => console.error('Failed to record angle update history:', err));

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
      SYSTEM_USER_ID
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
