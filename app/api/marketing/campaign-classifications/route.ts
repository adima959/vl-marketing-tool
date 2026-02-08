import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { maskErrorForClient } from '@/lib/types/errors';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface ClassifiedRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  product_id: string;
  product_name: string;
  product_color: string;
  country_code: string;
}

interface IgnoredRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
}

interface ProductRow {
  id: string;
  name: string;
  color: string;
}

interface UnclassifiedRow {
  campaign_id: string;
  campaign_name: string;
}

const VALID_COUNTRY_CODES = ['NO', 'SE', 'DK', 'FI'];

/**
 * GET /api/marketing/campaign-classifications
 * Returns unclassified campaigns, classified entries, ignored entries, and product list
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

      // Classified campaigns (not ignored) with product info
      executeQuery<ClassifiedRow>(
        `SELECT cc.id, cc.campaign_id,
                COALESCE(m.campaign_name, cc.campaign_id) as campaign_name,
                cc.product_id, cc.country_code,
                p.name as product_name, COALESCE(p.color, '#6b7280') as product_color
         FROM app_campaign_classifications cc
         JOIN app_products p ON p.id = cc.product_id
         LEFT JOIN LATERAL (
           SELECT DISTINCT campaign_name FROM merged_ads_spending
           WHERE campaign_id = cc.campaign_id LIMIT 1
         ) m ON true
         WHERE cc.is_ignored = false
         ORDER BY p.name, campaign_name`
      ),

      // Ignored campaigns
      executeQuery<IgnoredRow>(
        `SELECT cc.id, cc.campaign_id,
                COALESCE(m.campaign_name, cc.campaign_id) as campaign_name
         FROM app_campaign_classifications cc
         LEFT JOIN LATERAL (
           SELECT DISTINCT campaign_name FROM merged_ads_spending
           WHERE campaign_id = cc.campaign_id LIMIT 1
         ) m ON true
         WHERE cc.is_ignored = true
         ORDER BY campaign_name`
      ),

      // Unclassified: distinct campaigns not in the mapping table
      executeQuery<UnclassifiedRow>(
        `SELECT DISTINCT campaign_id, campaign_name
         FROM merged_ads_spending
         WHERE campaign_id IS NOT NULL
           AND campaign_id != ''
           AND campaign_id NOT IN (SELECT campaign_id FROM app_campaign_classifications)
         ORDER BY campaign_name
         LIMIT 500`
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        unclassified: unclassified.map((r) => ({
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
        })),
        classified: classified.map((r) => ({
          id: r.id,
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
          productId: r.product_id,
          productName: r.product_name,
          productColor: r.product_color,
          countryCode: r.country_code,
        })),
        ignored: ignored.map((r) => ({
          id: r.id,
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
        })),
        products: products.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
        })),
      },
    });
  } catch (error) {
    const masked = maskErrorForClient(error, 'campaign-classifications:GET');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/** Country code detection from campaign name segments */
const COUNTRY_PATTERNS: Record<string, string> = {
  nor: 'NO', no: 'NO', norway: 'NO',
  dnk: 'DK', dk: 'DK', denmark: 'DK',
  swe: 'SE', sve: 'SE', se: 'SE', sweden: 'SE',
  fin: 'FI', fi: 'FI', finland: 'FI',
};

/**
 * Try to auto-match a campaign name to a product + country.
 * Campaign names often follow patterns like "Balansera - DNK - Q1 2024"
 */
function tryAutoMatch(
  campaignName: string,
  products: { id: string; name: string }[]
): { productId: string; countryCode: string } | null {
  // Split on common delimiters: " - ", "_", " "
  const segments = campaignName
    .split(/[\s_-]+/)
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);

  // Detect country
  let countryCode: string | null = null;
  for (const seg of segments) {
    if (COUNTRY_PATTERNS[seg]) {
      countryCode = COUNTRY_PATTERNS[seg];
      break;
    }
  }

  // Detect product: check if any segment matches a product name
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
 * PUT /api/marketing/campaign-classifications
 * Auto-match unclassified campaigns to products based on campaign name patterns
 */
async function handlePut(
  _request: NextRequest,
  user: AppUser
): Promise<NextResponse> {
  try {
    const [unclassified, products] = await Promise.all([
      executeQuery<UnclassifiedRow>(
        `SELECT DISTINCT campaign_id, campaign_name
         FROM merged_ads_spending
         WHERE campaign_id IS NOT NULL
           AND campaign_id != ''
           AND campaign_id NOT IN (SELECT campaign_id FROM app_campaign_classifications)
         ORDER BY campaign_name
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
      const match = tryAutoMatch(row.campaign_name, products);
      if (match) {
        try {
          const inserted = await executeQuery<{ id: string; campaign_id: string; product_id: string; country_code: string }>(
            `INSERT INTO app_campaign_classifications (campaign_id, product_id, country_code, classified_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (campaign_id) DO NOTHING
             RETURNING id, campaign_id, product_id, country_code`,
            [row.campaign_id, match.productId, match.countryCode, user.id]
          );
          if (inserted.length > 0) {
            const product = products.find((p) => p.id === match.productId);
            matched.push({
              id: inserted[0].id,
              campaign_id: inserted[0].campaign_id,
              campaign_name: row.campaign_name,
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
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
          productId: r.product_id,
          productName: r.product_name,
          productColor: r.product_color,
          countryCode: r.country_code,
        })),
      },
    });
  } catch (error) {
    const masked = maskErrorForClient(error, 'campaign-classifications:PUT');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * POST /api/marketing/campaign-classifications
 * Classify or ignore a campaign
 * Body: { campaignId, productId, countryCode } for classify
 * Body: { campaignId, action: 'ignore' } for ignore
 */
async function handlePost(
  request: NextRequest,
  user: AppUser
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { campaignId, action } = body;

    if (!campaignId || typeof campaignId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'campaignId is required' },
        { status: 400 }
      );
    }

    // Look up campaign name for response
    const nameRows = await executeQuery<{ campaign_name: string }>(
      `SELECT DISTINCT campaign_name FROM merged_ads_spending WHERE campaign_id = $1 LIMIT 1`,
      [campaignId]
    );
    const campaignName = nameRows[0]?.campaign_name ?? campaignId;

    // Ignore action
    if (action === 'ignore') {
      const rows = await executeQuery<{ id: string; campaign_id: string }>(
        `INSERT INTO app_campaign_classifications (campaign_id, is_ignored, classified_by)
         VALUES ($1, true, $2)
         ON CONFLICT (campaign_id) DO UPDATE SET is_ignored = true, product_id = NULL, country_code = NULL
         RETURNING id, campaign_id`,
        [campaignId, user.id]
      );
      return NextResponse.json({
        success: true,
        data: { id: rows[0].id, campaignId: rows[0].campaign_id, campaignName },
      });
    }

    // Classify action
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

    const rows = await executeQuery<{ id: string; campaign_id: string; product_id: string; country_code: string }>(
      `INSERT INTO app_campaign_classifications (campaign_id, product_id, country_code, classified_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (campaign_id) DO UPDATE SET product_id = $2, country_code = $3, is_ignored = false
       RETURNING id, campaign_id, product_id, country_code`,
      [campaignId, productId, countryCode, user.id]
    );

    const productRows = await executeQuery<{ name: string; color: string }>(
      `SELECT name, COALESCE(color, '#6b7280') as color FROM app_products WHERE id = $1`,
      [productId]
    );
    const product = productRows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: rows[0].id,
        campaignId: rows[0].campaign_id,
        campaignName,
        productId: rows[0].product_id,
        productName: product?.name ?? 'Unknown',
        productColor: product?.color ?? '#6b7280',
        countryCode: rows[0].country_code,
      },
    });
  } catch (error) {
    const masked = maskErrorForClient(error, 'campaign-classifications:POST');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * DELETE /api/marketing/campaign-classifications
 * Remove a classification (move campaign back to unclassified)
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

    const existing = await executeQuery<{ campaign_id: string }>(
      `DELETE FROM app_campaign_classifications WHERE id = $1 RETURNING campaign_id`,
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
      data: { campaignId: existing[0].campaign_id },
    });
  } catch (error) {
    const masked = maskErrorForClient(error, 'campaign-classifications:DELETE');
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
