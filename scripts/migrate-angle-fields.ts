/**
 * Migration: Add angle research fields
 *
 * - Adds: target_audience, emotional_driver (TEXT)
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
    console.log('Adding new columns to app_pipeline_angles...');
    await pool.query(`
      ALTER TABLE app_pipeline_angles
        ADD COLUMN IF NOT EXISTS target_audience TEXT,
        ADD COLUMN IF NOT EXISTS emotional_driver TEXT;
    `);
    console.log('  ✓ target_audience, emotional_driver added');

    console.log('\nMigration complete.');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
