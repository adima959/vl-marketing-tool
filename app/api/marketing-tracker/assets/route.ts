import { NextRequest, NextResponse } from 'next/server';
import type { CreateAssetRequest, Geography, AssetType } from '@/types';
import {
  getAssetsByMessageId,
  getMessageById,
  createAsset,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { createAssetSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

/**
 * GET /api/marketing-tracker/assets
 * List assets, filtered by messageId (required) and optionally by geo/type
 */
export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const geo = searchParams.get('geo');
    const type = searchParams.get('type');

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: 'messageId is required' },
        { status: 400 }
      );
    }

    let assets = await getAssetsByMessageId(messageId);

    // Filter by geo if provided
    if (geo && geo !== 'all') {
      assets = assets.filter((a) => a.geo === geo);
    }

    // Filter by type if provided
    if (type && type !== 'all') {
      assets = assets.filter((a) => a.type === type);
    }

    return NextResponse.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch assets' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/marketing-tracker/assets
 * Create a new asset
 */
export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = createAssetSchema.parse(rawBody);

    // Verify message exists
    const message = await getMessageById(body.messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Create the asset in the database
    const newAsset = await createAsset({
      messageId: body.messageId,
      geo: body.geo,
      type: body.type,
      name: body.name,
      url: body.url ?? undefined,
      content: body.content ?? undefined,
      notes: body.notes ?? undefined,
    });

    // Record creation history
    await recordCreation(
      'asset',
      newAsset.id,
      newAsset as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: newAsset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error creating asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create asset' },
      { status: 500 }
    );
  }
});
