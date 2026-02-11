/**
 * Migration API endpoint for Marketing Tracker
 * POST /api/marketing-tracker/migrate
 *
 * This endpoint runs the database migrations for the Marketing Tracker feature.
 * It should only be used in development/staging environments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const POST = withAdmin(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    console.log('🚀 Starting Marketing Tracker migrations...');

    // Step 1: Check if app_users exists, create if not
    const usersCheck = await executeQuery<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'app_users'
      ) as exists;
    `);

    if (!usersCheck[0]?.exists) {
      console.log('Creating app_users table...');
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
      `);

      await executeQuery(`
        INSERT INTO app_users (id, name, email)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default User', 'admin@vitaliv.com')
        ON CONFLICT (email) DO NOTHING;
      `);
    }

    // Step 2: Create ENUM types (ignore if exists)
    const enumStatements = [
      `DO $$ BEGIN CREATE TYPE app_angle_status AS ENUM ('idea', 'in_production', 'live', 'paused', 'retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE app_geography AS ENUM ('NO', 'SE', 'DK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE app_asset_type AS ENUM ('landing_page', 'text_ad', 'brief', 'research'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE app_creative_format AS ENUM ('ugc_video', 'static_image', 'video'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE app_history_action AS ENUM ('created', 'updated', 'deleted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN CREATE TYPE app_entity_type AS ENUM ('product', 'angle', 'message', 'creative', 'asset'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ];

    for (const stmt of enumStatements) {
      await executeQuery(stmt);
    }
    console.log('✅ ENUM types created');

    // Step 3: Create tables
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        notes TEXT,
        owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);
    console.log('✅ app_products table created');

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_angles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES app_products(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status app_angle_status NOT NULL DEFAULT 'idea',
        launched_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);
    console.log('✅ app_angles table created');

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        angle_id UUID NOT NULL REFERENCES app_angles(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        specific_pain_point TEXT,
        core_promise TEXT,
        key_idea TEXT,
        primary_hook_direction TEXT,
        headlines TEXT[],
        status app_angle_status NOT NULL DEFAULT 'idea',
        launched_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);
    console.log('✅ app_messages table created');

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_creatives (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES app_messages(id) ON DELETE CASCADE,
        geo app_geography NOT NULL,
        name VARCHAR(255) NOT NULL,
        format app_creative_format NOT NULL,
        cta VARCHAR(255),
        url TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);
    console.log('✅ app_creatives table created');

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES app_messages(id) ON DELETE CASCADE,
        geo app_geography NOT NULL,
        type app_asset_type NOT NULL,
        name VARCHAR(255) NOT NULL,
        url TEXT,
        content TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `);
    console.log('✅ app_assets table created');

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_entity_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type app_entity_type NOT NULL,
        entity_id UUID NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        action app_history_action NOT NULL,
        changed_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        entity_snapshot JSONB
      );
    `);
    console.log('✅ app_entity_history table created');

    // Step 4: Create indexes (with IF NOT EXISTS where possible)
    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_products_owner ON app_products(owner_id) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_products_created ON app_products(created_at DESC) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_angles_product ON app_angles(product_id) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_angles_status ON app_angles(status) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_messages_angle ON app_messages(angle_id) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_messages_status ON app_messages(status) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_creatives_message ON app_creatives(message_id) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_creatives_geo ON app_creatives(geo) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_assets_message ON app_assets(message_id) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_assets_type ON app_assets(type) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_history_entity ON app_entity_history(entity_type, entity_id);`,
      `CREATE INDEX IF NOT EXISTS idx_history_changed_at ON app_entity_history(changed_at DESC);`,
    ];

    for (const stmt of indexStatements) {
      try {
        await executeQuery(stmt);
      } catch {
        // Ignore index errors
      }
    }
    console.log('✅ Indexes created');

    // Step 4b: Add sku, color columns if they don't exist
    await executeQuery(`
      ALTER TABLE app_products ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
    `);
    await executeQuery(`
      ALTER TABLE app_products ADD COLUMN IF NOT EXISTS color VARCHAR(7);
    `);
    console.log('✅ sku, color columns ensured on app_products');

    // Step 5: Check if seed data exists
    const productCount = await executeQuery<{ count: string }>(`
      SELECT COUNT(*) as count FROM app_products WHERE deleted_at IS NULL;
    `);

    if (parseInt(productCount[0]?.count || '0') === 0) {
      console.log('🌱 Seeding data...');

      // Get user ID
      const users = await executeQuery<{ id: string }>(`
        SELECT id FROM app_users LIMIT 1;
      `);
      const userId = users[0]?.id || '00000000-0000-0000-0000-000000000001';

      // Create product
      const products = await executeQuery<{ id: string }>(`
        INSERT INTO app_products (name, description, notes, owner_id)
        VALUES (
          'Flex Repair',
          '<p>Natural joint support supplement with turmeric, ginger, Boswellia Serrata, and vitamins. Helps maintain the health of joints and bones, and supports joint flexibility.</p>',
          'Subscription model with 40% first month discount. Price: 269.4 SEK/month.',
          $1
        )
        RETURNING id;
      `, [userId]);
      const productId = products[0].id;
      console.log('  ✅ Created product:', productId);

      // Create angles
      const angle1 = await executeQuery<{ id: string }>(`
        INSERT INTO app_angles (product_id, name, description, status, launched_at)
        VALUES ($1, 'Joint Pain & Daily Life', 'Joint pain interfering with everyday activities and family moments', 'live', NOW() - INTERVAL '2 months')
        RETURNING id;
      `, [productId]);

      const angle2 = await executeQuery<{ id: string }>(`
        INSERT INTO app_angles (product_id, name, description, status)
        VALUES ($1, 'Active Lifestyle', 'Joint issues preventing sports, hobbies, and active pursuits', 'idea')
        RETURNING id;
      `, [productId]);

      const angle3 = await executeQuery<{ id: string }>(`
        INSERT INTO app_angles (product_id, name, description, status)
        VALUES ($1, 'Natural Alternative to Medication', 'Positioning against prescription pain medication and dependency', 'idea')
        RETURNING id;
      `, [productId]);

      console.log('  ✅ Created 3 angles');

      // Create messages for angle 1
      const msg1 = await executeQuery<{ id: string }>(`
        INSERT INTO app_messages (angle_id, name, description, specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines, status, launched_at)
        VALUES (
          $1,
          'Can''t play with grandkids',
          '<p>Emotional connection to playing with grandchildren without joint pain.</p>',
          'I can''t keep up with my grandchildren anymore',
          'Move freely and be present for precious family moments',
          'Joint pain steals irreplaceable time with the people you love most',
          'Emotional grandparent scenes - before/after transformation',
          ARRAY['Keep up with your grandchildren again', 'Don''t let stiff joints steal these moments', 'They grow up fast. Don''t miss it.'],
          'live',
          NOW() - INTERVAL '6 weeks'
        )
        RETURNING id;
      `, [angle1[0].id]);

      await executeQuery(`
        INSERT INTO app_messages (angle_id, name, specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines, status)
        VALUES (
          $1,
          'Can''t sleep due to joint pain',
          'I toss and turn all night because of joint pain',
          'Wake up refreshed, not in pain',
          'Night pain is different - your body heals during sleep, but pain prevents that healing',
          'Relatable night pain scenes, morning relief transformation',
          ARRAY['Finally sleep through the night', 'Stop dreading bedtime', 'Morning stiffness starts at night'],
          'in_production'
        );
      `, [angle1[0].id]);

      await executeQuery(`
        INSERT INTO app_messages (angle_id, name, specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines, status)
        VALUES (
          $1,
          'Getting in/out of car is painful',
          'Simple movements like getting out of my car have become a struggle',
          'Move like you used to - naturally and without thinking',
          'When small movements become obstacles, you''ve lost more than mobility - you''ve lost freedom',
          'Daily micro-moments of struggle to freedom',
          ARRAY['Remember when getting up was easy?', 'Your car shouldn''t feel like a trap'],
          'idea'
        );
      `, [angle1[0].id]);

      // Messages for angle 2
      await executeQuery(`
        INSERT INTO app_messages (angle_id, name, specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines, status)
        VALUES (
          $1,
          'Back to golf',
          'I had to give up golf because of my joints',
          'Play 18 holes without paying for it tomorrow',
          'Golf isn''t just a sport - it''s your identity, your friends, your weekends',
          'Golf-specific lifestyle, course footage',
          ARRAY['Get back on the course', 'Your clubs are waiting'],
          'idea'
        );
      `, [angle2[0].id]);

      await executeQuery(`
        INSERT INTO app_messages (angle_id, name, specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines, status)
        VALUES (
          $1,
          'Skiing/active winter sports',
          'My knees can''t handle the slopes anymore',
          'Hit the slopes all season',
          'Don''t let joint pain put your skis in storage',
          'Seasonal urgency, mountain lifestyle',
          ARRAY['Ski season is coming', 'Don''t watch from the lodge'],
          'idea'
        );
      `, [angle2[0].id]);

      // Message for angle 3
      await executeQuery(`
        INSERT INTO app_messages (angle_id, name, specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines, status)
        VALUES (
          $1,
          'Tired of pills',
          'I don''t want to depend on painkillers',
          'Natural support your body can use',
          'Turmeric and ginger have been used for centuries - now in a modern formula',
          'Natural ingredients, science-backed tradition',
          ARRAY['Nature has a better answer', 'Stop the pill cycle'],
          'idea'
        );
      `, [angle3[0].id]);

      console.log('  ✅ Created 6 messages');

      // Create creatives for message 1
      await executeQuery(`
        INSERT INTO app_creatives (message_id, geo, name, format, cta, url, notes)
        VALUES
          ($1, 'NO', 'Grandparent testimonial - playing in park', 'ugc_video', 'Learn More', 'https://drive.google.com/folder/grandparent-ugc-no', 'Real customer testimonial, 45 seconds.'),
          ($1, 'SE', 'Before/after lifestyle imagery', 'static_image', 'Shop Now', 'https://drive.google.com/folder/grandparent-static-se', 'Carousel set: 5 images.');
      `, [msg1[0].id]);
      console.log('  ✅ Created 2 creatives');

      // Create assets for message 1
      await executeQuery(`
        INSERT INTO app_assets (message_id, geo, type, name, url)
        VALUES
          ($1, 'NO', 'landing_page', 'Grandkids LP - Norway', 'https://vitaliv.no/flex-repair/grandkids'),
          ($1, 'SE', 'landing_page', 'Barnbarn LP - Sweden', 'https://vitaliv.se/flex-repair/barnbarn');
      `, [msg1[0].id]);

      await executeQuery(`
        INSERT INTO app_assets (message_id, geo, type, name, content)
        VALUES ($1, 'DK', 'text_ad', 'Facebook Primary Text - DK', '<p><strong>Holder du op med at lege med børnebørnene?</strong></p>');
      `, [msg1[0].id]);
      console.log('  ✅ Created 3 assets');
    } else {
      console.log('⚠️  Data already exists, skipping seed');
    }

    // Step 6: Verify data
    const counts = await executeQuery<{
      products: string;
      angles: string;
      messages: string;
      creatives: string;
      assets: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM app_products WHERE deleted_at IS NULL)::text as products,
        (SELECT COUNT(*) FROM app_angles WHERE deleted_at IS NULL)::text as angles,
        (SELECT COUNT(*) FROM app_messages WHERE deleted_at IS NULL)::text as messages,
        (SELECT COUNT(*) FROM app_creatives WHERE deleted_at IS NULL)::text as creatives,
        (SELECT COUNT(*) FROM app_assets WHERE deleted_at IS NULL)::text as assets;
    `);

    console.log('📊 Final counts:', counts[0]);

    return NextResponse.json({
      success: true,
      message: 'Migrations completed successfully',
      data: counts[0],
    });

  } catch (error) {
    unstable_rethrow(error);
    console.error('❌ Migration failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
      },
      { status: 500 }
    );
  }
});

// GET endpoint to check migration status
export const GET = withAdmin(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const counts = await executeQuery<{
      products: string;
      angles: string;
      messages: string;
      creatives: string;
      assets: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM app_products WHERE deleted_at IS NULL)::text as products,
        (SELECT COUNT(*) FROM app_angles WHERE deleted_at IS NULL)::text as angles,
        (SELECT COUNT(*) FROM app_messages WHERE deleted_at IS NULL)::text as messages,
        (SELECT COUNT(*) FROM app_creatives WHERE deleted_at IS NULL)::text as creatives,
        (SELECT COUNT(*) FROM app_assets WHERE deleted_at IS NULL)::text as assets;
    `);

    return NextResponse.json({
      success: true,
      data: counts[0],
    });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({
      success: false,
      error: 'Tables may not exist yet. Run POST to migrate.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
