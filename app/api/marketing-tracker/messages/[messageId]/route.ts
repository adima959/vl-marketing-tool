import { NextRequest, NextResponse } from 'next/server';
import type { AngleStatus } from '@/types/marketing-tracker';
import {
  getMessageById,
  getAngleById,
  getProductByIdSimple,
  getAssetsByMessageId,
  getCreativesByMessageId,
  updateMessage,
  deleteMessage,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';

// Use null for changed_by until auth is implemented
// The schema supports NULL: "NULL if system or auth not implemented"
const SYSTEM_USER_ID: string | null = null;

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

/**
 * GET /api/marketing-tracker/messages/[messageId]
 * Get a single message with its assets and creatives
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
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
    console.error('Error fetching message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch message' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/marketing-tracker/messages/[messageId]
 * Update a message
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { messageId } = await params;
    const body = await request.json();

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
      description: body.description,
      status: body.status,
      specificPainPoint: body.specificPainPoint,
      corePromise: body.corePromise,
      keyIdea: body.keyIdea,
      primaryHookDirection: body.primaryHookDirection,
      headlines: body.headlines,
      launchedAt: body.launchedAt,
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
      SYSTEM_USER_ID
    ).catch((err) => console.error('Failed to record message update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedMessage,
    });
  } catch (error) {
    console.error('Error updating message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/marketing-tracker/messages/[messageId]
 * Partial update of message fields (status, hypothesis fields, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { messageId } = await params;
    const body = await request.json();

    // Get the old message for history diff
    const oldMessage = await getMessageById(messageId);

    if (!oldMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
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
      SYSTEM_USER_ID
    ).catch((err) => console.error('Failed to record message update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedMessage,
    });
  } catch (error) {
    console.error('Error updating message status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/marketing-tracker/messages/[messageId]
 * Delete a message (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { messageId } = await params;

    // Get message first for history snapshot
    const message = await getMessageById(messageId);

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Soft delete the message
    await deleteMessage(messageId);

    // Record deletion history
    await recordDeletion(
      'message',
      messageId,
      message as unknown as Record<string, unknown>,
      SYSTEM_USER_ID
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
