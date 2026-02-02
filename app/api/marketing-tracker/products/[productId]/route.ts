import { NextRequest, NextResponse } from 'next/server';
import {
  getProductById,
  updateProduct,
  deleteProduct,
  getAnglesByProductId,
} from '@/lib/marketing-tracker/db';
import {
  recordUpdate,
  recordDeletion,
} from '@/lib/marketing-tracker/historyService';

// Use null for changed_by until auth is implemented
// The schema supports NULL: "NULL if system or user deleted"
const SYSTEM_USER_ID: string | null = null;

interface RouteParams {
  params: Promise<{ productId: string }>;
}

/**
 * GET /api/marketing-tracker/products/[productId]
 * Get a single product with its angles
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
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
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch product' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/marketing-tracker/products/[productId]
 * Update a product
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { productId } = await params;
    const body = await request.json();

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
      description: body.description,
      notes: body.notes,
      ownerId: body.ownerId,
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
      SYSTEM_USER_ID
    ).catch((err) => console.error('Failed to record product update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/marketing-tracker/products/[productId]
 * Partially update product fields (name, description, notes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { productId } = await params;
    const body = await request.json();

    // Get the old product for history diff
    const oldProduct = await getProductById(productId);

    if (!oldProduct) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateData: Partial<{ name: string; description: string; notes: string; ownerId: string }> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.ownerId !== undefined) updateData.ownerId = body.ownerId;

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update the product in the database
    const updatedProductBase = await updateProduct(productId, updateData);

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
      SYSTEM_USER_ID
    ).catch((err) => console.error('Failed to record product update history:', err));

    return NextResponse.json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/marketing-tracker/products/[productId]
 * Delete a product (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { productId } = await params;

    // Get product first for history snapshot
    const product = await getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Soft delete the product
    await deleteProduct(productId);

    // Record deletion history
    await recordDeletion(
      'product',
      productId,
      product as unknown as Record<string, unknown>,
      SYSTEM_USER_ID
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
