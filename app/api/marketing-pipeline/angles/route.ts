/**
 * POST /api/marketing-pipeline/angles — create a pipeline angle
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineAngle } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    if (!body.productId || !body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'productId and name are required' },
        { status: 400 },
      );
    }

    const angle = await createPipelineAngle({
      productId: body.productId,
      name: body.name.trim(),
      description: body.description,
    });

    recordCreation(
      'pipeline_angle',
      angle.id,
      angle as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record angle creation:', err));

    return NextResponse.json({ success: true, data: angle });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error creating pipeline angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create angle' },
      { status: 500 },
    );
  }
});
