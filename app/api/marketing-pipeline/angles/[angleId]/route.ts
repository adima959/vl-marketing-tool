/**
 * DELETE /api/marketing-pipeline/angles/[angleId] — soft-delete a pipeline angle
 */

import { NextRequest, NextResponse } from 'next/server';
import { deletePipelineAngle, getAngleMessageCount } from '@/lib/marketing-pipeline/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ angleId: string }> },
): Promise<NextResponse> {
  try {
    const { angleId } = await params;

    if (!angleId) {
      return NextResponse.json(
        { success: false, error: 'angleId is required' },
        { status: 400 },
      );
    }

    // Check if angle has messages — prevent deletion if so
    const messageCount = await getAngleMessageCount(angleId);
    if (messageCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete angle with ${messageCount} message(s). Remove messages first.` },
        { status: 409 },
      );
    }

    await deletePipelineAngle(angleId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pipeline angle:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete angle' },
      { status: 500 },
    );
  }
}
