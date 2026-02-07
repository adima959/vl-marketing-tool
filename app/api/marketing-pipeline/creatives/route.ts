/**
 * POST /api/marketing-pipeline/creatives — create a creative
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineCreative } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import type { Geography, CreativeFormat } from '@/types';

const VALID_GEOS: Geography[] = ['NO', 'SE', 'DK'];
const VALID_FORMATS: CreativeFormat[] = ['ugc_video', 'static_image', 'video'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    if (!body.messageId || !body.name?.trim() || !body.geo || !body.format) {
      return NextResponse.json(
        { success: false, error: 'messageId, name, geo, and format are required' },
        { status: 400 },
      );
    }

    if (!VALID_GEOS.includes(body.geo)) {
      return NextResponse.json({ success: false, error: 'Invalid geo' }, { status: 400 });
    }
    if (!VALID_FORMATS.includes(body.format)) {
      return NextResponse.json({ success: false, error: 'Invalid format' }, { status: 400 });
    }

    const creative = await createPipelineCreative({
      messageId: body.messageId,
      geo: body.geo,
      name: body.name.trim(),
      format: body.format,
      cta: body.cta,
      url: body.url,
      notes: body.notes,
    });

    recordCreation('creative', creative.id, creative as unknown as Record<string, unknown>, changedBy)
      .catch(err => console.error('Failed to record creative creation:', err));

    return NextResponse.json({ success: true, data: creative });
  } catch (error) {
    console.error('Error creating creative:', error);
    return NextResponse.json({ success: false, error: 'Failed to create creative' }, { status: 500 });
  }
}
