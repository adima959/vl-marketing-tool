import { NextRequest, NextResponse } from 'next/server';
import type { CreateCreativeRequest, Geography, CreativeFormat } from '@/types';
import {
  getCreativesByMessageId,
  getMessageById,
  createCreative,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { createCreativeSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

/**
 * GET /api/marketing-tracker/creatives
 * List creatives, filtered by messageId (required) and optionally by geo/format
 */
export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const geo = searchParams.get('geo');
    const format = searchParams.get('format');

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: 'messageId is required' },
        { status: 400 }
      );
    }

    let creatives = await getCreativesByMessageId(messageId);

    // Filter by geo if provided
    if (geo && geo !== 'all') {
      creatives = creatives.filter((c) => c.geo === geo);
    }

    // Filter by format if provided
    if (format && format !== 'all') {
      creatives = creatives.filter((c) => c.format === format);
    }

    return NextResponse.json({
      success: true,
      data: creatives,
    });
  } catch (error) {
    console.error('Error fetching creatives:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch creatives' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/marketing-tracker/creatives
 * Create a new creative
 */
export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = createCreativeSchema.parse(rawBody);

    // Verify message exists
    const message = await getMessageById(body.messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Create the creative in the database
    const newCreative = await createCreative({
      messageId: body.messageId,
      geo: body.geo,
      format: body.format,
      name: body.name,
      cta: body.cta,
      url: body.url,
      notes: body.notes,
    });

    // Record creation history
    await recordCreation(
      'creative',
      newCreative.id,
      newCreative as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: newCreative,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error creating creative:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create creative' },
      { status: 500 }
    );
  }
});
