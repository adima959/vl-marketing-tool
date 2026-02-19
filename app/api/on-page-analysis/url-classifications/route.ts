import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { maskErrorForClient } from '@/lib/types/errors';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';
import { matchProductAndCountry } from '@/lib/utils/classificationMatching';

interface ClassifiedRow {
  id: string;
  url_path: string;
  product_id: string;
  product_name: string;
  product_color: string;
  country_code: string;
}

interface IgnoredRow {
  id: string;
  url_path: string;
}

interface ProductRow {
  id: string;
  name: string;
  color: string;
}

interface UnclassifiedRow {
  url_path: string;
}

/** Shared unclassified URL query */
const UNCLASSIFIED_URL_QUERY = `
  SELECT DISTINCT pv.url_path
  FROM remote_session_tracker.event_page_view_enriched_v2 pv
  WHERE pv.url_path IS NOT NULL
    AND pv.url_path != ''
    AND NOT EXISTS (
      SELECT 1 FROM app_url_classifications uc
      WHERE uc.url_path = pv.url_path
    )
  ORDER BY pv.url_path
  LIMIT 500`;

/** Lightweight count-only version */
const UNCLASSIFIED_URL_COUNT_QUERY = `
  SELECT COUNT(*) as count FROM (
    SELECT DISTINCT pv.url_path
    FROM remote_session_tracker.event_page_view_enriched_v2 pv
    WHERE pv.url_path IS NOT NULL
      AND pv.url_path != ''
      AND NOT EXISTS (
        SELECT 1 FROM app_url_classifications uc
        WHERE uc.url_path = pv.url_path
      )
    LIMIT 500
  ) t`;

/**
 * GET /api/on-page-analysis/url-classifications
 * ?count=true → returns only unclassified count (lightweight)
 * Otherwise → returns full data: unclassified, classified, ignored, products
 */
async function handleGet(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    // Lightweight count-only mode for badge display
    if (request.nextUrl.searchParams.get('count') === 'true') {
      const rows = await executeQuery<{ count: string }>(UNCLASSIFIED_URL_COUNT_QUERY);
      return NextResponse.json({
        success: true,
        data: { unclassifiedCount: Number(rows[0].count) },
      });
    }

    const [products, classified, ignored, unclassified] = await Promise.all([
      // Active products for the dropdown
      executeQuery<ProductRow>(
        `SELECT id, name, COALESCE(color, '#6b7280') as color
         FROM app_products
         WHERE status = 'active' AND deleted_at IS NULL
         ORDER BY name`
      ),

      // Classified URLs (not ignored) with product info
      executeQuery<ClassifiedRow>(
        `SELECT uc.id, uc.url_path, uc.product_id, uc.country_code,
                p.name as product_name, COALESCE(p.color, '#6b7280') as product_color
         FROM app_url_classifications uc
         JOIN app_products p ON p.id = uc.product_id
         WHERE uc.is_ignored = false
         ORDER BY p.name, uc.url_path`
      ),

      // Ignored URLs
      executeQuery<IgnoredRow>(
        `SELECT id, url_path
         FROM app_url_classifications
         WHERE is_ignored = true
         ORDER BY url_path`
      ),

      // Unclassified: distinct url_paths not in the mapping table
      executeQuery<UnclassifiedRow>(UNCLASSIFIED_URL_QUERY),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        unclassified: unclassified.map((r) => r.url_path),
        classified: classified.map((r) => ({
          id: r.id,
          urlPath: r.url_path,
          productId: r.product_id,
          productName: r.product_name,
          productColor: r.product_color,
          countryCode: r.country_code,
        })),
        ignored: ignored.map((r) => ({
          id: r.id,
          urlPath: r.url_path,
        })),
        products: products.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
        })),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    const masked = maskErrorForClient(error, 'url-classifications:GET');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

const VALID_COUNTRY_CODES = ['NO', 'SE', 'DK', 'FI'];

/**
 * Try to auto-match a URL path to a product + country.
 * Returns { productId, countryCode } or null if no match.
 */
function tryAutoMatch(
  urlPath: string,
  products: { id: string; name: string }[]
): { productId: string; countryCode: string } | null {
  const segments = urlPath
    .split('/')
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
  return matchProductAndCountry(segments, products);
}

/**
 * PUT /api/on-page-analysis/url-classifications
 * Auto-match unclassified URLs to products based on URL path patterns
 */
async function handlePut(
  _request: NextRequest,
  user: AppUser
): Promise<NextResponse> {
  try {
    // Fetch unclassified URLs and all active products
    const [unclassified, products] = await Promise.all([
      executeQuery<UnclassifiedRow>(UNCLASSIFIED_URL_QUERY),
      executeQuery<ProductRow>(
        `SELECT id, name, COALESCE(color, '#6b7280') as color
         FROM app_products
         WHERE status = 'active' AND deleted_at IS NULL`
      ),
    ]);

    const matched: ClassifiedRow[] = [];
    for (const row of unclassified) {
      const match = tryAutoMatch(row.url_path, products);
      if (match) {
        try {
          const inserted = await executeQuery<{ id: string; url_path: string; product_id: string; country_code: string }>(
            `INSERT INTO app_url_classifications (url_path, product_id, country_code, classified_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (url_path) DO NOTHING
             RETURNING id, url_path, product_id, country_code`,
            [row.url_path, match.productId, match.countryCode, user.id]
          );
          if (inserted.length > 0) {
            const product = products.find((p) => p.id === match.productId);
            matched.push({
              id: inserted[0].id,
              url_path: inserted[0].url_path,
              product_id: inserted[0].product_id,
              product_name: product?.name ?? 'Unknown',
              product_color: product?.color ?? '#6b7280',
              country_code: inserted[0].country_code,
            });
          }
        } catch {
          // Skip duplicates or other insert errors
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        matchedCount: matched.length,
        matched: matched.map((r) => ({
          id: r.id,
          urlPath: r.url_path,
          productId: r.product_id,
          productName: r.product_name,
          productColor: r.product_color,
          countryCode: r.country_code,
        })),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    const masked = maskErrorForClient(error, 'url-classifications:PUT');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * POST /api/on-page-analysis/url-classifications
 * Classify or ignore a URL path
 * Body: { urlPath, productId, countryCode } for classify
 * Body: { urlPath, action: 'ignore' } for ignore
 */
async function handlePost(
  request: NextRequest,
  user: AppUser
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { urlPath, action } = body;

    if (!urlPath || typeof urlPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'urlPath is required' },
        { status: 400 }
      );
    }

    // Strip query params and fragments to prevent duplicates
    const normalizedPath = urlPath.split('?')[0].split('#')[0];

    // Ignore action: insert with is_ignored=true, no product/country needed
    if (action === 'ignore') {
      const rows = await executeQuery<{ id: string; url_path: string }>(
        `INSERT INTO app_url_classifications (url_path, is_ignored, classified_by)
         VALUES ($1, true, $2)
         RETURNING id, url_path`,
        [normalizedPath, user.id]
      );
      return NextResponse.json({
        success: true,
        data: { id: rows[0].id, urlPath: rows[0].url_path },
      });
    }

    // Classify action: requires product + country
    const { productId, countryCode } = body;
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }
    if (!VALID_COUNTRY_CODES.includes(countryCode)) {
      return NextResponse.json(
        { success: false, error: `countryCode must be one of: ${VALID_COUNTRY_CODES.join(', ')}` },
        { status: 400 }
      );
    }

    const rows = await executeQuery<ClassifiedRow>(
      `INSERT INTO app_url_classifications (url_path, product_id, country_code, classified_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, url_path, product_id, country_code`,
      [normalizedPath, productId, countryCode, user.id]
    );

    // Fetch product info for the response
    const productRows = await executeQuery<{ name: string; color: string }>(
      `SELECT name, COALESCE(color, '#6b7280') as color FROM app_products WHERE id = $1`,
      [productId]
    );
    const product = productRows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: rows[0].id,
        urlPath: rows[0].url_path,
        productId: rows[0].product_id,
        productName: product?.name ?? 'Unknown',
        productColor: product?.color ?? '#6b7280',
        countryCode: rows[0].country_code,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { success: false, error: 'This URL path is already classified' },
        { status: 409 }
      );
    }
    const masked = maskErrorForClient(error, 'url-classifications:POST');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * DELETE /api/on-page-analysis/url-classifications
 * Remove a classification (move URL back to unclassified)
 */
async function handleDelete(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    // Get the url_path before deleting so we can return it
    const existing = await executeQuery<{ url_path: string }>(
      `DELETE FROM app_url_classifications WHERE id = $1 RETURNING url_path`,
      [id]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Classification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { urlPath: existing[0].url_path },
    });
  } catch (error) {
    unstable_rethrow(error);
    const masked = maskErrorForClient(error, 'url-classifications:DELETE');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

export const GET = withPermission('admin.data_maps', 'can_view', handleGet);
export const POST = withPermission('admin.data_maps', 'can_create', handlePost);
export const PUT = withPermission('admin.data_maps', 'can_edit', handlePut);
export const DELETE = withPermission('admin.data_maps', 'can_delete', handleDelete);
