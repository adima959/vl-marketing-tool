// Marketing Pipeline Database Query Helpers
// Uses PostgreSQL (Neon) - placeholders: $1, $2, $3

import { executeQuery } from '@/lib/server/db';
import { computeSummary } from '@/lib/marketing-pipeline/cpaUtils';
import type {
  PipelineCard,
  PipelineStage,
  PipelineSummary,
  Product,
  Angle,
  TrackerUser,
  Campaign,
  Asset,
  Creative,
  MessageDetail,
  Channel,
  Geography,
  VerdictType,
  CreateCampaignRequest,
} from '@/types';

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function toCamelCase<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

function rowsToCamelCase<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map(row => toCamelCase<T>(row));
}


// ════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════

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
  users: TrackerUser[];
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
  status: string;
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
      id, message_id, channel, geo, status, spend, conversions, cpa,
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

  // 3. Build PipelineCard objects
  let cards: PipelineCard[] = messageRows.map(row => {
    const msgCampaigns = campaignsByMessage[row.id as string] || [];
    const activeCampaigns = msgCampaigns.filter(c => c.status === 'active');
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
      activeCampaignCount: activeCampaigns.length,
      campaigns: msgCampaigns,
      verdictType: row.verdict_type as VerdictType | undefined,
      parentMessageId: row.parent_message_id as string | undefined,
      version: (row.version as number) || 1,
      spendThreshold: Number(row.spend_threshold) || 300,
      updatedAt: row.updated_at as string,
    };
  });

  // 4. Apply channel/geo filters in JS (these depend on campaign data)
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

  // 5. Fetch filter dropdown data in parallel
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
      m.primary_hook_direction, m.headlines, m.status,
      m.pipeline_stage, m.verdict_type, m.verdict_notes,
      m.parent_message_id, m.spend_threshold, m.version,
      m.notes, m.launched_at, m.created_at, m.updated_at,
      a.id AS pl_angle_id, a.name AS pl_angle_name,
      a.description AS pl_angle_desc, a.status AS pl_angle_status,
      a.product_id AS pl_product_id,
      p.name AS pl_product_name, p.description AS pl_product_desc,
      p.owner_id AS pl_owner_id,
      p.cpa_target_no, p.cpa_target_se, p.cpa_target_dk,
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
  });

  // Build nested objects
  message.angle = {
    id: row.pl_angle_id as string,
    productId: row.pl_product_id as string,
    name: row.pl_angle_name as string,
    description: row.pl_angle_desc as string | undefined,
    status: row.pl_angle_status as 'idea' | 'live',
    createdAt: '',
    updatedAt: '',
  } as Angle;

  message.product = {
    id: row.pl_product_id as string,
    name: row.pl_product_name as string,
    description: row.pl_product_desc as string | undefined,
    status: 'active',
    ownerId: row.pl_owner_id as string,
    cpaTargetNo: row.cpa_target_no != null ? Number(row.cpa_target_no) : undefined,
    cpaTargetSe: row.cpa_target_se != null ? Number(row.cpa_target_se) : undefined,
    cpaTargetDk: row.cpa_target_dk != null ? Number(row.cpa_target_dk) : undefined,
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

  // Fetch campaigns, assets, creatives in parallel
  const [campaignRows, assetRows, creativeRows] = await Promise.all([
    executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, channel, geo, status, spend, conversions, cpa,
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
  ]);

  message.campaigns = rowsToCamelCase<Campaign>(campaignRows);
  message.assets = rowsToCamelCase<Asset>(assetRows);
  message.creatives = rowsToCamelCase<Creative>(creativeRows);

  return message;
}


// ════════════════════════════════════════════════════════════════════
// Message CRUD
// ════════════════════════════════════════════════════════════════════

export async function updatePipelineMessage(id: string, data: UpdatePipelineMessageData): Promise<MessageDetail | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    angleId: 'angle_id',
    specificPainPoint: 'specific_pain_point',
    corePromise: 'core_promise',
    keyIdea: 'key_idea',
    primaryHookDirection: 'primary_hook_direction',
    headlines: 'headlines',
    status: 'status',
    pipelineStage: 'pipeline_stage',
    verdictType: 'verdict_type',
    verdictNotes: 'verdict_notes',
    spendThreshold: 'spend_threshold',
    notes: 'notes',
  };

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    const val = data[jsKey as keyof UpdatePipelineMessageData];
    if (val !== undefined) {
      setClauses.push(`${dbCol} = $${paramIndex++}`);
      values.push(val);
    }
  }

  if (setClauses.length === 0) {
    return getPipelineMessageDetail(id);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  await executeQuery(`
    UPDATE app_pipeline_messages
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
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

    // 3. Stop active campaigns
    await executeQuery(`
      UPDATE app_pipeline_campaigns
      SET status = 'stopped', updated_at = NOW()
      WHERE message_id = $1 AND status = 'active' AND deleted_at IS NULL
    `, [id]);

    // 4. Clone as v2 in backlog
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
    // Retire + stop campaigns
    await executeQuery(`
      UPDATE app_pipeline_messages
      SET pipeline_stage = 'retired', status = 'retired',
          verdict_type = 'kill', verdict_notes = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id, verdictNotes || null]);

    await executeQuery(`
      UPDATE app_pipeline_campaigns
      SET status = 'stopped', updated_at = NOW()
      WHERE message_id = $1 AND status = 'active' AND deleted_at IS NULL
    `, [id]);

    return { success: true };

  } else {
    // Simple move (scale/expand → winner, or any other stage move)
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
    INSERT INTO app_pipeline_campaigns (message_id, channel, geo, external_id, external_url)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, message_id, channel, geo, status, spend, conversions, cpa,
              external_id, external_url, last_data_update, created_at, updated_at
  `, [data.messageId, data.channel, data.geo, data.externalId || null, data.externalUrl || null]);

  return toCamelCase<Campaign>(rows[0]);
}

export async function updatePipelineCampaign(id: string, data: UpdateCampaignData): Promise<Campaign> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    channel: 'channel',
    geo: 'geo',
    externalId: 'external_id',
    externalUrl: 'external_url',
    status: 'status',
    spend: 'spend',
    conversions: 'conversions',
    cpa: 'cpa',
  };

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    const val = data[jsKey as keyof UpdateCampaignData];
    if (val !== undefined) {
      setClauses.push(`${dbCol} = $${paramIndex++}`);
      values.push(val);
    }
  }

  if (setClauses.length === 0) {
    const existing = await executeQuery<Record<string, unknown>>(`
      SELECT id, message_id, channel, geo, status, spend, conversions, cpa,
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
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, message_id, channel, geo, status, spend, conversions, cpa,
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

export async function deletePipelineCreative(id: string): Promise<void> {
  await executeQuery(`
    UPDATE app_pipeline_creatives SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}


// ════════════════════════════════════════════════════════════════════
// Products (CPA targets)
// ════════════════════════════════════════════════════════════════════

export async function getProductsWithCpa(): Promise<Product[]> {
  return fetchProductsWithCpa();
}

export async function updateProductCpaTargets(
  id: string,
  data: { cpaTargetNo?: number; cpaTargetSe?: number; cpaTargetDk?: number },
): Promise<Product> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.cpaTargetNo !== undefined) {
    setClauses.push(`cpa_target_no = $${paramIndex++}`);
    values.push(data.cpaTargetNo);
  }
  if (data.cpaTargetSe !== undefined) {
    setClauses.push(`cpa_target_se = $${paramIndex++}`);
    values.push(data.cpaTargetSe);
  }
  if (data.cpaTargetDk !== undefined) {
    setClauses.push(`cpa_target_dk = $${paramIndex++}`);
    values.push(data.cpaTargetDk);
  }

  if (setClauses.length === 0) {
    const existing = await executeQuery<Record<string, unknown>>(`
      SELECT id, name, description, color, owner_id, cpa_target_no, cpa_target_se, cpa_target_dk,
             created_at, updated_at
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
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, name, description, color, owner_id, cpa_target_no, cpa_target_se, cpa_target_dk,
              created_at, updated_at
  `, values);

  if (rows.length === 0) throw new Error(`Product not found: ${id}`);
  return toCamelCase<Product>(rows[0]);
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

export async function getAngleMessageCount(angleId: string): Promise<number> {
  const rows = await executeQuery<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM app_pipeline_messages
    WHERE angle_id = $1 AND deleted_at IS NULL
  `, [angleId]);
  return parseInt(rows[0].count, 10);
}

export async function createPipelineAngle(data: { productId: string; name: string; description?: string }): Promise<Angle> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_pipeline_angles (product_id, name, description)
    VALUES ($1, $2, $3)
    RETURNING id, product_id, name, description, status, created_at, updated_at
  `, [data.productId, data.name, data.description || null]);

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
}): Promise<MessageDetail | null> {
  const stage = data.pipelineStage || 'backlog';
  const rows = await executeQuery<{ id: string }>(`
    INSERT INTO app_pipeline_messages (angle_id, name, description, pipeline_stage, status)
    VALUES ($1, $2, $3, $4, 'idea')
    RETURNING id
  `, [data.angleId, data.name, data.description || null, stage]);

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
// History
// ════════════════════════════════════════════════════════════════════

export interface PipelineHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
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
      u.name AS changed_by_name
    FROM app_entity_history h
    LEFT JOIN app_users u ON u.id = h.changed_by
    WHERE h.entity_type = $1 AND h.entity_id = $2
    ORDER BY h.changed_at DESC
    LIMIT 50
  `, [entityType, entityId]);

  return rowsToCamelCase<PipelineHistoryEntry>(rows);
}


// ════════════════════════════════════════════════════════════════════
// Internal helpers (shared queries)
// ════════════════════════════════════════════════════════════════════

async function fetchUsers(): Promise<TrackerUser[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, name, email, created_at, updated_at
    FROM app_users WHERE deleted_at IS NULL AND is_product_owner = true ORDER BY name
  `);
  return rowsToCamelCase<TrackerUser>(rows);
}

async function fetchProductsWithCpa(productId?: string): Promise<Product[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, name, description, color, owner_id, cpa_target_no, cpa_target_se, cpa_target_dk,
           created_at, updated_at
    FROM app_products
    WHERE deleted_at IS NULL
      AND ($1::uuid IS NULL OR id = $1)
    ORDER BY name
  `, [productId || null]);
  return rowsToCamelCase<Product>(rows);
}

async function fetchPipelineAngles(productId?: string): Promise<Angle[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT a.id, a.product_id, a.name, a.description, a.status, a.created_at, a.updated_at,
           (SELECT COUNT(*) FROM app_pipeline_messages m WHERE m.angle_id = a.id AND m.deleted_at IS NULL)::int AS message_count
    FROM app_pipeline_angles a
    WHERE a.deleted_at IS NULL
      AND ($1::uuid IS NULL OR a.product_id = $1)
    ORDER BY a.name
  `, [productId || null]);
  return rowsToCamelCase<Angle>(rows);
}
