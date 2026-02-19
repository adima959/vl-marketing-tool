/**
 * GET  /api/marketing-pipeline/products/[productId]/cpa-targets — Fetch CPA targets
 * PUT  /api/marketing-pipeline/products/[productId]/cpa-targets — Upsert CPA targets
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchCpaTargets, upsertCpaTargets, getProductById } from '@/lib/marketing-pipeline/db';
import { recordUpdate } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

interface RouteParams {
  params: Promise<{ productId: string }>;
}

const cpaTargetSchema = z.object({
  targets: z.array(z.object({
    geo: z.enum(['NO', 'SE', 'DK', 'FI']),
    channel: z.enum(['meta', 'google', 'taboola', 'other']),
    target: z.number().positive(),
  })),
});

export const GET = withPermission('tools.marketing_pipeline', 'can_view', async (
  _request: NextRequest,
  _user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    const targets = await fetchCpaTargets(productId);
    return NextResponse.json({ success: true, data: targets });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CPA targets' },
      { status: 500 },
    );
  }
});

export const PUT = withPermission('tools.marketing_pipeline', 'can_edit', async (
  request: NextRequest,
  _user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    const rawBody = await request.json();
    const { targets } = cpaTargetSchema.parse(rawBody);
    const changedBy = await getChangedBy(request);

    const before = await fetchCpaTargets(productId);
    const updated = await upsertCpaTargets(productId, targets);

    // Record history for audit trail
    const existing = await getProductById(productId);
    await recordUpdate(
      'product',
      productId,
      { cpaTargets: before } as unknown as Record<string, unknown>,
      { cpaTargets: updated, ...(existing ? { name: existing.name } : {}) } as unknown as Record<string, unknown>,
      changedBy,
    ).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update CPA targets' },
      { status: 500 },
    );
  }
});
