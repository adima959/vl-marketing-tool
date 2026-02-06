import { NextRequest, NextResponse } from 'next/server';
import type { CreateMessageRequest } from '@/types/marketing-tracker';
import {
  getMessagesByAngleId,
  getAngleById,
  createMessage,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';

/**
 * GET /api/marketing-tracker/messages
 * List messages, filtered by angleId (required)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const angleId = searchParams.get('angleId');
    const status = searchParams.get('status');
    const geo = searchParams.get('geo');

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

    // Filter by geo if provided (messages don't have geo directly, but we could filter by assets/creatives geo)
    // For now, geo filter is a placeholder for future implementation
    if (geo && geo !== 'all') {
      // TODO: Implement geo filtering based on associated assets/creatives
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
}

/**
 * POST /api/marketing-tracker/messages
 * Create a new message
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
}
