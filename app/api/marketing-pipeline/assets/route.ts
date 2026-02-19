/**
 * POST /api/marketing-pipeline/assets — create an asset for a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPipelineAsset } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import { createAssetSchema } from '@/lib/schemas/marketingPipeline';
import type { AppUser } from '@/types/user';
import { ZodError } from 'zod';
import { unstable_rethrow } from 'next/navigation';

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, _user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    const body = createAssetSchema.parse(rawBody);

    const asset = await createPipelineAsset({
      messageId: body.messageId,
      geo: body.geo,
      type: body.type,
      name: body.name,
      url: body.url || undefined,
      content: body.content || undefined,
      notes: body.notes || undefined,
    });

    await recordCreation(
      'asset',
      asset.id,
      asset as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record asset creation:', err));

    return NextResponse.json({ success: true, data: asset });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error creating asset:', error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create asset' },
      { status: 500 },
    );
  }
});
