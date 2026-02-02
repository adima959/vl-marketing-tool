import { NextRequest, NextResponse } from 'next/server';
import type { SubAngle, CreateSubAngleRequest } from '@/types';
import {
  DUMMY_SUB_ANGLES,
  getSubAnglesForMainAngle,
  getMainAngleById,
} from '@/lib/marketing-tracker/dummy-data';

/**
 * @deprecated Use /api/marketing-tracker/messages instead
 * GET /api/marketing-tracker/sub-angles
 * List sub-angles (messages), optionally filtered by mainAngleId (angleId)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    // Support both old mainAngleId and new angleId params
    const angleId = searchParams.get('mainAngleId') || searchParams.get('angleId');
    const status = searchParams.get('status');

    let subAngles = angleId
      ? getSubAnglesForMainAngle(angleId)
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
 * @deprecated Use /api/marketing-tracker/messages instead
 * POST /api/marketing-tracker/sub-angles
 * Create a new sub-angle (message)
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

    // Support both old mainAngleId and new angleId
    const bodyAny = body as unknown as { mainAngleId?: string; angleId?: string };
    const angleId = bodyAny.mainAngleId || bodyAny.angleId;
    if (!angleId) {
      return NextResponse.json(
        { success: false, error: 'Angle ID is required' },
        { status: 400 }
      );
    }

    // Verify angle exists
    const angle = getMainAngleById(angleId);
    if (!angle) {
      return NextResponse.json(
        { success: false, error: 'Angle not found' },
        { status: 404 }
      );
    }

    // TODO: Replace with actual database insert
    const newSubAngle: SubAngle = {
      id: `msg-${Date.now()}`,
      angleId: angleId,
      name: body.name,
      description: body.description,
      specificPainPoint: body.specificPainPoint,
      corePromise: body.corePromise,
      keyIdea: body.keyIdea,
      primaryHookDirection: body.primaryHookDirection,
      headlines: body.headlines,
      status: body.status || 'idea',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assetCount: 0,
      creativeCount: 0,
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
