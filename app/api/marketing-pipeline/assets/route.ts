/**
 * POST /api/marketing-pipeline/assets — create an asset
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineAsset } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import type { Geography, AssetType } from '@/types';

const VALID_GEOS: Geography[] = ['NO', 'SE', 'DK'];
const VALID_TYPES: AssetType[] = ['landing_page', 'text_ad', 'brief', 'research'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    if (!body.messageId || !body.name?.trim() || !body.geo || !body.type) {
      return NextResponse.json(
        { success: false, error: 'messageId, name, geo, and type are required' },
        { status: 400 },
      );
    }

    if (!VALID_GEOS.includes(body.geo)) {
      return NextResponse.json({ success: false, error: 'Invalid geo' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }

    const asset = await createPipelineAsset({
      messageId: body.messageId,
      geo: body.geo,
      type: body.type,
      name: body.name.trim(),
      url: body.url,
      content: body.content,
      notes: body.notes,
    });

    recordCreation('asset', asset.id, asset as unknown as Record<string, unknown>, changedBy)
      .catch(err => console.error('Failed to record asset creation:', err));

    return NextResponse.json({ success: true, data: asset });
  } catch (error) {
    console.error('Error creating asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to create asset' }, { status: 500 });
  }
}
