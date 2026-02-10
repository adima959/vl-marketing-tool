import { NextRequest, NextResponse } from 'next/server';
import type { CreateMessageRequest } from '@/types/marketing-tracker';
import {
  getMessagesByAngleId,
  getAngleById,
  createMessage,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

/**
 * GET /api/marketing-tracker/messages
 * List messages, filtered by angleId (required)
 */
export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const angleId = searchParams.get('angleId');
    const status = searchParams.get('status');

    if (!angleId) {
      return NextResponse.json(
        { success: false, error: 'angleId is required' },
        { status: 400 }
      );
    }

    let messages = await getMessagesByAngleId(angleId);

    // Filter by status if provided
    if (status && status !== 'all') {
      messages = messages.filter((m) => m.status === status);
    }

    return NextResponse.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/marketing-tracker/messages
 * Create a new message
 */
export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const body: CreateMessageRequest = await request.json();
    const changedBy = await getChangedBy(request);

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Message name is required' },
        { status: 400 }
      );
    }

    if (!body.angleId) {
      return NextResponse.json(
        { success: false, error: 'Angle ID is required' },
        { status: 400 }
      );
    }

    // Verify angle exists
    const angle = await getAngleById(body.angleId);
    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    // Create the message in the database
    const newMessage = await createMessage({
      angleId: body.angleId,
      name: body.name,
      description: body.description,
      status: body.status,
      specificPainPoint: body.specificPainPoint,
      corePromise: body.corePromise,
      keyIdea: body.keyIdea,
      primaryHookDirection: body.primaryHookDirection,
      headlines: body.headlines,
    });

    // Record creation history
    await recordCreation(
      'message',
      newMessage.id,
      newMessage as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: newMessage,
    });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create message' },
      { status: 500 }
    );
  }
});
