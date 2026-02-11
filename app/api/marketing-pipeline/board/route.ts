/**
 * GET /api/marketing-pipeline/board
 * Fetch pipeline board data (cards, summary, filter options)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPipelineBoard } from '@/lib/marketing-pipeline/db';
import { withAuth } from '@/lib/rbac';
import type { Channel, Geography } from '@/types';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);

    const channelsParam = searchParams.get('channels');
    const geosParam = searchParams.get('geos');

    const filters = {
      ownerId: searchParams.get('ownerId') || undefined,
      productId: searchParams.get('productId') || undefined,
      angleId: searchParams.get('angleId') || undefined,
      channels: channelsParam ? channelsParam.split(',') as Channel[] : undefined,
      geos: geosParam ? geosParam.split(',') as Geography[] : undefined,
    };

    const data = await getPipelineBoard(filters);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching pipeline board:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pipeline board' },
      { status: 500 },
    );
  }
});
