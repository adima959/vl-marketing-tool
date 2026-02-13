import { NextRequest, NextResponse } from 'next/server';
import type { CreateProductRequest, ProductStatus } from '@/types/marketing-tracker';
import { getProducts, createProduct } from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { createProductSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

/**
 * GET /api/marketing-tracker/products
 * List all products with stats
 */
export const GET = withPermission('tools.marketing_tracker', 'can_view', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ProductStatus | null;

    // Pass status filter to database query (null = all products)
    const products = await getProducts(status);

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/marketing-tracker/products
 * Create a new product
 */
export const POST = withPermission('admin.product_settings', 'can_create', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = createProductSchema.parse(rawBody);

    // Create the product in the database
    const newProduct = await createProduct({
      name: body.name,
      sku: body.sku ?? undefined,
      description: body.description ?? undefined,
      notes: body.notes ?? undefined,
      color: body.color ?? undefined,
      status: body.status,
      ownerId: body.ownerId ?? undefined,
    });

    // Record creation history
    await recordCreation(
      'product',
      newProduct.id,
      newProduct as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: newProduct,
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
    console.error('Error creating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 }
    );
  }
});
