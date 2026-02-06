import { NextRequest, NextResponse } from 'next/server';
import { cascadeRestoreProduct, findDeletedProductByName } from '@/lib/marketing-tracker/db';

/**
 * POST /api/marketing-tracker/restore
 * Restore a soft-deleted product and all its descendants.
 * Body: { name: "ProductName" } or { id: "uuid" }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
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
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide either "id" or "name" in request body' },
        { status: 400 }
      );
    }

    await cascadeRestoreProduct(productId!);

    return NextResponse.json({
      success: true,
      message: `Product ${productId} and all descendants restored`,
    });
  } catch (error) {
    console.error('Error restoring product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore product' },
      { status: 500 }
    );
  }
}
