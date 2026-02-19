// Marketing Pipeline Database Query Helpers
// Uses PostgreSQL (Neon) - placeholders: $1, $2, $3

import { executeQuery } from '@/lib/server/db';
import { toCamelCase, rowsToCamelCase } from '@/lib/server/caseUtils';
import { computeSummary } from '@/lib/marketing-pipeline/cpaUtils';
import type {
  PipelineCard,
  PipelineStage,
  PipelineSummary,
  Product,
  ProductStatus,
  Angle,
  PipelineUser,
  Campaign,
  Asset,
  Creative,
  MessageDetail,
  MessageGeo,
  Channel,
  Geography,
  GeoStage,
  VerdictType,
  CreateCampaignRequest,
  CreateProductRequest,
  CopyVariation,
  CpaTarget,
} from '@/types';


// ════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════

/** Build dynamic SET clauses from a camelCase→snake_case field map. */
function buildDynamicUpdate(
  data: Record<string, unknown>,
  fieldMap: Record<string, string>,
  opts?: { jsonbFields?: Set<string>; startIndex?: number },
): { setClauses: string[]; values: unknown[]; nextIndex: number } {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = opts?.startIndex ?? 1;
  const jsonb = opts?.jsonbFields;

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    const val = data[jsKey];
    if (val !== undefined) {
      setClauses.push(`${dbCol} = $${idx++}`);
      values.push(jsonb?.has(jsKey) ? JSON.stringify(val) : val);
    }
  }
  return { setClauses, values, nextIndex: idx };
}

export interface PipelineBoardFilters {
  ownerId?: string;
  productId?: string;
  angleId?: string;
  channels?: Channel[];
  geos?: Geography[];
}

export interface PipelineBoardResult {
  cards: PipelineCard[];
  summary: PipelineSummary;
  users: PipelineUser[];
  products: Product[];
  angles: Angle[];
}

export type UpdatePipelineMessageData = Partial<{
  name: string;
  description: string;
  angleId: string;
  specificPainPoint: string;
  corePromise: string;
  keyIdea: string;
  primaryHookDirection: string;
  headlines: string[];
  copyVariations: CopyVariation[];
  status: string;
  pipelineStage: PipelineStage;
  verdictType: VerdictType;
  verdictNotes: string;
  spendThreshold: number;
  notes: string;
}>;

export type UpdateCampaignData = Partial<{
  channel: Channel;
  geo: Geography;
  externalId: string;
  externalUrl: string;
  spend: number;
  conversions: number;
  cpa: number;
}>;


// ════════════════════════════════════════════════════════════════════
// Board Query
// ════════════════════════════════════════════════════════════════════

export async function getPipelineBoard(filters: PipelineBoardFilters): Promise<PipelineBoardResult> {
  // 1. Fetch messages with JOINs (owner/product/angle filters in SQL)
  const messageRows = await executeQuery<Record<string, unknown>>(`
    SELECT
      m.id,
      m.name,
      m.pipeline_stage,
      m.verdict_type,
      m.parent_message_id,
      m.version,
      m.spend_threshold,
      m.updated_at,
      m.drive_folder_id,
      a.id AS angle_id,
      a.name AS angle_name,
      a.product_id,
      p.name AS product_name,
      p.color AS product_color,
      p.owner_id,
      u.name AS owner_name
    FROM app_pipeline_messages m
    JOIN app_pipeline_angles a ON a.id = m.angle_id AND a.deleted_at IS NULL
    JOIN app_products p ON p.id = a.product_id AND p.deleted_at IS NULL
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE m.deleted_at IS NULL
      AND ($1::uuid IS NULL OR p.owner_id = $1)
      AND ($2::uuid IS NULL OR a.product_id = $2)
      AND ($3::uuid IS NULL OR a.id = $3)
    ORDER BY m.updated_at DESC
  `, [filters.ownerId || null, filters.productId || null, filters.angleId || null]);

  if (messageRows.length === 0) {
    const [users, products, angles] = await Promise.all([
      fetchUsers(), fetchProductsWithCpa(), fetchPipelineAngles(),
    ]);
    return { cards: [], summary: computeSummary([]), users, products, angles };
  }

  // 2. Fetch campaigns for these messages
  const messageIds = messageRows.map(r => r.id as string);
  const campaignRows = await executeQuery<Record<string, unknown>>(`
    SELECT
      id, message_id, name, channel, geo, spend, conversions, cpa,
      external_id, external_url, last_data_update, created_at, updated_at
    FROM app_pipeline_campaigns
    WHERE message_id = ANY($1) AND deleted_at IS NULL
  `, [messageIds]);

  const campaigns = rowsToCamelCase<Campaign>(campaignRows);

  // Group campaigns by message_id
  const campaignsByMessage: Record<string, Campaign[]> = {};
  for (const c of campaigns) {
    if (!campaignsByMessage[c.messageId]) campaignsByMessage[c.messageId] = [];
    campaignsByMessage[c.messageId].push(c);
  }

  // 3. Fetch message geos for these messages
  const geoRows = await executeQuery<Record<string, unknown>>(`
    SELECT id, message_id, geo, stage, is_primary, launched_at,
           spend_threshold, notes, drive_folder_id, created_at, updated_at
    FROM app_pipeline_message_geos
    WHERE message_id = ANY($1) AND deleted_at IS NULL
    ORDER BY is_primary DESC, geo
  `, [messageIds]);

  const messageGeos = rowsToCamelCase<MessageGeo>(geoRows);
  const geosByMessage: Record<string, MessageGeo[]> = {};
  for (const g of messageGeos) {
    if (!geosByMessage[g.messageId]) geosByMessage[g.messageId] = [];
    geosByMessage[g.messageId].push(g);
  }

  // 4. Build PipelineCard objects
  let cards: PipelineCard[] = messageRows.map(row => {
    const msgCampaigns = campaignsByMessage[row.id as string] || [];
    const totalSpend = msgCampaigns.reduce((sum, c) => sum + Number(c.spend), 0);
    const totalConversions = msgCampaigns.reduce((sum, c) => sum + Number(c.conversions), 0);
    const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : undefined;

    return {
      id: row.id as string,
      name: row.name as string,
      pipelineStage: row.pipeline_stage as PipelineStage,
      productId: row.product_id as string,
      productName: row.product_name as string,
      productColor: (row.product_color as string) || undefined,
      angleId: row.angle_id as string,
      angleName: row.angle_name as string,
      ownerId: row.owner_id as string,
      ownerName: (row.owner_name as string) || '',
      totalSpend,
      blendedCpa,
      activeCampaignCount: msgCampaigns.length,
      campaigns: msgCampaigns,
      geos: geosByMessage[row.id as string] || [],
      verdictType: row.verdict_type as VerdictType | undefined,
      parentMessageId: row.parent_message_id as string | undefined,
      version: (row.version as number) || 1,
      spendThreshold: Number(row.spend_threshold) || 300,
      updatedAt: row.updated_at as string,
      driveFolderId: (row.drive_folder_id as string) || undefined,
    };
  });

  // 5. Apply channel/geo filters in JS (these depend on campaign data)
  if (filters.channels && filters.channels.length > 0) {
    cards = cards.filter(card => {
      if (card.campaigns.length === 0) return true;
      return card.campaigns.some(c => filters.channels!.includes(c.channel));
    });
  }
  if (filters.geos && filters.geos.length > 0) {
    cards = cards.filter(card => {
      if (card.campaigns.length === 0) return true;
      return card.campaigns.some(c => filters.geos!.includes(c.geo));
    });
  }

  // 6. Fetch filter dropdown data in parallel
  const [users, products, angles] = await Promise.all([
    fetchUsers(), fetchProductsWithCpa(), fetchPipelineAngles(),
  ]);

  return { cards, summary: computeSummary(cards), users, products, angles };
}


// ════════════════════════════════════════════════════════════════════
// Message Detail
// ════════════════════════════════════════════════════════════════════

export async function getPipelineMessageDetail(id: string): Promise<MessageDetail | null> {
  // Main message with JOINs
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT
      m.id, m.angle_id, m.name, m.description,
      m.specific_pain_point, m.core_promise, m.key_idea,
      m.primary_hook_direction, m.headlines, m.copy_variations,
      m.status, m.pipeline_stage, m.verdict_type, m.verdict_notes,
      m.parent_message_id, m.spend_threshold, m.version,
      m.notes, m.launched_at, m.created_at, m.updated_at,
      m.drive_folder_id,
      a.id AS pl_angle_id, a.name AS pl_angle_name,
      a.description AS pl_angle_desc, a.status AS pl_angle_status,
      a.product_id AS pl_product_id,
      a.drive_folder_id AS pl_angle_drive_folder_id,
      p.name AS pl_product_name, p.description AS pl_product_desc,
      p.color AS pl_product_color, p.owner_id AS pl_owner_id,
      p.cpa_target_no, p.cpa_target_se, p.cpa_target_dk,
      p.drive_folder_id AS pl_product_drive_folder_id,
      u.name AS pl_owner_name, u.email AS pl_owner_email
    FROM app_pipeline_messages m
    JOIN app_pipeline_angles a ON a.id = m.angle_id
    JOIN app_products p ON p.id = a.product_id
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE m.id = $1 AND m.deleted_at IS NULL
  `, [id]);

  if (rows.length === 0) return null;
  const row = rows[0];

  // Build message
  const message = toCamelCase<MessageDetail>({
    id: row.id,
    angle_id: row.angle_id,
    name: row.name,
    description: row.description,
    specific_pain_point: row.specific_pain_point,
    core_promise: row.core_promise,
    key_idea: row.key_idea,
    primary_hook_direction: row.primary_hook_direction,
    headlines: row.headlines,
    copy_variations: row.copy_variations ?? [],
    status: row.status,
    pipeline_stage: row.pipeline_stage,
    verdict_type: row.verdict_type,
    verdict_notes: row.verdict_notes,
    parent_message_id: row.parent_message_id,
    spend_threshold: row.spend_threshold,
    version: row.version,
    notes: row.notes,
    launched_at: row.launched_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    drive_folder_id: row.drive_folder_id,
  });

  // Build nested objects
  message.angle = {
    id: row.pl_angle_id as string,
    productId: row.pl_product_id as string,
    name: row.pl_angle_name as string,
    description: row.pl_angle_desc as string | undefined,
    status: row.pl_angle_status as 'idea' | 'live',
    driveFolderId: (row.pl_angle_drive_folder_id as string) || undefined,
    createdAt: '',
    updatedAt: '',
  } as Angle;

  const productId = row.pl_product_id as string;
  message.product = {
    id: productId,
    name: row.pl_product_name as string,
    description: row.pl_product_desc as string | undefined,
    color: (row.pl_product_color as string) || undefined,
    status: 'active',
    ownerId: row.pl_owner_id as string,
    cpaTargetNo: row.cpa_target_no != null ? Number(row.cpa_target_no) : undefined,
    cpaTargetSe: row.cpa_target_se != null ? Number(row.cpa_target_se) : undefined,
    cpaTargetDk: row.cpa_target_dk != null ? Number(row.cpa_target_dk) : undefined,
    driveFolderId: (row.pl_product_drive_folder_id as string) || undefined,
    createdAt: '',
    updatedAt: '',
  } as Product;

  if (row.pl_owner_id) {
    message.owner = {
      id: row.pl_owner_id as string,
      name: row.pl_owner_name as string || '',
      email: row.pl_owner_email as string || '',
      createdAt: '',
      updatedAt: '',
    };
  }

  // Fetch campaigns, assets, creatives, geos, cpa targets in parallel
  const [campaignRows, assetRows, creativeRows, geoRows, cpaTargetRows] = await Promise.all([
    executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, channel, geo, spend, conversions, cpa,
             external_id, external_url, last_data_update, created_at, updated_at
      FROM app_pipeline_campaigns
      WHERE message_id = $1 AND deleted_at IS NULL
      ORDER BY channel, geo
    `, [id]),
    executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, geo, type, name, url, content, notes, created_at, updated_at
      FROM app_pipeline_assets
      WHERE message_id = $1 AND deleted_at IS NULL
      ORDER BY geo, type
    `, [id]),
    executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, geo, name, format, cta, url, notes, created_at, updated_at
      FROM app_pipeline_creatives
      WHERE message_id = $1 AND deleted_at IS NULL
      ORDER BY geo, format
    `, [id]),
    executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, geo, stage, is_primary, launched_at,
             spend_threshold, notes, drive_folder_id, created_at, updated_at
      FROM app_pipeline_message_geos
      WHERE message_id = $1 AND deleted_at IS NULL
      ORDER BY is_primary DESC, geo
    `, [id]),
    // Graceful: table may not exist yet before migration
    executeQuery<Record<string, unknown>>(`
      SELECT id, product_id, geo, channel, target
      FROM app_product_cpa_targets
      WHERE product_id = $1
      ORDER BY geo, channel
    `, [productId]).catch(() => [] as Record<string, unknown>[]),
  ]);

  message.campaigns = rowsToCamelCase<Campaign>(campaignRows);
  message.assets = rowsToCamelCase<Asset>(assetRows);
  message.creatives = rowsToCamelCase<Creative>(creativeRows);
  message.geos = rowsToCamelCase<MessageGeo>(geoRows);
  message.product!.cpaTargets = rowsToCamelCase<CpaTarget>(cpaTargetRows);

  return message;
}


// ════════════════════════════════════════════════════════════════════
// Message CRUD
// ════════════════════════════════════════════════════════════════════

export async function updatePipelineMessage(id: string, data: UpdatePipelineMessageData): Promise<MessageDetail | null> {
  const { setClauses, values, nextIndex } = buildDynamicUpdate(
    data as Record<string, unknown>,
    {
      name: 'name', description: 'description', angleId: 'angle_id',
      specificPainPoint: 'specific_pain_point', corePromise: 'core_promise',
      keyIdea: 'key_idea', primaryHookDirection: 'primary_hook_direction',
      headlines: 'headlines', copyVariations: 'copy_variations',
      status: 'status', pipelineStage: 'pipeline_stage',
      verdictType: 'verdict_type', verdictNotes: 'verdict_notes',
      spendThreshold: 'spend_threshold', notes: 'notes',
    },
    { jsonbFields: new Set(['copyVariations']) },
  );

  if (setClauses.length === 0) return getPipelineMessageDetail(id);

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  await executeQuery(`
    UPDATE app_pipeline_messages
    SET ${setClauses.join(', ')}
    WHERE id = $${nextIndex} AND deleted_at IS NULL
  `, values);

  return getPipelineMessageDetail(id);
}


// ════════════════════════════════════════════════════════════════════
// Move Message (stage transitions + verdict logic)
// ════════════════════════════════════════════════════════════════════

interface MoveResult {
  success: boolean;
  newMessageId?: string;
}

/** Stop active campaigns and pause all geos for a retiring message. */
async function retireMessageResources(messageId: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_campaigns
    SET status = 'stopped', updated_at = NOW()
    WHERE message_id = $1 AND status = 'active' AND deleted_at IS NULL
  `, [messageId]);

  await executeQuery(`
    UPDATE app_pipeline_message_geos
    SET stage = 'paused', updated_at = NOW()
    WHERE message_id = $1 AND deleted_at IS NULL
  `, [messageId]);
}

export async function movePipelineMessage(
  id: string,
  targetStage: PipelineStage,
  verdictType?: VerdictType,
  verdictNotes?: string,
): Promise<MoveResult> {
  if (verdictType === 'iterate') {
    // 1. Get current message data for cloning
    const origRows = await executeQuery<Record<string, unknown>>(`
      SELECT angle_id, name, description, specific_pain_point, core_promise,
             key_idea, primary_hook_direction, headlines, spend_threshold, version
      FROM app_pipeline_messages WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    if (origRows.length === 0) return { success: false };
    const orig = origRows[0];

    // 2. Retire original + set verdict
    await executeQuery(`
      UPDATE app_pipeline_messages
      SET pipeline_stage = 'retired', status = 'retired',
          verdict_type = 'iterate', verdict_notes = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id, verdictNotes || null]);

    // 3. Stop active campaigns + pause all geos
    await retireMessageResources(id);

    // 4. Clone as v2 in backlog (no geos copied — new message starts fresh)
    const newVersion = ((orig.version as number) || 1) + 1;
    const newName = `${orig.name} v${newVersion}`;
    const cloneRows = await executeQuery<{ id: string }>(`
      INSERT INTO app_pipeline_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, pipeline_stage,
        parent_message_id, spend_threshold, version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'idea', 'backlog', $9, $10, $11
      ) RETURNING id
    `, [
      orig.angle_id, newName, orig.description, orig.specific_pain_point,
      orig.core_promise, orig.key_idea, orig.primary_hook_direction, orig.headlines,
      id, orig.spend_threshold, newVersion,
    ]);

    return { success: true, newMessageId: cloneRows[0].id };

  } else if (verdictType === 'kill') {
    // Retire + stop campaigns + pause all geos
    await executeQuery(`
      UPDATE app_pipeline_messages
      SET pipeline_stage = 'retired', status = 'retired',
          verdict_type = 'kill', verdict_notes = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id, verdictNotes || null]);

    await retireMessageResources(id);

    return { success: true };

  } else {
    // Simple stage move (e.g. production → testing, testing → scaling)
    const updateFields: string[] = ['pipeline_stage = $2', 'updated_at = NOW()'];
    const updateValues: unknown[] = [id, targetStage];
    let paramIdx = 3;

    if (verdictType) {
      updateFields.push(`verdict_type = $${paramIdx++}`);
      updateValues.push(verdictType);
    }

    await executeQuery(`
      UPDATE app_pipeline_messages
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND deleted_at IS NULL
    `, updateValues);

    return { success: true };
  }
}


// ════════════════════════════════════════════════════════════════════
// Campaign CRUD
// ════════════════════════════════════════════════════════════════════

export async function createPipelineCampaign(data: CreateCampaignRequest): Promise<Campaign> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_pipeline_campaigns (message_id, name, channel, geo, external_id, external_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, message_id, name, channel, geo, spend, conversions, cpa,
              external_id, external_url, last_data_update, created_at, updated_at
  `, [data.messageId, data.name || null, data.channel, data.geo, data.externalId || null, data.externalUrl || null]);

  return toCamelCase<Campaign>(rows[0]);
}

export async function getPipelineCampaignById(id: string): Promise<Campaign | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, message_id, name, channel, geo, spend, conversions, cpa,
           external_id, external_url, last_data_update, created_at, updated_at
    FROM app_pipeline_campaigns
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
  return rows.length > 0 ? toCamelCase<Campaign>(rows[0]) : null;
}

export async function updatePipelineCampaign(id: string, data: UpdateCampaignData): Promise<Campaign> {
  const { setClauses, values, nextIndex } = buildDynamicUpdate(
    data as Record<string, unknown>,
    {
      name: 'name', channel: 'channel', geo: 'geo',
      externalId: 'external_id', externalUrl: 'external_url',
      spend: 'spend', conversions: 'conversions', cpa: 'cpa',
    },
  );

  if (setClauses.length === 0) {
    const existing = await executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, channel, geo, spend, conversions, cpa,
             external_id, external_url, last_data_update, created_at, updated_at
      FROM app_pipeline_campaigns WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    if (existing.length === 0) throw new Error(`Campaign not found: ${id}`);
    return toCamelCase<Campaign>(existing[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const rows = await executeQuery<Record<string, unknown>>(`
    UPDATE app_pipeline_campaigns
    SET ${setClauses.join(', ')}
    WHERE id = $${nextIndex} AND deleted_at IS NULL
    RETURNING id, message_id, channel, geo, spend, conversions, cpa,
              external_id, external_url, last_data_update, created_at, updated_at
  `, values);

  if (rows.length === 0) throw new Error(`Campaign not found: ${id}`);
  return toCamelCase<Campaign>(rows[0]);
}

export async function deletePipelineCampaign(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_campaigns
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}


// ════════════════════════════════════════════════════════════════════
// Asset CRUD
// ════════════════════════════════════════════════════════════════════

export async function createPipelineAsset(data: {
  messageId: string; geo: Geography; type: string; name: string;
  url?: string; content?: string; notes?: string;
}): Promise<Asset> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_pipeline_assets (message_id, geo, type, name, url, content, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, message_id, geo, type, name, url, content, notes, created_at, updated_at
  `, [data.messageId, data.geo, data.type, data.name, data.url || null, data.content || null, data.notes || null]);
  return toCamelCase<Asset>(rows[0]);
}

export async function getPipelineAssetById(id: string): Promise<Asset | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, message_id, geo, type, name, url, content, notes, created_at, updated_at
    FROM app_pipeline_assets
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
  return rows.length > 0 ? toCamelCase<Asset>(rows[0]) : null;
}

export async function deletePipelineAsset(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_assets SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}


// ════════════════════════════════════════════════════════════════════
// Creative CRUD
// ════════════════════════════════════════════════════════════════════

export async function createPipelineCreative(data: {
  messageId: string; geo: Geography; name: string; format: string;
  cta?: string; url?: string; notes?: string;
}): Promise<Creative> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_pipeline_creatives (message_id, geo, name, format, cta, url, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, message_id, geo, name, format, cta, url, notes, created_at, updated_at
  `, [data.messageId, data.geo, data.name, data.format, data.cta || null, data.url || null, data.notes || null]);
  return toCamelCase<Creative>(rows[0]);
}

export async function getPipelineCreativeById(id: string): Promise<Creative | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, message_id, geo, name, format, cta, url, notes, created_at, updated_at
    FROM app_pipeline_creatives
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
  return rows.length > 0 ? toCamelCase<Creative>(rows[0]) : null;
}

export async function deletePipelineCreative(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_creatives SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}


// ════════════════════════════════════════════════════════════════════
// Products
// ════════════════════════════════════════════════════════════════════

export async function getProductById(id: string): Promise<Product | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT
      p.id, p.name, p.sku, p.description, p.notes, p.color, p.status,
      p.owner_id, p.drive_folder_id, p.assets_folder_id, p.created_at, p.updated_at,
      p.cpa_target_no, p.cpa_target_se, p.cpa_target_dk,
      u.id AS user_id, u.name AS user_name, u.email AS user_email
    FROM app_products p
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE p.id = $1 AND p.deleted_at IS NULL
  `, [id]);
  if (rows.length === 0) return null;
  const row = rows[0];
  const owner = row.user_id ? {
    id: row.user_id as string,
    name: row.user_name as string || '',
    email: row.user_email as string || '',
  } : undefined;
  const { user_id, user_name, user_email, ...productFields } = row;
  const product = toCamelCase<Product>(productFields);
  return { ...product, owner } as Product;
}

export async function getProducts(statusFilter?: ProductStatus | null): Promise<Product[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT
      p.id, p.name, p.sku, p.description, p.notes, p.color, p.status,
      p.owner_id, p.drive_folder_id, p.assets_folder_id, p.created_at, p.updated_at,
      u.id AS user_id, u.name AS user_name, u.email AS user_email
    FROM app_products p
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE p.deleted_at IS NULL
      AND ($1::app_product_status IS NULL OR p.status = $1)
    ORDER BY p.created_at DESC
  `, [statusFilter || null]);

  return rows.map(row => {
    const owner = row.user_id ? {
      id: row.user_id as string,
      name: row.user_name as string || '',
      email: row.user_email as string || '',
    } : undefined;
    const { user_id, user_name, user_email, ...productFields } = row;
    const product = toCamelCase<Product>(productFields);
    return { ...product, owner } as Product;
  });
}

export async function getProductsWithCpa(): Promise<Product[]> {
  return fetchProductsWithCpa();
}

export async function createProduct(data: CreateProductRequest): Promise<Product> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_products (name, sku, description, notes, color, status, owner_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, sku, description, notes, color, status, owner_id, drive_folder_id, assets_folder_id, created_at, updated_at
  `, [
    data.name,
    data.sku || null,
    data.description || null,
    data.notes || null,
    data.color || null,
    data.status || 'active',
    data.ownerId || null,
  ]);
  return toCamelCase<Product>(rows[0]);
}

export async function updateProduct(
  id: string,
  data: Partial<Pick<Product, 'name' | 'sku' | 'description' | 'notes' | 'color' | 'status' | 'ownerId' | 'driveFolderId' | 'assetsFolderId'>>,
): Promise<Product> {
  const { setClauses, values, nextIndex } = buildDynamicUpdate(
    data as Record<string, unknown>,
    {
      name: 'name', sku: 'sku', description: 'description',
      notes: 'notes', color: 'color', status: 'status', ownerId: 'owner_id',
      driveFolderId: 'drive_folder_id', assetsFolderId: 'assets_folder_id',
    },
  );

  if (setClauses.length === 0) {
    const existing = await executeQuery<Record<string, unknown>>(`
      SELECT id, name, sku, description, notes, color, status, owner_id, drive_folder_id, assets_folder_id, created_at, updated_at
      FROM app_products WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    if (existing.length === 0) throw new Error(`Product not found: ${id}`);
    return toCamelCase<Product>(existing[0]);
  }

  setClauses.push('updated_at = NOW()');
  values.push(id);

  const rows = await executeQuery<Record<string, unknown>>(`
    UPDATE app_products
    SET ${setClauses.join(', ')}
    WHERE id = $${nextIndex} AND deleted_at IS NULL
    RETURNING id, name, sku, description, notes, color, status, owner_id, drive_folder_id, assets_folder_id, created_at, updated_at
  `, values);
  if (rows.length === 0) throw new Error(`Product not found: ${id}`);
  return toCamelCase<Product>(rows[0]);
}

export async function getUsers(): Promise<PipelineUser[]> {
  return fetchUsers();
}

export async function updateProductCpaTargets(
  id: string,
  data: { cpaTargetNo?: number; cpaTargetSe?: number; cpaTargetDk?: number },
): Promise<Product> {
  const { setClauses, values, nextIndex } = buildDynamicUpdate(
    data as Record<string, unknown>,
    { cpaTargetNo: 'cpa_target_no', cpaTargetSe: 'cpa_target_se', cpaTargetDk: 'cpa_target_dk' },
  );

  if (setClauses.length === 0) {
    const existing = await executeQuery<Record<string, unknown>>(`
      SELECT id, name, description, color, owner_id, cpa_target_no, cpa_target_se, cpa_target_dk,
             drive_folder_id, created_at, updated_at
      FROM app_products WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    if (existing.length === 0) throw new Error(`Product not found: ${id}`);
    return toCamelCase<Product>(existing[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const rows = await executeQuery<Record<string, unknown>>(`
    UPDATE app_products
    SET ${setClauses.join(', ')}
    WHERE id = $${nextIndex} AND deleted_at IS NULL
    RETURNING id, name, description, color, owner_id, cpa_target_no, cpa_target_se, cpa_target_dk,
              drive_folder_id, created_at, updated_at
  `, values);

  if (rows.length === 0) throw new Error(`Product not found: ${id}`);
  return toCamelCase<Product>(rows[0]);
}


// ════════════════════════════════════════════════════════════════════
// CPA Targets (per product × geo × channel)
// ════════════════════════════════════════════════════════════════════

export async function fetchCpaTargets(productId: string): Promise<CpaTarget[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, product_id, geo, channel, target, created_at, updated_at
    FROM app_product_cpa_targets
    WHERE product_id = $1
    ORDER BY geo, channel
  `, [productId]);
  return rowsToCamelCase<CpaTarget>(rows);
}

export async function upsertCpaTargets(
  productId: string,
  targets: { geo: Geography; channel: Channel; target: number }[],
): Promise<CpaTarget[]> {
  // Simple approach: delete all for this product, then insert the new set
  await executeQuery(
    `DELETE FROM app_product_cpa_targets WHERE product_id = $1`,
    [productId],
  );

  for (const t of targets) {
    await executeQuery(`
      INSERT INTO app_product_cpa_targets (product_id, geo, channel, target)
      VALUES ($1, $2, $3, $4)
    `, [productId, t.geo, t.channel, t.target]);
  }

  return fetchCpaTargets(productId);
}


// ════════════════════════════════════════════════════════════════════
// Angles
// ════════════════════════════════════════════════════════════════════

export async function getPipelineAngles(productId?: string): Promise<Angle[]> {
  return fetchPipelineAngles(productId);
}

export async function deletePipelineAngle(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_angles
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}

export async function updatePipelineAngle(id: string, data: { name: string }): Promise<Angle> {
  const rows = await executeQuery<Record<string, unknown>>(`
    UPDATE app_pipeline_angles
    SET name = $2, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, product_id, name, description, status, drive_folder_id, created_at, updated_at
  `, [id, data.name]);
  if (rows.length === 0) throw new Error('Angle not found');
  return toCamelCase<Angle>(rows[0]);
}

export async function getAngleMessageCount(angleId: string): Promise<number> {
  const rows = await executeQuery<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM app_pipeline_messages
    WHERE angle_id = $1 AND deleted_at IS NULL
  `, [angleId]);
  return parseInt(rows[0].count, 10);
}

export async function createPipelineAngle(data: { productId: string; name: string; description?: string; driveFolderId?: string }): Promise<Angle> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_pipeline_angles (product_id, name, description, drive_folder_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, product_id, name, description, status, drive_folder_id, created_at, updated_at
  `, [data.productId, data.name, data.description || null, data.driveFolderId || null]);

  return toCamelCase<Angle>(rows[0]);
}


// ════════════════════════════════════════════════════════════════════
// Message Create + Delete
// ════════════════════════════════════════════════════════════════════

export async function createPipelineMessage(data: {
  angleId: string;
  name: string;
  description?: string;
  pipelineStage?: PipelineStage;
  driveFolderId?: string;
}): Promise<MessageDetail | null> {
  const stage = data.pipelineStage || 'backlog';
  const rows = await executeQuery<{ id: string }>(`
    INSERT INTO app_pipeline_messages (angle_id, name, description, pipeline_stage, status, drive_folder_id)
    VALUES ($1, $2, $3, $4, 'idea', $5)
    RETURNING id
  `, [data.angleId, data.name, data.description || null, stage, data.driveFolderId || null]);

  return getPipelineMessageDetail(rows[0].id);
}

export async function deletePipelineMessage(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_messages
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}


// ════════════════════════════════════════════════════════════════════
// Message Geo CRUD
// ════════════════════════════════════════════════════════════════════

export async function addMessageGeo(data: {
  messageId: string;
  geo: Geography;
  isPrimary?: boolean;
  spendThreshold?: number;
  driveFolderId?: string;
}): Promise<MessageGeo> {
  // ON CONFLICT handles race conditions and re-adding a previously removed geo
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_pipeline_message_geos (message_id, geo, is_primary, spend_threshold, drive_folder_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (message_id, geo) DO UPDATE SET
      updated_at = NOW(),
      deleted_at = NULL,
      is_primary = EXCLUDED.is_primary,
      spend_threshold = EXCLUDED.spend_threshold,
      drive_folder_id = COALESCE(EXCLUDED.drive_folder_id, app_pipeline_message_geos.drive_folder_id)
    RETURNING id, message_id, geo, stage, is_primary, launched_at,
              spend_threshold, notes, drive_folder_id, created_at, updated_at
  `, [data.messageId, data.geo, data.isPrimary ?? false, data.spendThreshold ?? 300, data.driveFolderId ?? null]);

  return toCamelCase<MessageGeo>(rows[0]);
}

export async function getMessageGeoById(id: string): Promise<MessageGeo | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, message_id, geo, stage, is_primary, launched_at,
           spend_threshold, notes, drive_folder_id, created_at, updated_at
    FROM app_pipeline_message_geos
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
  return rows.length > 0 ? toCamelCase<MessageGeo>(rows[0]) : null;
}

export async function updateMessageGeo(
  id: string,
  data: Partial<{ stage: GeoStage; spendThreshold: number; notes: string; launchedAt: string }>,
): Promise<MessageGeo> {
  const { setClauses, values, nextIndex } = buildDynamicUpdate(
    data as Record<string, unknown>,
    { stage: 'stage', spendThreshold: 'spend_threshold', notes: 'notes', launchedAt: 'launched_at' },
  );

  if (setClauses.length === 0) {
    const existing = await executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, geo, stage, is_primary, launched_at,
             spend_threshold, notes, drive_folder_id, created_at, updated_at
      FROM app_pipeline_message_geos WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    if (existing.length === 0) throw new Error(`MessageGeo not found: ${id}`);
    return toCamelCase<MessageGeo>(existing[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const rows = await executeQuery<Record<string, unknown>>(`
    UPDATE app_pipeline_message_geos
    SET ${setClauses.join(', ')}
    WHERE id = $${nextIndex} AND deleted_at IS NULL
    RETURNING id, message_id, geo, stage, is_primary, launched_at,
              spend_threshold, notes, drive_folder_id, created_at, updated_at
  `, values);

  if (rows.length === 0) throw new Error(`MessageGeo not found: ${id}`);
  return toCamelCase<MessageGeo>(rows[0]);
}

export async function deleteMessageGeo(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_message_geos
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}


// ════════════════════════════════════════════════════════════════════
// History
// ════════════════════════════════════════════════════════════════════

export interface PipelineHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  oldValueDisplay?: string | null;
  newValueDisplay?: string | null;
  action: string;
  changedBy: string;
  changedAt: string;
  changedByName?: string;
}

export async function getPipelineHistory(entityType: string, entityId: string): Promise<PipelineHistoryEntry[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT
      h.id, h.entity_type, h.entity_id, h.field_name,
      h.old_value, h.new_value, h.action, h.changed_by, h.changed_at,
      cb.name AS changed_by_name,
      COALESCE(old_u.name, old_a.name) AS old_value_display,
      COALESCE(new_u.name, new_a.name) AS new_value_display
    FROM app_entity_history h
    LEFT JOIN app_users cb ON cb.id = h.changed_by
    LEFT JOIN app_pipeline_angles old_a
      ON h.field_name = 'angleId'
      AND old_a.id::text = TRIM(BOTH '"' FROM h.old_value::text)
    LEFT JOIN app_pipeline_angles new_a
      ON h.field_name = 'angleId'
      AND new_a.id::text = TRIM(BOTH '"' FROM h.new_value::text)
    LEFT JOIN app_users old_u
      ON h.field_name = 'ownerId'
      AND old_u.id::text = TRIM(BOTH '"' FROM h.old_value::text)
    LEFT JOIN app_users new_u
      ON h.field_name = 'ownerId'
      AND new_u.id::text = TRIM(BOTH '"' FROM h.new_value::text)
    WHERE (
      (h.entity_type = $1 AND h.entity_id = $2::uuid)
      OR (h.entity_type = 'pipeline_message' AND h.entity_id != $2::uuid AND h.entity_id IN (
        SELECT id FROM app_pipeline_message_geos WHERE message_id = $2::uuid
      ))
      OR (h.entity_type = 'campaign' AND h.entity_id IN (
        SELECT id FROM app_pipeline_campaigns WHERE message_id = $2::uuid
      ))
    )
    ORDER BY h.changed_at DESC
    LIMIT 100
  `, [entityType, entityId]);

  return rowsToCamelCase<PipelineHistoryEntry>(rows);
}


// ════════════════════════════════════════════════════════════════════
// Internal helpers (shared queries)
// ════════════════════════════════════════════════════════════════════

async function fetchUsers(): Promise<PipelineUser[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, name, email, created_at, updated_at
    FROM app_users WHERE deleted_at IS NULL AND is_product_owner = true ORDER BY name
  `);
  return rowsToCamelCase<PipelineUser>(rows);
}

async function fetchProductsWithCpa(productId?: string): Promise<Product[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT p.id, p.name, p.sku, p.description, p.notes, p.color, p.owner_id,
           p.cpa_target_no, p.cpa_target_se, p.cpa_target_dk,
           p.drive_folder_id, p.assets_folder_id, p.created_at, p.updated_at,
           u.id AS user_id, u.name AS user_name, u.email AS user_email
    FROM app_products p
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE p.deleted_at IS NULL
      AND ($1::uuid IS NULL OR p.id = $1)
    ORDER BY p.name
  `, [productId || null]);
  const products = rows.map(row => {
    const owner = row.user_id ? {
      id: row.user_id as string,
      name: row.user_name as string || '',
      email: row.user_email as string || '',
    } : undefined;
    const { user_id, user_name, user_email, ...productFields } = row;
    return { ...toCamelCase<Product>(productFields), owner } as Product;
  });

  // Attach per-geo-channel CPA targets (graceful if table doesn't exist yet)
  if (products.length > 0) {
    try {
      const productIds = products.map(p => p.id);
      const targetRows = await executeQuery<Record<string, unknown>>(`
        SELECT id, product_id, geo, channel, target
        FROM app_product_cpa_targets
        WHERE product_id = ANY($1)
        ORDER BY geo, channel
      `, [productIds]);
      const targets = rowsToCamelCase<CpaTarget>(targetRows);
      const targetsByProduct: Record<string, CpaTarget[]> = {};
      for (const t of targets) {
        if (!targetsByProduct[t.productId]) targetsByProduct[t.productId] = [];
        targetsByProduct[t.productId].push(t);
      }
      for (const p of products) {
        p.cpaTargets = targetsByProduct[p.id] || [];
      }
    } catch {
      // Table may not exist yet — leave cpaTargets undefined
    }
  }

  return products;
}

async function fetchPipelineAngles(productId?: string): Promise<Angle[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT a.id, a.product_id, a.name, a.description, a.status, a.drive_folder_id, a.created_at, a.updated_at,
           (SELECT COUNT(*) FROM app_pipeline_messages m WHERE m.angle_id = a.id AND m.deleted_at IS NULL)::int AS message_count
    FROM app_pipeline_angles a
    WHERE a.deleted_at IS NULL
      AND ($1::uuid IS NULL OR a.product_id = $1)
    ORDER BY a.name
  `, [productId || null]);
  return rowsToCamelCase<Angle>(rows);
}
