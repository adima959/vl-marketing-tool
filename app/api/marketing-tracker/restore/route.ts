import { NextRequest, NextResponse } from 'next/server';
import { cascadeRestoreProduct, findDeletedProductByName } from '@/lib/marketing-tracker/db';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { restoreProductSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

/**
 * POST /api/marketing-tracker/restore
 * Restore a soft-deleted product and all its descendants.
 * Body: { name: "ProductName" } or { id: "uuid" }
 */
export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();

    // Validate request body
    const body = restoreProductSchema.parse(rawBody);
    let productId: string | undefined;

    if (body.id) {
      productId = body.id;
    } else if (body.name) {
      const found = await findDeletedProductByName(body.name);
      if (!found) {
        return NextResponse.json(
          { success: false, error: `No deleted product found matching "${body.name}"` },
          { status: 404 }
        );
      }
      productId = found.id;
    }

    await cascadeRestoreProduct(productId!);

    return NextResponse.json({
      success: true,
      message: `Product ${productId} and all descendants restored`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error restoring product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore product' },
      { status: 500 }
    );
  }
});
