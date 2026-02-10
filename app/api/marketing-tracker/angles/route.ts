import { NextRequest, NextResponse } from 'next/server';
import type { CreateAngleRequest } from '@/types/marketing-tracker';
import {
  getAnglesByProductId,
  getProductById,
  createAngle,
} from '@/lib/marketing-tracker/db';
import { recordCreation } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { createAngleSchema } from '@/lib/schemas/marketingTracker';
import { z } from 'zod';

/**
 * GET /api/marketing-tracker/angles
 * List angles, filtered by productId (required)
 */
export const GET = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const status = searchParams.get('status');

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }

    let angles = await getAnglesByProductId(productId);

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
});

/**
 * POST /api/marketing-tracker/angles
 * Create a new angle
 */
export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);

    // Validate request body
    const body = createAngleSchema.parse(rawBody);

    // Verify product exists
    const product = await getProductById(body.productId);
    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Create the angle in the database
    const newAngle = await createAngle({
      productId: body.productId,
      name: body.name,
      description: body.description ?? undefined,
      status: body.status,
    });

    // Record creation history
    await recordCreation(
      'angle',
      newAngle.id,
      newAngle as unknown as Record<string, unknown>,
      changedBy
    );

    return NextResponse.json({
      success: true,
      data: newAngle,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    console.error('Error creating angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create angle' },
      { status: 500 }
    );
  }
});
