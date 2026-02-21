/**
 * Backfill: Pre-fill empty product research sections with templates
 *
 * For each product where ingredient_claims, competitive_positioning, or
 * customer_language_bank is NULL or empty, fill with the default template.
 * Skips fields that already have content (uses COALESCE/NULLIF).
 *
 * Usage: npx tsx scripts/backfill-product-templates.ts [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { Pool } from '@neondatabase/serverless';
import {
  INGREDIENT_CLAIMS_TEMPLATE,
  COMPETITIVE_POSITIONING_TEMPLATE,
  CUSTOMER_LANGUAGE_BANK_TEMPLATE,
} from '@/lib/marketing-pipeline/productTemplates';

// Load .env.local manually (no dotenv installed)
const envPath = path.resolve(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

// Fixed query: only fills NULL/empty/whitespace-only/<p></p> fields, leaves existing content intact.
// $1 = ingredient template, $2 = competitive template, $3 = language bank template
const BACKFILL_SQL = `
  UPDATE app_products
  SET
    ingredient_claims = CASE
      WHEN COALESCE(NULLIF(TRIM(ingredient_claims), ''), NULL) IS NULL
        OR TRIM(ingredient_claims) = '<p></p>'
      THEN $1 ELSE ingredient_claims END,
    competitive_positioning = CASE
      WHEN COALESCE(NULLIF(TRIM(competitive_positioning), ''), NULL) IS NULL
        OR TRIM(competitive_positioning) = '<p></p>'
      THEN $2 ELSE competitive_positioning END,
    customer_language_bank = CASE
      WHEN COALESCE(NULLIF(TRIM(customer_language_bank), ''), NULL) IS NULL
        OR TRIM(customer_language_bank) = '<p></p>'
      THEN $3 ELSE customer_language_bank END
  WHERE
    ingredient_claims IS NULL OR TRIM(ingredient_claims) IN ('', '<p></p>')
    OR competitive_positioning IS NULL OR TRIM(competitive_positioning) IN ('', '<p></p>')
    OR customer_language_bank IS NULL OR TRIM(customer_language_bank) IN ('', '<p></p>')
`;

interface ProductRow {
  id: string;
  name: string;
  ic: boolean;
  cp: boolean;
  cl: boolean;
}

async function backfill(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Preview which products will be affected
    const { rows } = await pool.query<ProductRow>(`
      SELECT
        id, name,
        (ingredient_claims IS NULL OR TRIM(ingredient_claims) IN ('', '<p></p>')) AS ic,
        (competitive_positioning IS NULL OR TRIM(competitive_positioning) IN ('', '<p></p>')) AS cp,
        (customer_language_bank IS NULL OR TRIM(customer_language_bank) IN ('', '<p></p>')) AS cl
      FROM app_products
      ORDER BY name
    `);

    const needsUpdate = rows.filter(r => r.ic || r.cp || r.cl);
    const skipped = rows.length - needsUpdate.length;

    console.log('Products to backfill:\n');
    for (const r of needsUpdate) {
      const fields = [
        r.ic ? 'ingredient_claims' : null,
        r.cp ? 'competitive_positioning' : null,
        r.cl ? 'customer_language_bank' : null,
      ].filter(Boolean);
      console.log('  ' + (dryRun ? '→' : '✓') + ' ' + r.name + ' — ' + fields.join(', '));
    }
    if (skipped > 0) {
      console.log('\n  ○ ' + skipped + ' product(s) already have all sections filled — skipped');
    }

    if (needsUpdate.length === 0) {
      console.log('  Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('\n[DRY RUN] No changes made. Run without --dry-run to apply.');
      return;
    }

    const result = await pool.query(BACKFILL_SQL, [
      INGREDIENT_CLAIMS_TEMPLATE,
      COMPETITIVE_POSITIONING_TEMPLATE,
      CUSTOMER_LANGUAGE_BANK_TEMPLATE,
    ]);

    console.log('\nUpdated ' + result.rowCount + ' product(s).');
  } finally {
    await pool.end();
  }
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
