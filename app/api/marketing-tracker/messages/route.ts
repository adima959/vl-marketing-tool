import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import type { CreateMessageRequest } from '@/types/marketing-tracker';
import {
  getMessagesByAngleId,
  getAngleById,
  createMessage,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { createMessageSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

/**
 * GET /api/marketing-tracker/messages
 * List messages, filtered by angleId (required)
 */
export const GET = withPermission('tools.marketing_tracker', 'can_view', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
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
    unstable_rethrow(error);
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
export const POST = withPermission('tools.marketing_tracker', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = createMessageSchema.parse(rawBody);

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
      description: body.description ?? undefined,
      status: body.status,
      specificPainPoint: body.specificPainPoint ?? undefined,
      corePromise: body.corePromise ?? undefined,
      keyIdea: body.keyIdea ?? undefined,
      primaryHookDirection: body.primaryHookDirection ?? undefined,
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
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error creating message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create message' },
      { status: 500 }
    );
  }
});
