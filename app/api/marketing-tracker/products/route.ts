import { NextRequest, NextResponse } from 'next/server';
import type { CreateProductRequest } from '@/types/marketing-tracker';
import { getProducts, createProduct } from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';

// Placeholder user ID until auth is implemented
const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * GET /api/marketing-tracker/products
 * List all products with stats
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('ownerId');

    let products = await getProducts();

    // Filter by owner if provided
    if (ownerId && ownerId !== 'all') {
      products = products.filter((p) => p.ownerId === ownerId);
    }

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/marketing-tracker/products
 * Create a new product
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreateProductRequest = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Product name is required' },
        { status: 400 }
      );
    }

    if (!body.ownerId) {
      return NextResponse.json(
        { success: false, error: 'Owner ID is required' },
        { status: 400 }
      );
    }

    // Create the product in the database
    const newProduct = await createProduct({
      name: body.name,
      description: body.description,
      notes: body.notes,
      ownerId: body.ownerId,
    });

    // Record creation history
    await recordCreation(
      'product',
      newProduct.id,
      newProduct as unknown as Record<string, unknown>,
      PLACEHOLDER_USER_ID
    );

    return NextResponse.json({
      success: true,
      data: newProduct,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 }
    );
  }
}
