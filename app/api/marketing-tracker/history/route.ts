import { NextRequest, NextResponse } from 'next/server';
import type { EntityType } from '@/types/marketing-tracker';
import { getEntityHistory, getRecentHistory } from '@/lib/marketing-tracker/historyService';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const VALID_ENTITY_TYPES: EntityType[] = ['product', 'angle', 'message', 'asset', 'creative'];

/**
 * GET /api/marketing-tracker/history
 * Get history records for a specific entity or recent history across all entities
 *
 * Query params:
 *   - entityType (optional): 'product' | 'angle' | 'message' | 'creative' | 'asset'
 *   - entityId (optional): UUID of specific entity
 *   - limit (optional): number, default 50
 *
 * If entityType + entityId provided: returns history for that specific entity
 * Otherwise: returns recent history across all entities
 */
export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') as EntityType | null;
    const entityId = searchParams.get('entityId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { success: false, error: 'Invalid limit parameter. Must be between 1 and 1000.' },
        { status: 400 }
      );
    }

    // If both entityType and entityId are provided, get entity-specific history
    if (entityType && entityId) {
      // Validate entityType
      if (!VALID_ENTITY_TYPES.includes(entityType)) {
        return NextResponse.json(
          { success: false, error: `Invalid entityType. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate entityId format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(entityId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid entityId format. Must be a valid UUID.' },
          { status: 400 }
        );
      }

      const history = await getEntityHistory(entityType, entityId);

      return NextResponse.json({
        success: true,
        data: history,
      });
    }

    // If only one of entityType or entityId is provided, that's an error
    if (entityType || entityId) {
      return NextResponse.json(
        { success: false, error: 'Both entityType and entityId must be provided together, or neither.' },
        { status: 400 }
      );
    }

    // Otherwise, get recent history across all entities
    const history = await getRecentHistory(limit);

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
});
