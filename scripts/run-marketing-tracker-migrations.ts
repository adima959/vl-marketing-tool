/**
 * Migration script for Marketing Tracker
 * Run with: npx tsx scripts/run-marketing-tracker-migrations.ts
 */

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Test connection
    const testResult = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Connected at:', testResult.rows[0].current_time);

    // Check if app_users table exists (required dependency)
    const usersCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'app_users'
      );
    `);

    if (!usersCheck.rows[0].exists) {
      console.error('❌ app_users table does not exist. Creating a minimal version...');
      // Create a minimal app_users table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
      `);
      console.log('✅ Created app_users table');

      // Insert a default user
      await pool.query(`
        INSERT INTO app_users (id, name, email)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default User', 'admin@vitaliv.com')
        ON CONFLICT (email) DO NOTHING;
      `);
      console.log('✅ Created default user');
    } else {
      console.log('✅ app_users table exists');
    }

    // Read and run schema migration
    console.log('\n📄 Running schema migration...');
    const schemaPath = path.join(__dirname, 'migrations/001_marketing_tracker_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Split by statements and run each one
    // This is a simple approach - for production, use a proper migration tool
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await pool.query(statement + ';');
      } catch (err: any) {
        // Ignore "already exists" errors
        if (err.code === '42710' || err.code === '42P07') {
          console.log(`  ⚠️  Already exists, skipping: ${statement.substring(0, 50)}...`);
        } else {
          throw err;
        }
      }
    }
    console.log('✅ Schema migration complete');

    // Read and run seed migration
    console.log('\n🌱 Running seed migration...');
    const seedPath = path.join(__dirname, 'migrations/002_marketing_tracker_seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    // Check if data already exists
    const productCheck = await pool.query(`
      SELECT COUNT(*) as count FROM app_products WHERE deleted_at IS NULL
    `);

    if (parseInt(productCheck.rows[0].count) > 0) {
      console.log('  ⚠️  Products already exist, skipping seed data');
    } else {
      await pool.query(seedSql);
      console.log('✅ Seed migration complete');
    }

    // Verify data
    console.log('\n📊 Verifying data...');
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM app_products WHERE deleted_at IS NULL) as products,
        (SELECT COUNT(*) FROM app_angles WHERE deleted_at IS NULL) as angles,
        (SELECT COUNT(*) FROM app_messages WHERE deleted_at IS NULL) as messages,
        (SELECT COUNT(*) FROM app_creatives WHERE deleted_at IS NULL) as creatives,
        (SELECT COUNT(*) FROM app_assets WHERE deleted_at IS NULL) as assets
    `);

    console.log('Data counts:', counts.rows[0]);

    console.log('\n🎉 Migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
