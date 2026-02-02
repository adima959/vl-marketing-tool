import { NextRequest, NextResponse } from 'next/server';
import type { CreateAssetRequest, Geography, AssetType } from '@/types';
import {
  getAssetsByMessageId,
  getMessageById,
  createAsset,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';

// Use null for changed_by until auth is implemented
// The schema supports NULL: "NULL if system or auth not implemented"
const SYSTEM_USER_ID: string | null = null;

/**
 * GET /api/marketing-tracker/assets
 * List assets, filtered by messageId (required) and optionally by geo/type
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
}

/**
 * POST /api/marketing-tracker/assets
 * Create a new asset
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreateAssetRequest = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Asset name is required' },
        { status: 400 }
      );
    }

    if (!body.messageId) {
      return NextResponse.json(
        { success: false, error: 'Message ID is required' },
        { status: 400 }
      );
    }

    if (!body.geo) {
      return NextResponse.json(
        { success: false, error: 'Geography is required' },
        { status: 400 }
      );
    }

    if (!body.type) {
      return NextResponse.json(
        { success: false, error: 'Asset type is required' },
        { status: 400 }
      );
    }

    // Validate geo
    const validGeos: Geography[] = ['NO', 'SE', 'DK'];
    if (!validGeos.includes(body.geo)) {
      return NextResponse.json(
        { success: false, error: 'Invalid geography value' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes: AssetType[] = ['landing_page', 'text_ad', 'brief', 'research'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid asset type' },
        { status: 400 }
      );
    }

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
      url: body.url,
      content: body.content,
      notes: body.notes,
    });

    // Record creation history
    await recordCreation(
      'asset',
      newAsset.id,
      newAsset as unknown as Record<string, unknown>,
      SYSTEM_USER_ID
    );

    return NextResponse.json({
      success: true,
      data: newAsset,
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create asset' },
      { status: 500 }
    );
  }
}
