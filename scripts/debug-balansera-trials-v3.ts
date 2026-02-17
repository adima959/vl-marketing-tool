/**
 * Debug v3: Why dashboard shows 412 but CRM CSV has 419 non-upsell trials.
 * Check if some subs land in a different product group in our dashboard query.
 *
 * Run: npx tsx scripts/debug-balansera-trials-v3.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    connectTimeout: 30000,
  });

  // Parse CRM CSV — get only the 419 non-upsell trial sub IDs
  const raw = fs.readFileSync(path.join(__dirname, 'debug-balansera-trials-crm.csv'), 'utf-8');
  const crmSubIds = raw.trim().split('\n').slice(1)
    .map((l) => Number(l.split(',')[1].trim()))
    .filter((n) => n > 0);

  // Exclude the 3 known upsell subs
  const upsellSubIds = new Set([316431, 316733, 317146]);
  const nonUpsellCrmSubIds = crmSubIds.filter((id) => !upsellSubIds.has(id));
  console.log(`Non-upsell CRM trial subs: ${nonUpsellCrmSubIds.length}`);

  // Replicate dashboard's product resolution for these subs
  const ph = nonUpsellCrmSubIds.map(() => '?').join(',');
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       s.product_id AS sub_product_id,
       p_sub.sku AS sub_sku,
       pg_sub.group_name AS sub_group,
       i.id AS trial_inv_id,
       fp.product_id AS inv_product_id,
       p.sku AS inv_sku,
       pg.group_name AS inv_group,
       COALESCE(pg.group_name, pg_sub.group_name) AS resolved_group,
       COALESCE(p.sku, p_sub.sku) AS resolved_sku
     FROM subscription s
     LEFT JOIN product p_sub ON p_sub.id = s.product_id
     LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
     LEFT JOIN invoice i ON i.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
     )
     LEFT JOIN (
       SELECT invoice_id, MIN(product_id) AS product_id
       FROM invoice_product GROUP BY invoice_id
     ) fp ON fp.invoice_id = i.id
     LEFT JOIN product p ON p.id = fp.product_id
     LEFT JOIN product_group pg ON pg.id = p.product_group_id
     WHERE s.id IN (${ph})`,
    nonUpsellCrmSubIds,
  );

  // Group by resolved product group
  const byGroup = new Map<string, number[]>();
  for (const r of rows) {
    const group = String(r.resolved_group || 'NULL');
    const arr = byGroup.get(group) || [];
    arr.push(Number(r.sub_id));
    byGroup.set(group, arr);
  }

  console.log('\nProduct group distribution of 419 non-upsell CRM trial subs:');
  for (const [group, ids] of [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${group}: ${ids.length}`);
  }

  // Check subs that DON'T resolve to Balansera
  const nonBalansera = rows.filter((r) => {
    const group = String(r.resolved_group || '').toLowerCase();
    return !group.includes('balans');
  });

  if (nonBalansera.length > 0) {
    console.log(`\n=== Subs that resolve to NON-Balansera group: ${nonBalansera.length} ===`);
    for (const r of nonBalansera) {
      console.log(`  sub=${r.sub_id} sub_group=${r.sub_group} sub_sku=${r.sub_sku} inv_group=${r.inv_group} inv_sku=${r.inv_sku} resolved=${r.resolved_group}`);
    }
  }

  await conn.end();
}

main().catch(console.error);
