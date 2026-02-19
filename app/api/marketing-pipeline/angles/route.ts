/**
 * GET  /api/marketing-pipeline/angles — list all products + angles
 * POST /api/marketing-pipeline/angles — create a pipeline angle
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPipelineAngle, getProductById, getPipelineAngles } from '@/lib/marketing-pipeline/db';
import { getProductsWithCpa } from '@/lib/marketing-pipeline/db';
import { createDriveSubfolder } from '@/lib/server/googleDrive';
import { createPipelineAngleSchema } from '@/lib/schemas/marketingPipeline';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const GET = withPermission('admin.data_maps', 'can_view', async (): Promise<NextResponse> => {
  try {
    const [products, angles] = await Promise.all([
      getProductsWithCpa(),
      getPipelineAngles(),
    ]);
    return NextResponse.json({ success: true, data: { products, angles } });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch angles data' },
      { status: 500 },
    );
  }
});

export const POST = withPermission('tools.marketing_pipeline', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const body = createPipelineAngleSchema.parse(rawBody);
    const changedBy = await getChangedBy(request);

    // Auto-create Drive subfolder if product has a linked Drive folder
    let driveFolderId: string | undefined;
    const product = await getProductById(body.productId);
    if (product?.driveFolderId) {
      const folderId = await createDriveSubfolder(product.driveFolderId, body.name);
      if (folderId) driveFolderId = folderId;
    }

    const angle = await createPipelineAngle({
      productId: body.productId,
      name: body.name,
      description: body.description ?? undefined,
      driveFolderId,
    });

    await recordCreation(
      'pipeline_angle',
      angle.id,
      angle as unknown as Record<string, unknown>,
      changedBy,
    ).catch(() => {});

    return NextResponse.json({ success: true, data: angle });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid request data' }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create angle' },
      { status: 500 },
    );
  }
});
