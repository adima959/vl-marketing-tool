import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import type { ProductStatus } from '@/types/marketing-tracker';
import {
getProductById,
  updateProduct,
  deleteProduct,
  getAnglesByProductId,
  cascadeDeleteProduct,
  moveAnglesToProduct,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { updateProductSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ productId: string }>;
}

/**
 * GET /api/marketing-tracker/products/[productId]
 * Get a single product with its angles
 */
export const GET = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { productId } = await params;

    // Run both queries in parallel for better performance
    const [product, angles] = await Promise.all([
      getProductById(productId),
      getAnglesByProductId(productId),
    ]);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Derive counts from actual angles array (more accurate)
    const productWithAccurateCounts = {
      ...product,
      angleCount: angles.length,
      activeAngleCount: angles.filter(a => a.status === 'live' || a.status === 'in_production').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        product: productWithAccurateCounts,
        mainAngles: angles,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/marketing-tracker/products/[productId]
 * Update a product
 */
export const PUT = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = updateProductSchema.parse(rawBody);

    // Get the old product for history diff
    const oldProduct = await getProductById(productId);

    if (!oldProduct) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Update the product in the database
    const updatedProductBase = await updateProduct(productId, {
      name: body.name,
      sku: body.sku ?? undefined,
      description: body.description ?? undefined,
      notes: body.notes ?? undefined,
      color: body.color ?? undefined,
      status: body.status,
      ownerId: body.ownerId ?? undefined,
    });

    // Merge counts and owner from old product (they don't change on field updates)
    const updatedProduct = {
      ...updatedProductBase,
      owner: oldProduct.owner,
      angleCount: oldProduct.angleCount,
      activeAngleCount: oldProduct.activeAngleCount,
    };

    // Record update history (non-blocking for performance)
    recordUpdate(
      'product',
      productId,
      oldProduct as unknown as Record<string, unknown>,
      updatedProduct as unknown as Record<string, unknown>,
      changedBy
    ).catch((err) => console.error('Failed to record product update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error updating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/marketing-tracker/products/[productId]
 * Partially update product fields (name, description, notes)
 */
export const PATCH = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = updateProductSchema.parse(rawBody);

    // Get the old product for history diff
    const oldProduct = await getProductById(productId);

    if (!oldProduct) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateData: Partial<{ name: string; sku: string; description: string; notes: string; color: string; status: ProductStatus; ownerId: string | null }> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.sku !== undefined && body.sku !== null) updateData.sku = body.sku;
    if (body.description !== undefined && body.description !== null) updateData.description = body.description;
    if (body.notes !== undefined && body.notes !== null) updateData.notes = body.notes;
    if (body.color !== undefined && body.color !== null) updateData.color = body.color;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.ownerId !== undefined) updateData.ownerId = body.ownerId;

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update the product in the database
    await updateProduct(productId, updateData);

    // Re-fetch the product to get updated owner info (especially when ownerId changes)
    const updatedProduct = await getProductById(productId);

    if (!updatedProduct) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch updated product' },
        { status: 500 }
      );
    }

    // Record update history (non-blocking for performance)
    recordUpdate(
      'product',
      productId,
      oldProduct as unknown as Record<string, unknown>,
      updatedProduct as unknown as Record<string, unknown>,
      changedBy
    ).catch((err) => console.error('Failed to record product update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error updating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/marketing-tracker/products/[productId]
 * Delete a product (soft delete)
 *
 * Supports three modes via request body:
 * - { mode: "cascade" } — delete product + all children
 * - { mode: "move", targetParentId: "..." } — move angles to another product, then delete
 * - No body / default — delete product only (backward compatible)
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    const changedBy = await getChangedBy(request);

    // Parse optional body
    let mode: string = 'default';
    let targetParentId: string | undefined;
    try {
      const body = await request.json();
      if (body.mode) mode = body.mode;
      if (body.targetParentId) targetParentId = body.targetParentId;
    } catch {
      // No body — use default mode
    }

    // Get product first for history snapshot
    const product = await getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    if (mode === 'move') {
      if (!targetParentId) {
        return NextResponse.json(
          { success: false, error: 'targetParentId is required for move mode' },
          { status: 400 }
        );
      }
      const targetProduct = await getProductById(targetParentId);
      if (!targetProduct) {
        return NextResponse.json(
          { success: false, error: 'Target product not found' },
          { status: 404 }
        );
      }
      await moveAnglesToProduct(productId, targetParentId);
      await deleteProduct(productId);
    } else if (mode === 'cascade') {
      await cascadeDeleteProduct(productId);
    } else {
      await deleteProduct(productId);
    }

    // Record deletion history
    await recordDeletion(
      'product',
      productId,
      product as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete product' },
      { status: 500 }
    );
  }
});
