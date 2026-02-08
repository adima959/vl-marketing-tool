import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { maskErrorForClient } from '@/lib/types/errors';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

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

/**
 * GET /api/on-page-analysis/url-classifications
 * Returns unclassified URL paths, classified entries, ignored entries, and product list
 */
async function handleGet(
  _request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
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
      executeQuery<UnclassifiedRow>(
        `SELECT DISTINCT url_path
         FROM remote_session_tracker.event_page_view_enriched_v2
         WHERE url_path IS NOT NULL
           AND url_path != ''
           AND url_path NOT IN (SELECT url_path FROM app_url_classifications)
         ORDER BY url_path
         LIMIT 500`
      ),
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
    const masked = maskErrorForClient(error, 'url-classifications:GET');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/** Country code detection from URL path segments */
const COUNTRY_PATTERNS: Record<string, string> = {
  nor: 'NO', no: 'NO', norway: 'NO',
  dnk: 'DK', dk: 'DK', denmark: 'DK',
  swe: 'SE', sve: 'SE', se: 'SE', sweden: 'SE',
  fin: 'FI', fi: 'FI', finland: 'FI',
};

const VALID_COUNTRY_CODES = ['NO', 'SE', 'DK', 'FI'];

/**
 * Try to auto-match a URL path to a product + country.
 * Returns { productId, countryCode } or null if no match.
 */
function tryAutoMatch(
  urlPath: string,
  products: { id: string; name: string }[]
): { productId: string; countryCode: string } | null {
  // Split path into segments: "/dnk/balansera/" → ["dnk", "balansera"]
  const segments = urlPath
    .split('/')
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);

  // Detect country from segments
  let countryCode: string | null = null;
  for (const seg of segments) {
    if (COUNTRY_PATTERNS[seg]) {
      countryCode = COUNTRY_PATTERNS[seg];
      break;
    }
  }

  // Detect product: check if any segment matches a product name (case-insensitive)
  // Normalizes both sides by stripping hyphens/spaces for comparison
  // e.g. URL "sleep-repair" → "sleeprepair" matches product "SleepRepair" → "sleeprepair"
  // Also matches prefix abbreviations: "flex" → starts "flexrepair" (min 3 chars)
  let productId: string | null = null;
  for (const product of products) {
    const productNorm = product.name.toLowerCase().replace(/[-\s]+/g, '');
    for (const seg of segments) {
      const segNorm = seg.replace(/-/g, '');
      if (
        segNorm === productNorm ||
        (segNorm.length >= 3 && productNorm.startsWith(segNorm))
      ) {
        productId = product.id;
        break;
      }
    }
    if (productId) break;
  }

  if (countryCode && productId) {
    return { productId, countryCode };
  }
  return null;
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
      executeQuery<UnclassifiedRow>(
        `SELECT DISTINCT url_path
         FROM remote_session_tracker.event_page_view_enriched_v2
         WHERE url_path IS NOT NULL
           AND url_path != ''
           AND url_path NOT IN (SELECT url_path FROM app_url_classifications)
         ORDER BY url_path
         LIMIT 500`
      ),
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

    // Ignore action: insert with is_ignored=true, no product/country needed
    if (action === 'ignore') {
      const rows = await executeQuery<{ id: string; url_path: string }>(
        `INSERT INTO app_url_classifications (url_path, is_ignored, classified_by)
         VALUES ($1, true, $2)
         RETURNING id, url_path`,
        [urlPath, user.id]
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
      [urlPath, productId, countryCode, user.id]
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
    const masked = maskErrorForClient(error, 'url-classifications:DELETE');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
export const PUT = withAuth(handlePut);
export const DELETE = withAuth(handleDelete);
