/**
 * GET /api/marketing-pipeline/history?entityType=...&entityId=...
 * Fetch entity history entries
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPipelineHistory } from '@/lib/marketing-pipeline/db';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');

    if (!entityType || !entityId) {
      return NextResponse.json(
        { success: false, error: 'entityType and entityId are required' },
        { status: 400 },
      );
    }

    const history = await getPipelineHistory(entityType, entityId);

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching pipeline history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 },
    );
  }
}
