/**
 * GET /api/marketing-pipeline/history?entityType=...&entityId=...
 * Fetch entity history entries
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPipelineHistory } from '@/lib/marketing-pipeline/db';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
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
    unstable_rethrow(error);
    console.error('Error fetching pipeline history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 },
    );
  }
});
