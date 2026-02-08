/**
 * Migration API endpoint for Marketing Pipeline
 * POST /api/marketing-pipeline/migrate — create tables + seed data
 * GET  /api/marketing-pipeline/migrate — check table counts
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';

// ── Fixed UUIDs for seed data referential integrity ─────────────────

const A1 = 'a0000000-0000-4000-a000-000000000001';
const A2 = 'a0000000-0000-4000-a000-000000000002';

const M01 = 'b0000000-0000-4000-a000-000000000001'; // backlog
const M05 = 'b0000000-0000-4000-a000-000000000005'; // backlog (with hypothesis)
const M08 = 'b0000000-0000-4000-a000-000000000008'; // production
const M10 = 'b0000000-0000-4000-a000-000000000010'; // testing
const M15 = 'b0000000-0000-4000-a000-000000000015'; // verdict
const M17 = 'b0000000-0000-4000-a000-000000000017'; // winner
const M19 = 'b0000000-0000-4000-a000-000000000019'; // retired

const C01 = 'c0000000-0000-4000-a000-000000000001';
const C02 = 'c0000000-0000-4000-a000-000000000002';
const C03 = 'c0000000-0000-4000-a000-000000000003';
const C04 = 'c0000000-0000-4000-a000-000000000004';

const AS01 = 'd0000000-0000-4000-a000-000000000001';
const AS02 = 'd0000000-0000-4000-a000-000000000002';
const AS03 = 'd0000000-0000-4000-a000-000000000003';

const CR01 = 'e0000000-0000-4000-a000-000000000001';
const CR02 = 'e0000000-0000-4000-a000-000000000002';
const CR03 = 'e0000000-0000-4000-a000-000000000003';


// ── DDL: Enums ──────────────────────────────────────────────────────

async function createEnums(): Promise<void> {
  const enumStatements = [
    // Reuse existing enums (created by marketing-tracker, idempotent)
    `DO $$ BEGIN CREATE TYPE app_angle_status AS ENUM ('idea', 'in_production', 'live', 'paused', 'retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_geography AS ENUM ('NO', 'SE', 'DK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_asset_type AS ENUM ('landing_page', 'text_ad', 'brief', 'research'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_creative_format AS ENUM ('ugc_video', 'static_image', 'video'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_history_action AS ENUM ('created', 'updated', 'deleted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_entity_type AS ENUM ('product', 'angle', 'message', 'creative', 'asset'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    // Pipeline-specific enums
    `DO $$ BEGIN CREATE TYPE app_pipeline_stage AS ENUM ('backlog', 'briefed', 'production', 'testing', 'verdict', 'winner', 'retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_channel AS ENUM ('meta', 'google', 'taboola', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN CREATE TYPE app_campaign_status AS ENUM ('active', 'paused', 'stopped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  ];

  for (const stmt of enumStatements) {
    await executeQuery(stmt);
  }

  // Extend app_entity_type with pipeline values
  await executeQuery(`ALTER TYPE app_entity_type ADD VALUE IF NOT EXISTS 'pipeline_message';`);
  await executeQuery(`ALTER TYPE app_entity_type ADD VALUE IF NOT EXISTS 'pipeline_angle';`);
  await executeQuery(`ALTER TYPE app_entity_type ADD VALUE IF NOT EXISTS 'campaign';`);

  // Enums created
}


// ── DDL: Alter app_products for CPA targets ─────────────────────────

async function alterProducts(): Promise<void> {
  await executeQuery(`ALTER TABLE app_products ADD COLUMN IF NOT EXISTS cpa_target_no NUMERIC;`);
  await executeQuery(`ALTER TABLE app_products ADD COLUMN IF NOT EXISTS cpa_target_se NUMERIC;`);
  await executeQuery(`ALTER TABLE app_products ADD COLUMN IF NOT EXISTS cpa_target_dk NUMERIC;`);
  await executeQuery(`ALTER TABLE app_products ADD COLUMN IF NOT EXISTS color VARCHAR(7);`);
  // CPA target + color columns added
}


// ── DDL: Create pipeline tables ─────────────────────────────────────

async function createTables(): Promise<void> {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS app_pipeline_angles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES app_products(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status app_angle_status NOT NULL DEFAULT 'idea',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS app_pipeline_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      angle_id UUID NOT NULL REFERENCES app_pipeline_angles(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      specific_pain_point TEXT,
      core_promise TEXT,
      key_idea TEXT,
      primary_hook_direction TEXT,
      headlines TEXT[],
      status app_angle_status NOT NULL DEFAULT 'idea',
      pipeline_stage app_pipeline_stage NOT NULL DEFAULT 'backlog',
      verdict_type VARCHAR(20),
      verdict_notes TEXT,
      parent_message_id UUID REFERENCES app_pipeline_messages(id),
      spend_threshold NUMERIC DEFAULT 300,
      version INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      launched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS app_pipeline_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES app_pipeline_messages(id) ON DELETE CASCADE,
      channel app_channel NOT NULL,
      geo app_geography NOT NULL,
      external_id VARCHAR(255),
      external_url TEXT,
      status app_campaign_status NOT NULL DEFAULT 'active',
      spend NUMERIC NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      cpa NUMERIC,
      last_data_update TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS app_pipeline_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES app_pipeline_messages(id) ON DELETE CASCADE,
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

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS app_pipeline_creatives (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES app_pipeline_messages(id) ON DELETE CASCADE,
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

  // Pipeline tables created
}


// ── DDL: Indexes ────────────────────────────────────────────────────

async function createIndexes(): Promise<void> {
  const stmts = [
    `CREATE INDEX IF NOT EXISTS idx_pl_angles_product ON app_pipeline_angles(product_id) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_messages_angle ON app_pipeline_messages(angle_id) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_messages_stage ON app_pipeline_messages(pipeline_stage) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_messages_parent ON app_pipeline_messages(parent_message_id) WHERE deleted_at IS NULL AND parent_message_id IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_campaigns_message ON app_pipeline_campaigns(message_id) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_campaigns_status ON app_pipeline_campaigns(status) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_assets_message ON app_pipeline_assets(message_id) WHERE deleted_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_pl_creatives_message ON app_pipeline_creatives(message_id) WHERE deleted_at IS NULL;`,
  ];

  for (const stmt of stmts) {
    try { await executeQuery(stmt); } catch { /* ignore index errors */ }
  }
  // Indexes created
}


// ── Seed Data ───────────────────────────────────────────────────────

interface SeedMessage {
  id: string;
  angleId: string;
  name: string;
  status: string;
  pipelineStage: string;
  version: number;
  spendThreshold: number;
  specificPainPoint?: string;
  corePromise?: string;
  keyIdea?: string;
  primaryHookDirection?: string;
  headlines?: string[];
  verdictType?: string;
  verdictNotes?: string;
  parentMessageId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface SeedCampaign {
  id: string;
  messageId: string;
  channel: string;
  geo: string;
  status: string;
  spend: number;
  conversions: number;
  cpa: number;
  createdAt: string;
  updatedAt: string;
}

interface SeedAsset {
  id: string;
  messageId: string;
  geo: string;
  type: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface SeedCreative {
  id: string;
  messageId: string;
  geo: string;
  format: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

async function seedData(): Promise<void> {
  let seedStep = 'init';
  try {
  // Check if data already exists
  const count = await executeQuery<{ count: string }>(`
    SELECT COUNT(*) as count FROM app_pipeline_messages WHERE deleted_at IS NULL;
  `);
  if (parseInt(count[0]?.count || '0') > 0) {
    return;
  }
  seedStep = 'ensureUsers';

  // ── Get existing users for ownership ──────────────────────────────
  const existingUsers = await executeQuery<{ id: string }>(`
    SELECT id FROM app_users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 3;
  `);
  if (existingUsers.length === 0) {
    throw new Error('No users found in app_users. Run marketing-tracker migration first.');
  }
  const u1 = existingUsers[0].id;
  const u2 = existingUsers[Math.min(1, existingUsers.length - 1)].id;
  const u3 = existingUsers[Math.min(2, existingUsers.length - 1)].id;
  seedStep = 'ensureProducts';

  // ── Ensure products exist + set CPA targets ─────────────────────
  async function ensureProduct(
    name: string, description: string, ownerId: string,
    cpaNo: number, cpaSe: number, cpaDk: number,
  ): Promise<string> {
    const existing = await executeQuery<{ id: string }>(`
      SELECT id FROM app_products WHERE name = $1 AND deleted_at IS NULL LIMIT 1;
    `, [name]);

    let productId: string;
    if (existing.length > 0) {
      productId = existing[0].id;
    } else {
      const created = await executeQuery<{ id: string }>(`
        INSERT INTO app_products (name, description, owner_id)
        VALUES ($1, $2, $3) RETURNING id;
      `, [name, description, ownerId]);
      productId = created[0].id;
    }

    await executeQuery(`
      UPDATE app_products
      SET cpa_target_no = $1, cpa_target_se = $2, cpa_target_dk = $3, updated_at = NOW()
      WHERE id = $4;
    `, [cpaNo, cpaSe, cpaDk, productId]);

    return productId;
  }

  const p1 = await ensureProduct('Flex Repair', 'Joint supplement for active adults', u1, 28, 32, 30);
  seedStep = 'seedAngles';

  // ── Seed angles (2 angles, 1 product) ─────────────────────────
  const angles = [
    { id: A1, productId: p1, name: 'Joint Pain & Daily Life', description: 'Joint pain interfering with everyday activities', status: 'live', createdAt: '2024-01-15', updatedAt: '2024-06-01' },
    { id: A2, productId: p1, name: 'Active Lifestyle', description: 'Staying active despite joint issues', status: 'live', createdAt: '2024-01-15', updatedAt: '2024-06-01' },
  ];

  for (const a of angles) {
    await executeQuery(`
      INSERT INTO app_pipeline_angles (id, product_id, name, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [a.id, a.productId, a.name, a.description, a.status, a.createdAt, a.updatedAt]);
  }
  seedStep = 'seedMessages';

  // ── Seed messages (1 per stage) ─────────────────────────────────
  const messages: SeedMessage[] = [
    // BACKLOG
    { id: M01, angleId: A1, name: 'Knee pain climbing stairs', status: 'idea', pipelineStage: 'backlog', version: 1, spendThreshold: 300, createdAt: '2024-06-01', updatedAt: '2024-06-01' },
    // BACKLOG (with hypothesis filled in)
    { id: M05, angleId: A1, name: 'Morning stiffness ruins the day', status: 'idea', pipelineStage: 'backlog', version: 1, spendThreshold: 300,
      specificPainPoint: 'Every morning starts with 10 minutes of stiff, aching joints before I can move normally',
      corePromise: 'Wake up moving freely — no more waiting for your body to catch up',
      keyIdea: 'Morning should be about starting your day, not negotiating with your joints',
      primaryHookDirection: 'The morning stiffness ritual everyone over 50 knows',
      headlines: ['Remember when mornings were easy?', 'Your joints shouldn\'t need a warm-up'],
      createdAt: '2024-05-20', updatedAt: '2024-06-01' },
    // PRODUCTION
    { id: M08, angleId: A2, name: 'Back pain at the office desk', status: 'in_production', pipelineStage: 'production', version: 1, spendThreshold: 300,
      specificPainPoint: 'Sitting at a desk all day makes my back and joints ache by 3pm',
      corePromise: 'Stay comfortable through the whole workday',
      keyIdea: 'Your desk job shouldn\'t age your joints',
      primaryHookDirection: 'The 3pm pain that office workers know too well',
      headlines: ['Your chair is aging your joints', 'The desk worker\'s joint solution'],
      createdAt: '2024-05-10', updatedAt: '2024-05-25' },
    // TESTING
    { id: M10, angleId: A1, name: 'Getting in/out of car is painful', status: 'live', pipelineStage: 'testing', version: 1, spendThreshold: 300,
      specificPainPoint: 'Simple movements like getting out of my car have become a struggle',
      corePromise: 'Move like you used to — naturally and without thinking',
      keyIdea: 'When small movements become obstacles, you\'ve lost more than mobility — you\'ve lost freedom',
      primaryHookDirection: 'Daily micro-moments of struggle to freedom',
      headlines: ['Remember when getting up was easy?', 'Your car shouldn\'t feel like a trap'],
      notes: 'Testing car-specific pain point. If Meta NO holds below $25, expand to DK next week.',
      createdAt: '2024-04-20', updatedAt: '2024-06-05' },
    // VERDICT
    { id: M15, angleId: A1, name: 'Playing with grandkids hurts', status: 'live', pipelineStage: 'verdict', version: 1, spendThreshold: 300,
      specificPainPoint: 'Getting on the floor to play with grandkids is painful and embarrassing',
      corePromise: 'Be the grandparent who gets on the floor — and gets back up',
      keyIdea: 'Grandkids don\'t understand joint pain. They just want you down there with them.',
      primaryHookDirection: 'The grandparent guilt of saying "I can\'t get down there"',
      headlines: ['They\'ll remember who played with them', 'Don\'t be the grandparent on the bench'],
      createdAt: '2024-04-10', updatedAt: '2024-06-05' },
    // WINNER
    { id: M17, angleId: A1, name: 'Can\'t sleep from joint pain', status: 'live', pipelineStage: 'winner', version: 1, spendThreshold: 300,
      specificPainPoint: 'Joint pain keeps me awake — can\'t find a comfortable sleeping position',
      corePromise: 'Sleep through the night without joint pain waking you',
      keyIdea: 'Night-time joint pain is the worst because there\'s nothing to distract you',
      primaryHookDirection: 'The lonely 2am battle with joint pain',
      headlines: ['Joint pain doesn\'t sleep', 'When pain keeps you up at night'],
      verdictType: 'scale',
      createdAt: '2024-03-01', updatedAt: '2024-06-05' },
    // RETIRED
    { id: M19, angleId: A1, name: 'Joint pain ruins sleep (v1)', status: 'retired', pipelineStage: 'retired', version: 1, spendThreshold: 300,
      specificPainPoint: 'Joint pain keeps me tossing and turning all night',
      corePromise: 'Sleep without joint pain',
      keyIdea: 'Joint pain doesn\'t rest when you do',
      primaryHookDirection: 'Generic sleep + joint pain angle',
      headlines: ['Joint pain at night', 'Sleep better with healthy joints'],
      verdictType: 'iterate', verdictNotes: 'Hook too generic. Need to focus on specific 3am moment rather than broad sleep messaging.',
      createdAt: '2024-02-15', updatedAt: '2024-05-01' },
  ];

  // Insert M19 first (retired parent) so FK references work
  const insertOrder = [M19, ...messages.filter(m => m.id !== M19).map(m => m.id)];

  for (const msgId of insertOrder) {
    const m = messages.find(msg => msg.id === msgId)!;
    await executeQuery(`
      INSERT INTO app_pipeline_messages (
        id, angle_id, name, status, pipeline_stage, version, spend_threshold,
        specific_pain_point, core_promise, key_idea, primary_hook_direction,
        headlines, verdict_type, verdict_notes, parent_message_id, notes,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18
      ) ON CONFLICT (id) DO NOTHING;
    `, [
      m.id, m.angleId, m.name, m.status, m.pipelineStage, m.version, m.spendThreshold,
      m.specificPainPoint ?? null, m.corePromise ?? null, m.keyIdea ?? null, m.primaryHookDirection ?? null,
      m.headlines ?? null, m.verdictType ?? null, m.verdictNotes ?? null, m.parentMessageId ?? null, m.notes ?? null,
      m.createdAt, m.updatedAt,
    ]);
  }
  seedStep = 'seedCampaigns';

  // ── Seed campaigns (1 per message that has them) ──────────────
  const campaigns: SeedCampaign[] = [
    { id: C01, messageId: M10, channel: 'meta', geo: 'NO', status: 'active', spend: 340, conversions: 14, cpa: 24, createdAt: '2024-05-01', updatedAt: '2024-06-05' },
    { id: C02, messageId: M15, channel: 'meta', geo: 'NO', status: 'active', spend: 320, conversions: 8, cpa: 40, createdAt: '2024-04-20', updatedAt: '2024-06-05' },
    { id: C03, messageId: M17, channel: 'meta', geo: 'NO', status: 'active', spend: 1800, conversions: 95, cpa: 19, createdAt: '2024-03-15', updatedAt: '2024-06-05' },
    { id: C04, messageId: M19, channel: 'meta', geo: 'NO', status: 'stopped', spend: 380, conversions: 11, cpa: 35, createdAt: '2024-03-01', updatedAt: '2024-05-01' },
  ];

  for (const c of campaigns) {
    await executeQuery(`
      INSERT INTO app_pipeline_campaigns (id, message_id, channel, geo, status, spend, conversions, cpa, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING;
    `, [c.id, c.messageId, c.channel, c.geo, c.status, c.spend, c.conversions, c.cpa, c.createdAt, c.updatedAt]);
  }
  seedStep = 'seedAssets';

  // ── Seed assets (1 per production/testing/winner) ─────────────
  const assets: SeedAsset[] = [
    { id: AS01, messageId: M08, geo: 'NO', type: 'landing_page', name: 'LP — Office desk pain NO', createdAt: '2024-05-12', updatedAt: '2024-05-20' },
    { id: AS02, messageId: M10, geo: 'NO', type: 'landing_page', name: 'LP — Car pain NO', createdAt: '2024-04-22', updatedAt: '2024-04-28' },
    { id: AS03, messageId: M17, geo: 'NO', type: 'landing_page', name: 'LP — Sleep joint pain NO', createdAt: '2024-03-05', updatedAt: '2024-03-15' },
  ];

  for (const a of assets) {
    await executeQuery(`
      INSERT INTO app_pipeline_assets (id, message_id, geo, type, name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [a.id, a.messageId, a.geo, a.type, a.name, a.createdAt, a.updatedAt]);
  }
  seedStep = 'seedCreatives';

  // ── Seed creatives (1 per production/testing/winner) ──────────
  const creatives: SeedCreative[] = [
    { id: CR01, messageId: M08, geo: 'NO', format: 'ugc_video', name: 'UGC — Office worker story', createdAt: '2024-05-15', updatedAt: '2024-05-20' },
    { id: CR02, messageId: M10, geo: 'NO', format: 'ugc_video', name: 'UGC — Car struggle v1', createdAt: '2024-04-25', updatedAt: '2024-05-01' },
    { id: CR03, messageId: M17, geo: 'NO', format: 'ugc_video', name: 'UGC — Night pain testimonial', createdAt: '2024-03-10', updatedAt: '2024-03-20' },
  ];

  for (const c of creatives) {
    await executeQuery(`
      INSERT INTO app_pipeline_creatives (id, message_id, geo, format, name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [c.id, c.messageId, c.geo, c.format, c.name, c.createdAt, c.updatedAt]);
  }
  } catch (e) {
    throw new Error(`seedData failed at step "${seedStep}": ${e instanceof Error ? e.message : e}`);
  }
}


// ── POST: Run migration ─────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const reset = searchParams.get('reset') === 'true';

    await createEnums();
    await alterProducts();
    await createTables();
    await createIndexes();

    if (reset) {
      // Clear pipeline data in FK-safe order, then re-seed
      await executeQuery(`DELETE FROM app_pipeline_creatives;`);
      await executeQuery(`DELETE FROM app_pipeline_assets;`);
      await executeQuery(`DELETE FROM app_pipeline_campaigns;`);
      await executeQuery(`DELETE FROM app_pipeline_messages;`);
      await executeQuery(`DELETE FROM app_pipeline_angles;`);
      // Remove extra seed products (keep only Flex Repair)
      await executeQuery(`DELETE FROM app_products WHERE name IN ('Joint Plus', 'Sleep Well');`);
      // Migrate any 'briefed' rows to 'backlog' (stage removed)
      await executeQuery(`UPDATE app_pipeline_messages SET pipeline_stage = 'backlog' WHERE pipeline_stage = 'briefed';`);
    }

    await seedData();

    // Verify
    const counts = await executeQuery<{
      angles: string;
      messages: string;
      campaigns: string;
      assets: string;
      creatives: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM app_pipeline_angles WHERE deleted_at IS NULL)::text as angles,
        (SELECT COUNT(*) FROM app_pipeline_messages WHERE deleted_at IS NULL)::text as messages,
        (SELECT COUNT(*) FROM app_pipeline_campaigns WHERE deleted_at IS NULL)::text as campaigns,
        (SELECT COUNT(*) FROM app_pipeline_assets WHERE deleted_at IS NULL)::text as assets,
        (SELECT COUNT(*) FROM app_pipeline_creatives WHERE deleted_at IS NULL)::text as creatives;
    `);

    // Migration complete

    return NextResponse.json({
      success: true,
      message: 'Marketing Pipeline migrations completed',
      data: counts[0],
    });
  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 },
    );
  }
}


// ── GET: Check status ───────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const counts = await executeQuery<{
      angles: string;
      messages: string;
      campaigns: string;
      assets: string;
      creatives: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM app_pipeline_angles WHERE deleted_at IS NULL)::text as angles,
        (SELECT COUNT(*) FROM app_pipeline_messages WHERE deleted_at IS NULL)::text as messages,
        (SELECT COUNT(*) FROM app_pipeline_campaigns WHERE deleted_at IS NULL)::text as campaigns,
        (SELECT COUNT(*) FROM app_pipeline_assets WHERE deleted_at IS NULL)::text as assets,
        (SELECT COUNT(*) FROM app_pipeline_creatives WHERE deleted_at IS NULL)::text as creatives;
    `);

    return NextResponse.json({ success: true, data: counts[0] });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Tables may not exist yet. Run POST to migrate.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
