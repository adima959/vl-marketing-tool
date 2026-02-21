/**
 * Migration: Add product research sections, drop description
 *
 * - Adds: ingredient_claims, competitive_positioning, customer_language_bank (TEXT)
 * - Drops: description (no longer used)
 */

import fs from 'fs';
import path from 'path';
import { Pool } from '@neondatabase/serverless';

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

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Adding new columns...');
    await pool.query(`
      ALTER TABLE app_products
        ADD COLUMN IF NOT EXISTS ingredient_claims TEXT,
        ADD COLUMN IF NOT EXISTS competitive_positioning TEXT,
        ADD COLUMN IF NOT EXISTS customer_language_bank TEXT;
    `);
    console.log('  ✓ ingredient_claims, competitive_positioning, customer_language_bank added');

    console.log('Dropping description column...');
    await pool.query(`
      ALTER TABLE app_products DROP COLUMN IF EXISTS description;
    `);
    console.log('  ✓ description dropped');

    console.log('\nMigration complete.');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
