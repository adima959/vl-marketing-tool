import { NextRequest, NextResponse } from 'next/server';
import type { Product } from '@/types';
import {
  getProductById,
  getMainAnglesForProduct,
} from '@/lib/marketing-tracker/dummy-data';

interface RouteParams {
  params: Promise<{ productId: string }>;
}

/**
 * GET /api/marketing-tracker/products/[productId]
 * Get a single product with its main angles
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { productId } = await params;
    const product = getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    const mainAngles = getMainAnglesForProduct(productId);

    return NextResponse.json({
      success: true,
      data: {
        product,
        mainAngles,
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
    const product = getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // TODO: Replace with actual database update
    const updatedProduct: Product = {
      ...product,
      ...body,
      id: productId, // Ensure ID cannot be changed
      updatedAt: new Date().toISOString(),
    };

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
 * Delete a product (cascades to angles, sub-angles, assets)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { productId } = await params;
    const product = getProductById(productId);

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    const mainAngles = getMainAnglesForProduct(productId);

    // TODO: Replace with actual database delete with cascade
    // For now, return info about what would be deleted
    return NextResponse.json({
      success: true,
      data: {
        deleted: true,
        affectedAngles: mainAngles.length,
        message: `Product "${product.name}" and ${mainAngles.length} angle(s) would be deleted`,
      },
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
