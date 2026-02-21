/**
 * GET  /api/marketing-pipeline/products  — List all products
 * POST /api/marketing-pipeline/products  — Create a new product
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ProductStatus } from '@/types';
import { getProducts, createProduct, updateProduct } from '@/lib/marketing-pipeline/db';
import { recordCreation } from '@/lib/marketing-pipeline/historyService';
import { getChangedBy } from '@/lib/marketing-pipeline/getChangedBy';
import { createDriveSubfolder, DRIVE_FOLDERS } from '@/lib/server/googleDrive';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { createProductSchema } from '@/lib/schemas/marketingPipeline';
import {
  INGREDIENT_CLAIMS_TEMPLATE,
  COMPETITIVE_POSITIONING_TEMPLATE,
  CUSTOMER_LANGUAGE_BANK_TEMPLATE,
} from '@/lib/marketing-pipeline/productTemplates';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

export const GET = withPermission('tools.marketing_pipeline', 'can_view', async (
  request: NextRequest,
  user: AppUser,
): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ProductStatus | null;
    const products = await getProducts(status);
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 },
    );
  }
});

export const POST = withPermission('admin.product_settings', 'can_create', async (
  request: NextRequest,
  user: AppUser,
): Promise<NextResponse> => {
  try {
    const rawBody = await request.json();
    const changedBy = await getChangedBy(request);
    const body = createProductSchema.parse(rawBody);

    const newProduct = await createProduct({
      name: body.name,
      sku: body.sku ?? undefined,
      notes: body.notes ?? undefined,
      ingredientClaims: body.ingredientClaims ?? INGREDIENT_CLAIMS_TEMPLATE,
      competitivePositioning: body.competitivePositioning ?? COMPETITIVE_POSITIONING_TEMPLATE,
      customerLanguageBank: body.customerLanguageBank ?? CUSTOMER_LANGUAGE_BANK_TEMPLATE,
      color: body.color ?? undefined,
      status: body.status,
      ownerId: body.ownerId ?? undefined,
    });

    // Auto-create Drive subfolder under the products root (non-blocking to DB insert)
    createDriveSubfolder(DRIVE_FOLDERS.productsRoot, body.name).then(async (folderId) => {
      if (folderId) {
        await updateProduct(newProduct.id, { driveFolderId: folderId });
      }
    }).catch(() => {});

    await recordCreation(
      'product',
      newProduct.id,
      newProduct as unknown as Record<string, unknown>,
      changedBy,
    );

    return NextResponse.json({ success: true, data: newProduct });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 },
      );
    }
    console.error('Error creating product:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create product' },
      { status: 500 },
    );
  }
});
