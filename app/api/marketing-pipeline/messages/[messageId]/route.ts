/**
 * GET    /api/marketing-pipeline/messages/[messageId] — message detail
 * PATCH  /api/marketing-pipeline/messages/[messageId] — update fields
 * DELETE /api/marketing-pipeline/messages/[messageId] — soft delete
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPipelineMessageDetail,
  updatePipelineMessage,
  deletePipelineMessage,
} from '@/lib/marketing-pipeline/db';
import { recordUpdate, recordDeletion } from '@/lib/marketing-tracker/historyService';
import { getChangedBy } from '@/lib/marketing-tracker/getChangedBy';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface RouteParams {
  params: Promise<{ messageId: string }>;
}

export const GET = withAuth(async (
  _request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    const detail = await getPipelineMessageDetail(messageId);

    if (!detail) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: detail });
  } catch (error) {
    console.error('Error fetching pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch message' },
      { status: 500 },
    );
  }
});

export const PATCH = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    const body = await request.json();
    const changedBy = await getChangedBy(request);

    // Get old state for history diff
    const oldMessage = await getPipelineMessageDetail(messageId);
    if (!oldMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    const updated = await updatePipelineMessage(messageId, {
      name: body.name,
      description: body.description,
      angleId: body.angleId,
      specificPainPoint: body.specificPainPoint,
      corePromise: body.corePromise,
      keyIdea: body.keyIdea,
      primaryHookDirection: body.primaryHookDirection,
      headlines: body.headlines,
      spendThreshold: body.spendThreshold,
      notes: body.notes,
    });

    // Record history (non-blocking)
    recordUpdate(
      'pipeline_message',
      messageId,
      oldMessage as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record pipeline message history:', err));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message' },
      { status: 500 },
    );
  }
});

export const DELETE = withAuth(async (
  request: NextRequest,
  user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { messageId } = await params;
    const changedBy = await getChangedBy(request);

    const existing = await getPipelineMessageDetail(messageId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 },
      );
    }

    await deletePipelineMessage(messageId);

    recordDeletion(
      'pipeline_message',
      messageId,
      existing as unknown as Record<string, unknown>,
      changedBy,
    ).catch(err => console.error('Failed to record message deletion:', err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pipeline message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete message' },
      { status: 500 },
    );
  }
});
