/**
 * POST /api/marketing-pipeline/creatives — create a creative for a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineCreative } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import { createCreativeSchema } from '@/lib/schemas/marketingPipeline';
import type { AppUser } from '@/types/user';
import { ZodError } from 'zod';
import { unstable_rethrow } from 'next/navigation';

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, _user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    const body = createCreativeSchema.parse(rawBody);

    const creative = await createPipelineCreative({
      messageId: body.messageId,
      geo: body.geo,
      name: body.name,
      format: body.format,
      cta: body.cta || undefined,
      url: body.url || undefined,
      notes: body.notes || undefined,
    });

    await recordCreation(
      'creative',
      creative.id,
      creative as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record creative creation:', err));

    return NextResponse.json({ success: true, data: creative });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error creating creative:', error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create creative' },
      { status: 500 },
    );
  }
});
