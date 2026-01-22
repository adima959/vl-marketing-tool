import { NextRequest, NextResponse } from 'next/server';
import type { MainAngle, CreateMainAngleRequest } from '@/types';
import {
  DUMMY_MAIN_ANGLES,
  getMainAnglesForProduct,
  getProductById,
} from '@/lib/marketing-tracker/dummy-data';

/**
 * GET /api/marketing-tracker/angles
 * List angles, optionally filtered by productId
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const status = searchParams.get('status');

    let angles = productId
      ? getMainAnglesForProduct(productId)
      : [...DUMMY_MAIN_ANGLES];

    // Filter by status if provided
    if (status && status !== 'all') {
      angles = angles.filter((a) => a.status === status);
    }

    return NextResponse.json({
      success: true,
      data: angles,
    });
  } catch (error) {
    console.error('Error fetching angles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch angles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/marketing-tracker/angles
 * Create a new main angle
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreateMainAngleRequest = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Angle name is required' },
        { status: 400 }
      );
    }

    if (!body.productId) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Verify product exists
    const product = getProductById(body.productId);
    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // TODO: Replace with actual database insert
    const newAngle: MainAngle = {
      id: `angle-${Date.now()}`,
      productId: body.productId,
      name: body.name,
      targetAudience: body.targetAudience,
      painPoint: body.painPoint,
      hook: body.hook,
      description: body.description,
      status: body.status || 'idea',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subAngleCount: 0,
    };

    return NextResponse.json({
      success: true,
      data: newAngle,
    });
  } catch (error) {
    console.error('Error creating angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create angle' },
      { status: 500 }
    );
  }
}
