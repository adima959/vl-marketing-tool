/**
 * GET  /api/marketing-pipeline/products/[productId]/assets/[fileId] — Download file from Drive
 * DELETE /api/marketing-pipeline/products/[productId]/assets/[fileId] — Delete file from Drive
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductById } from '@/lib/marketing-pipeline/db';
import { deleteDriveFile, downloadDriveFile } from '@/lib/server/googleDrive';
import { withPermission } from '@/lib/rbac';
import { isValidUUID, isValidDriveId } from '@/lib/utils/validation';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

interface RouteParams {
  params: Promise<{ productId: string; fileId: string }>;
}

export const GET = withPermission('tools.marketing_pipeline', 'can_view', async (
  _request: NextRequest,
  _user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId, fileId } = await params;
    if (!isValidUUID(productId) || !isValidDriveId(fileId)) {
      return NextResponse.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
    }
    const product = await getProductById(productId);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const result = await downloadDriveFile(fileId);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Download failed' }, { status: 500 });
    }

    return new NextResponse(result.body, {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        ...(result.size ? { 'Content-Length': result.size } : {}),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ success: false, error: 'Download failed' }, { status: 500 });
  }
});

export const DELETE = withPermission('tools.marketing_pipeline', 'can_edit', async (
  _request: NextRequest,
  _user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId, fileId } = await params;
    if (!isValidUUID(productId) || !isValidDriveId(fileId)) {
      return NextResponse.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
    }
    const product = await getProductById(productId);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    if (!product.assetsFolderId) {
      return NextResponse.json({ success: false, error: 'No assets folder' }, { status: 400 });
    }

    const deleted = await deleteDriveFile(fileId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete file from Drive' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete asset' },
      { status: 500 },
    );
  }
});
