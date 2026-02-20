/**
 * List all unmatched CRM subs (Denmark, Adwords, Jan 9 – Feb 9)
 * with full tracking details.
 *
 * Run: npx tsx scripts/debug-unmatched-subs.ts
 */
import mysql from 'mysql2/promise';
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 30000,
});

const neon = new Pool({ connectionString: process.env.DATABASE_URL });

const S = '2026-01-09 00:00:00';
const E = '2026-02-09 23:59:59';

async function main(): Promise<void> {
  // Get marketing campaign+adset keys
  const { rows: marketingRows } = await neon.query(`
    SELECT DISTINCT campaign_id::text AS campaign_id, adset_id::text AS adset_id
    FROM marketing_merged_ads_spending
    WHERE network = 'Google Ads'
      AND date::date BETWEEN '2026-01-09' AND '2026-02-09'
  `);
  const marketingKeys = new Set(
    marketingRows.map((r: Record<string, unknown>) => `${r.campaign_id}::${r.adset_id}`),
  );

  // Get all Adwords Denmark regular subs
  const [rows] = await maria.execute(`
    SELECT
      s.id,
      s.date_create,
      COALESCE(sr.source, sr_sub.source) AS source,
      LOWER(c.country) AS country,
      COALESCE(p.product_name, p_sub.product_name) AS product,
      s.tracking_id,
      s.tracking_id_2,
      s.tracking_id_3,
      s.tracking_id_4,
      s.tracking_id_5,
      s.tag,
      (i.id IS NOT NULL) AS has_trial,
      COALESCE(i.is_marked = 1, 0) AS is_approved
    FROM subscription s
    LEFT JOIN customer c ON c.id = s.customer_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      AND i.id = (SELECT MIN(i2.id) FROM invoice i2 WHERE i2.subscription_id = s.id AND i2.type = 1)
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [S, E]);

  const subs = rows as Record<string, unknown>[];

  // Filter to Adwords source
  const adwords = subs.filter(r => {
    const src = String(r.source ?? '').toLowerCase();
    return src === 'adwords' || src === 'google';
  });

  // Find unmatched
  const unmatched = adwords.filter(r => {
    const t4 = r.tracking_id_4 != null ? String(r.tracking_id_4).trim() : '';
    const t2 = r.tracking_id_2 != null ? String(r.tracking_id_2).trim() : '';
    return !marketingKeys.has(`${t4}::${t2}`);
  });

  console.log(`Total Adwords Denmark regular subs: ${adwords.length}`);
  console.log(`Unmatched: ${unmatched.length}\n`);

  // Print header
  const cols = [
    'id', 'date_create', 'source', 'product',
    'tracking_id', 'tracking_id_2', 'tracking_id_4', 'tracking_id_5',
    'has_trial', 'is_approved',
  ];
  console.log(cols.join('\t'));
  console.log(cols.map(() => '---').join('\t'));

  for (const r of unmatched) {
    const vals = cols.map(c => {
      const v = r[c];
      if (v instanceof Date) {
        return v.toISOString().slice(0, 10);
      }
      if (v === null || v === undefined) return '(null)';
      return String(v);
    });
    console.log(vals.join('\t'));
  }

  await maria.end();
  await neon.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
