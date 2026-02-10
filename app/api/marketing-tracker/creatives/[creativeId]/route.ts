import { NextRequest, NextResponse } from 'next/server';
import type { Geography, CreativeFormat } from '@/types';
import {
  getCreativeById,
  getMessageById,
  getAngleById,
  getProductById,
  updateCreative,
  deleteCreative,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { updateCreativeSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ creativeId: string }>;
}

/**
 * GET /api/marketing-tracker/creatives/[creativeId]
 * Get a single creative with its parent context
 */
export const GET = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { creativeId } = await params;
    const creative = await getCreativeById(creativeId);

    if (!creative) {
      return NextResponse.json(
        { success: false, error: 'Creative not found' },
        { status: 404 }
      );
    }

    const message = await getMessageById(creative.messageId);
    const angle = message ? await getAngleById(message.angleId) : null;
    const product = angle ? await getProductById(angle.productId) : null;

    return NextResponse.json({
      success: true,
      data: {
        creative,
        message,
        angle,
        product,
      },
    });
  } catch (error) {
    console.error('Error fetching creative:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch creative' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/marketing-tracker/creatives/[creativeId]
 * Update a creative
 */
export const PUT = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { creativeId } = await params;
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = updateCreativeSchema.parse(rawBody);

    // Get old creative for history diff
    const oldCreative = await getCreativeById(creativeId);

    if (!oldCreative) {
      return NextResponse.json(
        { success: false, error: 'Creative not found' },
        { status: 404 }
      );
    }

    // Update the creative in the database
    const updatedCreative = await updateCreative(creativeId, {
      name: body.name,
      geo: body.geo,
      format: body.format,
      cta: body.cta ?? undefined,
      url: body.url ?? undefined,
      notes: body.notes ?? undefined,
    });

    // Record update history
    await recordUpdate(
      'creative',
      creativeId,
      oldCreative as unknown as Record<string, unknown>,
      updatedCreative as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: updatedCreative,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error updating creative:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update creative' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/marketing-tracker/creatives/[creativeId]
 * Delete a creative (soft delete)
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { creativeId } = await params;
    const changedBy = await getChangedBy(request);

    // Get creative first for history snapshot
    const creative = await getCreativeById(creativeId);

    if (!creative) {
      return NextResponse.json(
        { success: false, error: 'Creative not found' },
        { status: 404 }
      );
    }

    // Soft delete the creative
    await deleteCreative(creativeId);

    // Record deletion history
    await recordDeletion(
      'creative',
      creativeId,
      creative as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting creative:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete creative' },
      { status: 500 }
    );
  }
});
