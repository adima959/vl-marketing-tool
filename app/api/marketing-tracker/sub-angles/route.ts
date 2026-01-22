import { NextRequest, NextResponse } from 'next/server';
import type { SubAngle, CreateSubAngleRequest } from '@/types';
import {
  DUMMY_SUB_ANGLES,
  getSubAnglesForMainAngle,
  getMainAngleById,
} from '@/lib/marketing-tracker/dummy-data';

/**
 * GET /api/marketing-tracker/sub-angles
 * List sub-angles, optionally filtered by mainAngleId
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const mainAngleId = searchParams.get('mainAngleId');
    const status = searchParams.get('status');

    let subAngles = mainAngleId
      ? getSubAnglesForMainAngle(mainAngleId)
      : [...DUMMY_SUB_ANGLES];

    // Filter by status if provided
    if (status && status !== 'all') {
      subAngles = subAngles.filter((s) => s.status === status);
    }

    return NextResponse.json({
      success: true,
      data: subAngles,
    });
  } catch (error) {
    console.error('Error fetching sub-angles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sub-angles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/marketing-tracker/sub-angles
 * Create a new sub-angle
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreateSubAngleRequest = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Sub-angle name is required' },
        { status: 400 }
      );
    }

    if (!body.mainAngleId) {
      return NextResponse.json(
        { success: false, error: 'Main angle ID is required' },
        { status: 400 }
      );
    }

    // Verify main angle exists
    const mainAngle = getMainAngleById(body.mainAngleId);
    if (!mainAngle) {
      return NextResponse.json(
        { success: false, error: 'Main angle not found' },
        { status: 404 }
      );
    }

    // TODO: Replace with actual database insert
    const newSubAngle: SubAngle = {
      id: `sub-${Date.now()}`,
      mainAngleId: body.mainAngleId,
      name: body.name,
      hook: body.hook,
      description: body.description,
      status: body.status || 'idea',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assetCount: 0,
    };

    return NextResponse.json({
      success: true,
      data: newSubAngle,
    });
  } catch (error) {
    console.error('Error creating sub-angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create sub-angle' },
      { status: 500 }
    );
  }
}
