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

// Placeholder user ID until auth is implemented
const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000';

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
    const product = await getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Get angles for this product
    const angles = await getAnglesByProductId(productId);

    return NextResponse.json({
      success: true,
      data: {
        product,
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
    const updatedProduct = await updateProduct(productId, {
      name: body.name,
      description: body.description,
      notes: body.notes,
      ownerId: body.ownerId,
    });

    // Record update history
    await recordUpdate(
      'product',
      productId,
      oldProduct as unknown as Record<string, unknown>,
      updatedProduct as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

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
      PLACEHOLDER_USER_ID
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
