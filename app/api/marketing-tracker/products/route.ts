import { NextRequest, NextResponse } from 'next/server';
import type { Product, ProductWithStats, CreateProductRequest } from '@/types';
import {
  getProductsWithStats,
  DUMMY_PRODUCTS,
  DUMMY_USERS,
} from '@/lib/marketing-tracker/dummy-data';

/**
 * GET /api/marketing-tracker/products
 * List all products with stats
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('ownerId');

    let products = getProductsWithStats();

    // Filter by owner if provided
    if (ownerId && ownerId !== 'all') {
      products = products.filter((p) => p.ownerId === ownerId);
    }

    return NextResponse.json({
      success: true,
      data: products,
      users: DUMMY_USERS,
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

    // TODO: Replace with actual database insert
    const newProduct: ProductWithStats = {
      id: `prod-${Date.now()}`,
      name: body.name,
      description: body.description,
      ownerId: body.ownerId,
      owner: DUMMY_USERS.find((u) => u.id === body.ownerId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      angleCount: 0,
      activeAngleCount: 0,
    };

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
