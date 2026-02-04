// Run migration 003: Add product status
// Usage: npx tsx scripts/run-migration-003.ts

import * as dotenv from 'dotenv';
import * as path from 'path';
import { neon } from '@neondatabase/serverless';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log('Running migration 003: Add product status...');

  try {
    // Check if the type already exists
    const typeExists = await sql`
      SELECT 1 FROM pg_type WHERE typname = 'app_product_status'
    `;

    if (typeExists.length > 0) {
      console.log('Type app_product_status already exists, skipping type creation');
    } else {
      // Create the enum type
      await sql`CREATE TYPE app_product_status AS ENUM ('active', 'inactive')`;
      console.log('Created type app_product_status');
    }

    // Check if the column already exists
    const columnExists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'app_products' AND column_name = 'status'
    `;

    if (columnExists.length > 0) {
      console.log('Column status already exists, skipping column creation');
    } else {
      // Add the status column
      await sql`
        ALTER TABLE app_products
        ADD COLUMN status app_product_status NOT NULL DEFAULT 'active'
      `;
      console.log('Added status column to app_products');
    }

    // Check if the index already exists
    const indexExists = await sql`
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_products_status'
    `;

    if (indexExists.length > 0) {
      console.log('Index idx_products_status already exists, skipping index creation');
    } else {
      // Create the index
      await sql`
        CREATE INDEX idx_products_status ON app_products(status) WHERE deleted_at IS NULL
      `;
      console.log('Created index idx_products_status');
    }

    console.log('Migration 003 completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
