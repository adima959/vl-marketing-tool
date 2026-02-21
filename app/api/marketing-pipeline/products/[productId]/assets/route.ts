/**
 * GET  /api/marketing-pipeline/products/[productId]/assets — List files from Drive
 * POST /api/marketing-pipeline/products/[productId]/assets — Upload file to Drive
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductById } from '@/lib/marketing-pipeline/db';
import { createDriveSubfolder, uploadFileToDrive, listDriveFilesWithSubfolders, findOrCreateSubfolder } from '@/lib/server/googleDrive';
import { withPermission } from '@/lib/rbac';
import { isValidUUID } from '@/lib/utils/validation';
import { executeQuery } from '@/lib/server/db';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

interface RouteParams {
  params: Promise<{ productId: string }>;
}

export const GET = withPermission('tools.marketing_pipeline', 'can_view', async (
  _request: NextRequest,
  _user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    if (!isValidUUID(productId)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 });
    }
    const product = await getProductById(productId);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    if (!product.assetsFolderId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const files = await listDriveFilesWithSubfolders(product.assetsFolderId);
    return NextResponse.json({ success: true, data: files });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to list assets' },
      { status: 500 },
    );
  }
});

export const POST = withPermission('tools.marketing_pipeline', 'can_edit', async (
  request: NextRequest,
  _user: AppUser,
  { params }: RouteParams,
): Promise<NextResponse> => {
  try {
    const { productId } = await params;
    if (!isValidUUID(productId)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 });
    }
    const product = await getProductById(productId);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    if (!product.driveFolderId) {
      return NextResponse.json(
        { success: false, error: 'Product has no Drive folder. Create one first.' },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File exceeds 25 MB limit' },
        { status: 400 },
      );
    }

    const fileName = (file as File).name || 'unnamed';
    const mimeType = file.type || 'application/octet-stream';
    const buffer = Buffer.from(await file.arrayBuffer());

    // Ensure assets subfolder exists (race-condition-safe)
    let assetsFolderId = product.assetsFolderId;
    if (!assetsFolderId) {
      const newFolderId = await createDriveSubfolder(product.driveFolderId, 'Assets');
      if (!newFolderId) {
        return NextResponse.json(
          { success: false, error: 'Failed to create Assets folder in Drive' },
          { status: 500 },
        );
      }

      // Atomic update: only set if still NULL (prevents race condition)
      const result = await executeQuery<{ assets_folder_id: string }>(`
        UPDATE app_products
        SET assets_folder_id = $1, updated_at = NOW()
        WHERE id = $2 AND assets_folder_id IS NULL AND deleted_at IS NULL
        RETURNING assets_folder_id
      `, [newFolderId, productId]);

      if (result.length > 0) {
        assetsFolderId = result[0].assets_folder_id;
      } else {
        // Another request won the race — re-fetch
        const refreshed = await getProductById(productId);
        assetsFolderId = refreshed?.assetsFolderId ?? null;
        if (!assetsFolderId) {
          return NextResponse.json(
            { success: false, error: 'Failed to resolve Assets folder' },
            { status: 500 },
          );
        }
      }
    }

    // Determine target folder (root Assets or a named subfolder)
    const folderName = formData.get('folder') as string | null;
    let targetFolderId = assetsFolderId;

    if (folderName && folderName !== 'root' && folderName !== 'Assets') {
      const subId = await findOrCreateSubfolder(assetsFolderId, folderName);
      if (!subId) {
        return NextResponse.json(
          { success: false, error: `Failed to create subfolder "${folderName}"` },
          { status: 500 },
        );
      }
      targetFolderId = subId;
    }

    const uploaded = await uploadFileToDrive(targetFolderId, fileName, mimeType, buffer);
    if (!uploaded) {
      return NextResponse.json(
        { success: false, error: 'Failed to upload file to Drive' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: uploaded,
      assetsFolderId,
    });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload asset' },
      { status: 500 },
    );
  }
});
