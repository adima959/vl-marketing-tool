import { NextRequest, NextResponse } from 'next/server';
import type { AngleStatus } from '@/types/marketing-tracker';
import {
  getAngleById,
  getProductByIdSimple,
  getMessagesByAngleId,
  updateAngle,
  deleteAngle,
  cascadeDeleteAngle,
  moveMessagesToAngle,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ angleId: string }>;
}

/**
 * GET /api/marketing-tracker/angles/[angleId]
 * Get a single angle with its messages and parent product
 */
export const GET = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
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
});

/**
 * PUT /api/marketing-tracker/angles/[angleId]
 * Update an angle
 */
export const PUT = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { angleId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

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
      changedBy
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
});

/**
 * PATCH /api/marketing-tracker/angles/[angleId]
 * Partially update angle fields (name, description, status)
 */
export const PATCH = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { angleId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

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
      changedBy
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
});

/**
 * DELETE /api/marketing-tracker/angles/[angleId]
 * Delete an angle (soft delete)
 *
 * Supports three modes via request body:
 * - { mode: "cascade" } — delete angle + all children
 * - { mode: "move", targetParentId: "..." } — move messages to another angle, then delete
 * - No body / default — delete angle only (backward compatible)
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { angleId } = await params;
    const changedBy = await getChangedBy(request);

    // Parse optional body
    let mode: string = 'default';
    let targetParentId: string | undefined;
    try {
      const body = await request.json();
      if (body.mode) mode = body.mode;
      if (body.targetParentId) targetParentId = body.targetParentId;
    } catch {
      // No body — use default mode
    }

    // Get angle first for history snapshot
    const angle = await getAngleById(angleId);

    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    if (mode === 'move') {
      if (!targetParentId) {
        return NextResponse.json(
          { success: false, error: 'targetParentId is required for move mode' },
          { status: 400 }
        );
      }
      const targetAngle = await getAngleById(targetParentId);
      if (!targetAngle) {
        return NextResponse.json(
          { success: false, error: 'Target angle not found' },
          { status: 404 }
        );
      }
      await moveMessagesToAngle(angleId, targetParentId);
      await deleteAngle(angleId);
    } else if (mode === 'cascade') {
      await cascadeDeleteAngle(angleId);
    } else {
      await deleteAngle(angleId);
    }

    // Record deletion history
    await recordDeletion(
      'angle',
      angleId,
      angle as unknown as Record<string, unknown>,
      changedBy
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
});
