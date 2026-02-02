import { NextRequest, NextResponse } from 'next/server';
import type { AngleStatus } from '@/types/marketing-tracker';
import {
  getMessageById,
  getAngleById,
  getProductById,
  getAssetsByMessageId,
  getCreativesByMessageId,
  updateMessage,
  deleteMessage,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';

// Placeholder user ID until auth is implemented
const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000';

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
    const message = await getMessageById(messageId);

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    const assets = await getAssetsByMessageId(messageId);
    const creatives = await getCreativesByMessageId(messageId);
    const angle = await getAngleById(message.angleId);
    const product = angle ? await getProductById(angle.productId) : null;

    return NextResponse.json({
      success: true,
      data: {
        message,
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
    const updatedMessage = await updateMessage(messageId, {
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

    // Record update history
    await recordUpdate(
      'message',
      messageId,
      oldMessage as unknown as Record<string, unknown>,
      updatedMessage as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

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
 * Update message status only
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

    // Update the message status in the database
    const updatedMessage = await updateMessage(messageId, {
      status: body.status,
    });

    // Record update history
    await recordUpdate(
      'message',
      messageId,
      oldMessage as unknown as Record<string, unknown>,
      updatedMessage as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

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
      PLACEHOLDER_USER_ID
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
