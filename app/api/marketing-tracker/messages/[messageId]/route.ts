import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import type { AngleStatus } from '@/types/marketing-tracker';
import {
getMessageById,
  getAngleById,
  getProductByIdSimple,
  getAssetsByMessageId,
  getCreativesByMessageId,
  updateMessage,
  deleteMessage,
  cascadeDeleteMessage,
  moveChildrenToMessage,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { updateMessageSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

/**
 * GET /api/marketing-tracker/messages/[messageId]
 * Get a single message with its assets and creatives
 */
export const GET = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;

    // Run message, assets, and creatives queries in parallel (all only need messageId)
    const [message, assets, creatives] = await Promise.all([
      getMessageById(messageId),
      getAssetsByMessageId(messageId),
      getCreativesByMessageId(messageId),
    ]);

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Now fetch angle (needs message.angleId)
    const angle = await getAngleById(message.angleId);

    // Then fetch product (needs angle.productId) - use simple query
    const product = angle ? await getProductByIdSimple(angle.productId) : null;

    // Derive counts from actual arrays
    const messageWithAccurateCounts = {
      ...message,
      assetCount: assets.length,
      creativeCount: creatives.length,
    };

    return NextResponse.json({
      success: true,
      data: {
        message: messageWithAccurateCounts,
        assets,
        creatives,
        angle,
        product,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch message' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/marketing-tracker/messages/[messageId]
 * Update a message
 */
export const PUT = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = updateMessageSchema.parse(rawBody);

    // Get the old message for history diff
    const oldMessage = await getMessageById(messageId);

    if (!oldMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Update the message in the database
    const updatedMessageBase = await updateMessage(messageId, {
      name: body.name,
      description: body.description ?? undefined,
      status: body.status,
      specificPainPoint: body.specificPainPoint ?? undefined,
      corePromise: body.corePromise ?? undefined,
      keyIdea: body.keyIdea ?? undefined,
      primaryHookDirection: body.primaryHookDirection ?? undefined,
      headlines: body.headlines,
      launchedAt: body.launchedAt ?? undefined,
    });

    // Merge counts from old message (they don't change on field updates)
    const updatedMessage = {
      ...updatedMessageBase,
      assetCount: oldMessage.assetCount,
      creativeCount: oldMessage.creativeCount,
    };

    // Record update history (non-blocking for performance)
    recordUpdate(
      'message',
      messageId,
      oldMessage as unknown as Record<string, unknown>,
      updatedMessage as unknown as Record<string, unknown>,
      changedBy
    ).catch((err) => console.error('Failed to record message update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedMessage,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error updating message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/marketing-tracker/messages/[messageId]
 * Partial update of message fields (status, hypothesis fields, etc.)
 */
export const PATCH = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = updateMessageSchema.parse(rawBody);

    // Get the old message for history diff
    const oldMessage = await getMessageById(messageId);

    if (!oldMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.specificPainPoint !== undefined) updateData.specificPainPoint = body.specificPainPoint;
    if (body.corePromise !== undefined) updateData.corePromise = body.corePromise;
    if (body.keyIdea !== undefined) updateData.keyIdea = body.keyIdea;
    if (body.primaryHookDirection !== undefined) updateData.primaryHookDirection = body.primaryHookDirection;
    if (body.headlines !== undefined) updateData.headlines = body.headlines;

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update the message in the database
    const updatedMessageBase = await updateMessage(messageId, updateData);

    // Merge counts from old message (they don't change on field updates)
    const updatedMessage = {
      ...updatedMessageBase,
      assetCount: oldMessage.assetCount,
      creativeCount: oldMessage.creativeCount,
    };

    // Record update history (non-blocking for performance)
    recordUpdate(
      'message',
      messageId,
      oldMessage as unknown as Record<string, unknown>,
      updatedMessage as unknown as Record<string, unknown>,
      changedBy
    ).catch((err) => console.error('Failed to record message update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedMessage,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error updating message status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message status' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/marketing-tracker/messages/[messageId]
 * Delete a message (soft delete)
 *
 * Supports three modes via request body:
 * - { mode: "cascade" } — delete message + all assets/creatives
 * - { mode: "move", targetParentId: "..." } — move assets/creatives to another message, then delete
 * - No body / default — delete message only (backward compatible)
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
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

    // Get message first for history snapshot
    const message = await getMessageById(messageId);

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
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
      const targetMessage = await getMessageById(targetParentId);
      if (!targetMessage) {
        return NextResponse.json(
          { success: false, error: 'Target message not found' },
          { status: 404 }
        );
      }
      await moveChildrenToMessage(messageId, targetParentId);
      await deleteMessage(messageId);
    } else if (mode === 'cascade') {
      await cascadeDeleteMessage(messageId);
    } else {
      await deleteMessage(messageId);
    }

    // Record deletion history
    await recordDeletion(
      'message',
      messageId,
      message as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete message' },
      { status: 500 }
    );
  }
});
