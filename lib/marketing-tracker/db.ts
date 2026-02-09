// Marketing Tracker Database Query Helpers
// Uses PostgreSQL (Neon) - placeholders: $1, $2, $3

import { executeQuery } from '@/lib/server/db';
import { toCamelCase, rowsToCamelCase } from '@/lib/server/caseUtils';
import type {
  Product,
  ProductStatus,
  Angle,
  Message,
  Creative,
  Asset,
  CreateProductRequest,
  CreateAngleRequest,
  CreateMessageRequest,
  CreateCreativeRequest,
  CreateAssetRequest,
} from '@/types/marketing-tracker';

// ============================================================================
// Type Definitions for Create/Update Operations
// ============================================================================

export type CreateProductData = CreateProductRequest;
export type UpdateProductData = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'owner' | 'angleCount' | 'activeAngleCount'>>;

export type CreateAngleData = CreateAngleRequest;
export type UpdateAngleData = Partial<Omit<Angle, 'id' | 'createdAt' | 'updatedAt' | 'messages' | 'messageCount'>>;

export type CreateMessageData = CreateMessageRequest;
export type UpdateMessageData = Partial<Omit<Message, 'id' | 'createdAt' | 'updatedAt' | 'assets' | 'creatives' | 'assetCount' | 'creativeCount' | 'assetsByGeo' | 'creativesByGeo'>>;

export type CreateCreativeData = CreateCreativeRequest;
export type UpdateCreativeData = Partial<Omit<Creative, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateAssetData = CreateAssetRequest;
export type UpdateAssetData = Partial<Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>>;

// ============================================================================
// Products
// ============================================================================

/**
 * Get all products with angle counts
 * @param statusFilter - Optional status filter ('active' | 'inactive' | null for all)
 */
export async function getProducts(statusFilter?: ProductStatus | null): Promise<Product[]> {
  // Optimized query using subqueries instead of JOIN + GROUP BY for better performance
  const query = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.description,
      p.notes,
      p.color,
      p.status,
      p.owner_id,
      p.created_at,
      p.updated_at,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      (SELECT COUNT(*)::int FROM app_angles a WHERE a.product_id = p.id AND a.deleted_at IS NULL) AS angle_count,
      (SELECT COUNT(*)::int FROM app_angles a WHERE a.product_id = p.id AND a.deleted_at IS NULL AND a.status IN ('live', 'in_production')) AS active_angle_count
    FROM app_products p
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE p.deleted_at IS NULL
      AND ($1::app_product_status IS NULL OR p.status = $1)
    ORDER BY p.created_at DESC
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [statusFilter || null]);
  // Transform rows to include nested owner object
  return rows.map(row => {
    // Build owner object from user_* fields before camelCase conversion
    const owner = row.user_id ? {
      id: row.user_id as string,
      name: row.user_name as string || '',
      email: row.user_email as string || '',
    } : undefined;

    // Remove user_* fields from row before converting
    const { user_id, user_name, user_email, ...productFields } = row;
    const product = toCamelCase<Product>(productFields);

    return { ...product, owner } as Product;
  });
}

/**
 * Get a single product by ID (with angle counts - use for dashboard/product list)
 */
export async function getProductById(id: string): Promise<Product | null> {
  const query = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.description,
      p.notes,
      p.color,
      p.status,
      p.owner_id,
      p.created_at,
      p.updated_at,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      (SELECT COUNT(*)::int FROM app_angles a WHERE a.product_id = p.id AND a.deleted_at IS NULL) AS angle_count,
      (SELECT COUNT(*)::int FROM app_angles a WHERE a.product_id = p.id AND a.deleted_at IS NULL AND a.status IN ('live', 'in_production')) AS active_angle_count
    FROM app_products p
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE p.id = $1 AND p.deleted_at IS NULL
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  // Build owner object from user_* fields before camelCase conversion
  const owner = row.user_id ? {
    id: row.user_id as string,
    name: row.user_name as string || '',
    email: row.user_email as string || '',
  } : undefined;

  // Remove user_* fields from row before converting
  const { user_id, user_name, user_email, ...productFields } = row;
  const product = toCamelCase<Product>(productFields);

  return { ...product, owner } as Product;
}

/**
 * Get a single product by ID (simple - no angle counts, faster query)
 * Use when you don't need angle counts (e.g., breadcrumbs, parent info)
 */
export async function getProductByIdSimple(id: string): Promise<Product | null> {
  const query = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.description,
      p.notes,
      p.color,
      p.status,
      p.owner_id,
      p.created_at,
      p.updated_at,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email
    FROM app_products p
    LEFT JOIN app_users u ON u.id = p.owner_id
    WHERE p.id = $1 AND p.deleted_at IS NULL
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  const owner = row.user_id ? {
    id: row.user_id as string,
    name: row.user_name as string || '',
    email: row.user_email as string || '',
  } : undefined;

  const { user_id, user_name, user_email, ...productFields } = row;
  const product = toCamelCase<Product>(productFields);

  // Set counts to 0 - caller should derive from actual data if needed
  return { ...product, owner, angleCount: 0, activeAngleCount: 0 } as Product;
}

/**
 * Create a new product
 */
export async function createProduct(data: CreateProductData): Promise<Product> {
  const query = `
    INSERT INTO app_products (name, sku, description, notes, color, status, owner_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, sku, description, notes, color, status, owner_id, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [
    data.name,
    data.sku || null,
    data.description || null,
    data.notes || null,
    data.color || null,
    data.status || 'active',
    data.ownerId,
  ]);

  const product = toCamelCase<Product>(rows[0]);
  // New products have zero angles
  product.angleCount = 0;
  product.activeAngleCount = 0;
  return product;
}

/**
 * Update a product
 */
export async function updateProduct(id: string, data: UpdateProductData): Promise<Product> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.sku !== undefined) {
    setClauses.push(`sku = $${paramIndex++}`);
    values.push(data.sku);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }
  if (data.color !== undefined) {
    setClauses.push(`color = $${paramIndex++}`);
    values.push(data.color);
  }
  if (data.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }
  if (data.ownerId !== undefined) {
    setClauses.push(`owner_id = $${paramIndex++}`);
    values.push(data.ownerId);
  }

  if (setClauses.length === 0) {
    // No updates, just return the existing product
    const existing = await getProductById(id);
    if (!existing) throw new Error(`Product not found: ${id}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE app_products
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, name, sku, description, notes, color, status, owner_id, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, values);
  if (rows.length === 0) throw new Error(`Product not found: ${id}`);

  // Return RETURNING data directly - counts don't change on text field updates
  // Caller should merge with existing counts if needed
  const product = toCamelCase<Product>(rows[0]);
  return product;
}

/**
 * Soft delete a product
 */
export async function deleteProduct(id: string): Promise<void> {
  const query = `
    UPDATE app_products
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;

  await executeQuery(query, [id]);
}

// ============================================================================
// Angles
// ============================================================================

/**
 * Get all angles for a product with message counts
 */
export async function getAnglesByProductId(productId: string): Promise<Angle[]> {
  const query = `
    SELECT
      a.id,
      a.product_id,
      a.name,
      a.description,
      a.status,
      a.launched_at,
      a.created_at,
      a.updated_at,
      COUNT(DISTINCT m.id) AS message_count
    FROM app_angles a
    LEFT JOIN app_messages m ON m.angle_id = a.id AND m.deleted_at IS NULL
    WHERE a.product_id = $1 AND a.deleted_at IS NULL
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [productId]);
  return rowsToCamelCase<Angle>(rows);
}

/**
 * Get a single angle by ID
 */
export async function getAngleById(id: string): Promise<Angle | null> {
  const query = `
    SELECT
      a.id,
      a.product_id,
      a.name,
      a.description,
      a.status,
      a.launched_at,
      a.created_at,
      a.updated_at,
      COUNT(DISTINCT m.id) AS message_count
    FROM app_angles a
    LEFT JOIN app_messages m ON m.angle_id = a.id AND m.deleted_at IS NULL
    WHERE a.id = $1 AND a.deleted_at IS NULL
    GROUP BY a.id
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [id]);
  if (rows.length === 0) return null;
  return toCamelCase<Angle>(rows[0]);
}

/**
 * Create a new angle
 */
export async function createAngle(data: CreateAngleData): Promise<Angle> {
  const query = `
    INSERT INTO app_angles (product_id, name, description, status)
    VALUES ($1, $2, $3, $4)
    RETURNING id, product_id, name, description, status, launched_at, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [
    data.productId,
    data.name,
    data.description || null,
    data.status || 'idea',
  ]);

  const angle = toCamelCase<Angle>(rows[0]);
  angle.messageCount = 0;
  return angle;
}

/**
 * Update an angle
 */
export async function updateAngle(id: string, data: UpdateAngleData): Promise<Angle> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.productId !== undefined) {
    setClauses.push(`product_id = $${paramIndex++}`);
    values.push(data.productId);
  }
  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(data.status);

    // Auto-set launched_at when status changes to 'live'
    if (data.status === 'live' && data.launchedAt === undefined) {
      setClauses.push(`launched_at = COALESCE(launched_at, NOW())`);
    }
  }
  if (data.launchedAt !== undefined) {
    setClauses.push(`launched_at = $${paramIndex++}`);
    values.push(data.launchedAt);
  }

  if (setClauses.length === 0) {
    const existing = await getAngleById(id);
    if (!existing) throw new Error(`Angle not found: ${id}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE app_angles
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, product_id, name, description, status, launched_at, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, values);
  if (rows.length === 0) throw new Error(`Angle not found: ${id}`);

  // Return RETURNING data directly - counts don't change on text field updates
  // Caller should merge with existing counts if needed
  const angle = toCamelCase<Angle>(rows[0]);
  return angle;
}

/**
 * Soft delete an angle
 */
export async function deleteAngle(id: string): Promise<void> {
  const query = `
    UPDATE app_angles
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;

  await executeQuery(query, [id]);
}

// ============================================================================
// Messages
// ============================================================================

/**
 * Get all messages for an angle with asset and creative counts
 */
export async function getMessagesByAngleId(angleId: string): Promise<Message[]> {
  const query = `
    SELECT
      m.id,
      m.angle_id,
      m.name,
      m.description,
      m.specific_pain_point,
      m.core_promise,
      m.key_idea,
      m.primary_hook_direction,
      m.headlines,
      m.status,
      m.launched_at,
      m.created_at,
      m.updated_at,
      COUNT(DISTINCT a.id) AS asset_count,
      COUNT(DISTINCT c.id) AS creative_count
    FROM app_messages m
    LEFT JOIN app_assets a ON a.message_id = m.id AND a.deleted_at IS NULL
    LEFT JOIN app_creatives c ON c.message_id = m.id AND c.deleted_at IS NULL
    WHERE m.angle_id = $1 AND m.deleted_at IS NULL
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [angleId]);
  return rowsToCamelCase<Message>(rows);
}

/**
 * Get a single message by ID
 */
export async function getMessageById(id: string): Promise<Message | null> {
  const query = `
    SELECT
      m.id,
      m.angle_id,
      m.name,
      m.description,
      m.specific_pain_point,
      m.core_promise,
      m.key_idea,
      m.primary_hook_direction,
      m.headlines,
      m.status,
      m.launched_at,
      m.created_at,
      m.updated_at,
      COUNT(DISTINCT a.id) AS asset_count,
      COUNT(DISTINCT c.id) AS creative_count
    FROM app_messages m
    LEFT JOIN app_assets a ON a.message_id = m.id AND a.deleted_at IS NULL
    LEFT JOIN app_creatives c ON c.message_id = m.id AND c.deleted_at IS NULL
    WHERE m.id = $1 AND m.deleted_at IS NULL
    GROUP BY m.id
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [id]);
  if (rows.length === 0) return null;
  return toCamelCase<Message>(rows[0]);
}

/**
 * Create a new message
 */
export async function createMessage(data: CreateMessageData): Promise<Message> {
  const query = `
    INSERT INTO app_messages (
      angle_id, name, description, specific_pain_point, core_promise,
      key_idea, primary_hook_direction, headlines, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, angle_id, name, description, specific_pain_point, core_promise,
      key_idea, primary_hook_direction, headlines, status, launched_at, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [
    data.angleId,
    data.name,
    data.description || null,
    data.specificPainPoint || null,
    data.corePromise || null,
    data.keyIdea || null,
    data.primaryHookDirection || null,
    data.headlines || null,
    data.status || 'idea',
  ]);

  const message = toCamelCase<Message>(rows[0]);
  message.assetCount = 0;
  message.creativeCount = 0;
  return message;
}

/**
 * Update a message
 */
export async function updateMessage(id: string, data: UpdateMessageData): Promise<Message> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.angleId !== undefined) {
    setClauses.push(`angle_id = $${paramIndex++}`);
    values.push(data.angleId);
  }
  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.specificPainPoint !== undefined) {
    setClauses.push(`specific_pain_point = $${paramIndex++}`);
    values.push(data.specificPainPoint);
  }
  if (data.corePromise !== undefined) {
    setClauses.push(`core_promise = $${paramIndex++}`);
    values.push(data.corePromise);
  }
  if (data.keyIdea !== undefined) {
    setClauses.push(`key_idea = $${paramIndex++}`);
    values.push(data.keyIdea);
  }
  if (data.primaryHookDirection !== undefined) {
    setClauses.push(`primary_hook_direction = $${paramIndex++}`);
    values.push(data.primaryHookDirection);
  }
  if (data.headlines !== undefined) {
    setClauses.push(`headlines = $${paramIndex++}`);
    values.push(data.headlines);
  }
  if (data.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(data.status);

    // Auto-set launched_at when status changes to 'live'
    if (data.status === 'live' && data.launchedAt === undefined) {
      setClauses.push(`launched_at = COALESCE(launched_at, NOW())`);
    }
  }
  if (data.launchedAt !== undefined) {
    setClauses.push(`launched_at = $${paramIndex++}`);
    values.push(data.launchedAt);
  }

  if (setClauses.length === 0) {
    const existing = await getMessageById(id);
    if (!existing) throw new Error(`Message not found: ${id}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE app_messages
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, angle_id, name, description, specific_pain_point, core_promise,
      key_idea, primary_hook_direction, headlines, status, launched_at, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, values);
  if (rows.length === 0) throw new Error(`Message not found: ${id}`);

  // Return RETURNING data directly - counts don't change on text field updates
  // Caller should merge with existing counts if needed
  const message = toCamelCase<Message>(rows[0]);
  return message;
}

/**
 * Soft delete a message
 */
export async function deleteMessage(id: string): Promise<void> {
  const query = `
    UPDATE app_messages
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;

  await executeQuery(query, [id]);
}

// ============================================================================
// Creatives
// ============================================================================

/**
 * Get all creatives for a message
 */
export async function getCreativesByMessageId(messageId: string): Promise<Creative[]> {
  const query = `
    SELECT
      id,
      message_id,
      geo,
      name,
      format,
      cta,
      url,
      notes,
      created_at,
      updated_at
    FROM app_creatives
    WHERE message_id = $1 AND deleted_at IS NULL
    ORDER BY geo, created_at DESC
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [messageId]);
  return rowsToCamelCase<Creative>(rows);
}

/**
 * Get a single creative by ID
 */
export async function getCreativeById(id: string): Promise<Creative | null> {
  const query = `
    SELECT
      id,
      message_id,
      geo,
      name,
      format,
      cta,
      url,
      notes,
      created_at,
      updated_at
    FROM app_creatives
    WHERE id = $1 AND deleted_at IS NULL
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [id]);
  if (rows.length === 0) return null;
  return toCamelCase<Creative>(rows[0]);
}

/**
 * Create a new creative
 */
export async function createCreative(data: CreateCreativeData): Promise<Creative> {
  const query = `
    INSERT INTO app_creatives (message_id, geo, name, format, cta, url, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, message_id, geo, name, format, cta, url, notes, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [
    data.messageId,
    data.geo,
    data.name,
    data.format,
    data.cta || null,
    data.url || null,
    data.notes || null,
  ]);

  return toCamelCase<Creative>(rows[0]);
}

/**
 * Update a creative
 */
export async function updateCreative(id: string, data: UpdateCreativeData): Promise<Creative> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.messageId !== undefined) {
    setClauses.push(`message_id = $${paramIndex++}`);
    values.push(data.messageId);
  }
  if (data.geo !== undefined) {
    setClauses.push(`geo = $${paramIndex++}`);
    values.push(data.geo);
  }
  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.format !== undefined) {
    setClauses.push(`format = $${paramIndex++}`);
    values.push(data.format);
  }
  if (data.cta !== undefined) {
    setClauses.push(`cta = $${paramIndex++}`);
    values.push(data.cta);
  }
  if (data.url !== undefined) {
    setClauses.push(`url = $${paramIndex++}`);
    values.push(data.url);
  }
  if (data.notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }

  if (setClauses.length === 0) {
    const existing = await getCreativeById(id);
    if (!existing) throw new Error(`Creative not found: ${id}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE app_creatives
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, message_id, geo, name, format, cta, url, notes, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, values);
  if (rows.length === 0) throw new Error(`Creative not found: ${id}`);

  return toCamelCase<Creative>(rows[0]);
}

/**
 * Soft delete a creative
 */
export async function deleteCreative(id: string): Promise<void> {
  const query = `
    UPDATE app_creatives
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;

  await executeQuery(query, [id]);
}

// ============================================================================
// Assets
// ============================================================================

/**
 * Get all assets for a message
 */
export async function getAssetsByMessageId(messageId: string): Promise<Asset[]> {
  const query = `
    SELECT
      id,
      message_id,
      geo,
      type,
      name,
      url,
      content,
      notes,
      created_at,
      updated_at
    FROM app_assets
    WHERE message_id = $1 AND deleted_at IS NULL
    ORDER BY geo, type, created_at DESC
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [messageId]);
  return rowsToCamelCase<Asset>(rows);
}

/**
 * Get a single asset by ID
 */
export async function getAssetById(id: string): Promise<Asset | null> {
  const query = `
    SELECT
      id,
      message_id,
      geo,
      type,
      name,
      url,
      content,
      notes,
      created_at,
      updated_at
    FROM app_assets
    WHERE id = $1 AND deleted_at IS NULL
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [id]);
  if (rows.length === 0) return null;
  return toCamelCase<Asset>(rows[0]);
}

/**
 * Create a new asset
 */
export async function createAsset(data: CreateAssetData): Promise<Asset> {
  const query = `
    INSERT INTO app_assets (message_id, geo, type, name, url, content, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, message_id, geo, type, name, url, content, notes, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [
    data.messageId,
    data.geo,
    data.type,
    data.name,
    data.url || null,
    data.content || null,
    data.notes || null,
  ]);

  return toCamelCase<Asset>(rows[0]);
}

/**
 * Update an asset
 */
export async function updateAsset(id: string, data: UpdateAssetData): Promise<Asset> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.messageId !== undefined) {
    setClauses.push(`message_id = $${paramIndex++}`);
    values.push(data.messageId);
  }
  if (data.geo !== undefined) {
    setClauses.push(`geo = $${paramIndex++}`);
    values.push(data.geo);
  }
  if (data.type !== undefined) {
    setClauses.push(`type = $${paramIndex++}`);
    values.push(data.type);
  }
  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.url !== undefined) {
    setClauses.push(`url = $${paramIndex++}`);
    values.push(data.url);
  }
  if (data.content !== undefined) {
    setClauses.push(`content = $${paramIndex++}`);
    values.push(data.content);
  }
  if (data.notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }

  if (setClauses.length === 0) {
    const existing = await getAssetById(id);
    if (!existing) throw new Error(`Asset not found: ${id}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE app_assets
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, message_id, geo, type, name, url, content, notes, created_at, updated_at
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, values);
  if (rows.length === 0) throw new Error(`Asset not found: ${id}`);

  return toCamelCase<Asset>(rows[0]);
}

/**
 * Soft delete an asset
 */
export async function deleteAsset(id: string): Promise<void> {
  const query = `
    UPDATE app_assets
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;

  await executeQuery(query, [id]);
}

// ============================================================================
// Cascade Deletes
// ============================================================================

/**
 * Cascade soft-delete a product and ALL descendants (angles → messages → assets/creatives).
 * Deletes bottom-up: assets/creatives first, then messages, then angles, then product.
 */
export async function cascadeDeleteProduct(id: string): Promise<void> {
  // 1. Soft-delete assets of messages of angles of this product
  await executeQuery(`
    UPDATE app_assets SET deleted_at = NOW(), updated_at = NOW()
    WHERE deleted_at IS NULL AND message_id IN (
      SELECT m.id FROM app_messages m
      JOIN app_angles a ON a.id = m.angle_id
      WHERE a.product_id = $1 AND a.deleted_at IS NULL AND m.deleted_at IS NULL
    )
  `, [id]);

  // 2. Soft-delete creatives of messages of angles of this product
  await executeQuery(`
    UPDATE app_creatives SET deleted_at = NOW(), updated_at = NOW()
    WHERE deleted_at IS NULL AND message_id IN (
      SELECT m.id FROM app_messages m
      JOIN app_angles a ON a.id = m.angle_id
      WHERE a.product_id = $1 AND a.deleted_at IS NULL AND m.deleted_at IS NULL
    )
  `, [id]);

  // 3. Soft-delete messages of angles of this product
  await executeQuery(`
    UPDATE app_messages SET deleted_at = NOW(), updated_at = NOW()
    WHERE deleted_at IS NULL AND angle_id IN (
      SELECT id FROM app_angles WHERE product_id = $1 AND deleted_at IS NULL
    )
  `, [id]);

  // 4. Soft-delete angles of this product
  await executeQuery(`
    UPDATE app_angles SET deleted_at = NOW(), updated_at = NOW()
    WHERE product_id = $1 AND deleted_at IS NULL
  `, [id]);

  // 5. Soft-delete the product itself
  await deleteProduct(id);
}

/**
 * Cascade soft-delete an angle and ALL descendants (messages → assets/creatives).
 */
export async function cascadeDeleteAngle(id: string): Promise<void> {
  // 1. Soft-delete assets of messages of this angle
  await executeQuery(`
    UPDATE app_assets SET deleted_at = NOW(), updated_at = NOW()
    WHERE deleted_at IS NULL AND message_id IN (
      SELECT id FROM app_messages WHERE angle_id = $1 AND deleted_at IS NULL
    )
  `, [id]);

  // 2. Soft-delete creatives of messages of this angle
  await executeQuery(`
    UPDATE app_creatives SET deleted_at = NOW(), updated_at = NOW()
    WHERE deleted_at IS NULL AND message_id IN (
      SELECT id FROM app_messages WHERE angle_id = $1 AND deleted_at IS NULL
    )
  `, [id]);

  // 3. Soft-delete messages of this angle
  await executeQuery(`
    UPDATE app_messages SET deleted_at = NOW(), updated_at = NOW()
    WHERE angle_id = $1 AND deleted_at IS NULL
  `, [id]);

  // 4. Soft-delete the angle itself
  await deleteAngle(id);
}

/**
 * Cascade soft-delete a message and ALL its assets/creatives.
 */
export async function cascadeDeleteMessage(id: string): Promise<void> {
  // 1. Soft-delete assets of this message
  await executeQuery(`
    UPDATE app_assets SET deleted_at = NOW(), updated_at = NOW()
    WHERE message_id = $1 AND deleted_at IS NULL
  `, [id]);

  // 2. Soft-delete creatives of this message
  await executeQuery(`
    UPDATE app_creatives SET deleted_at = NOW(), updated_at = NOW()
    WHERE message_id = $1 AND deleted_at IS NULL
  `, [id]);

  // 3. Soft-delete the message itself
  await deleteMessage(id);
}

// ============================================================================
// Move Children
// ============================================================================

/**
 * Move all angles from one product to another.
 */
export async function moveAnglesToProduct(sourceProductId: string, targetProductId: string): Promise<void> {
  await executeQuery(`
    UPDATE app_angles SET product_id = $1, updated_at = NOW()
    WHERE product_id = $2 AND deleted_at IS NULL
  `, [targetProductId, sourceProductId]);
}

/**
 * Move all messages from one angle to another.
 */
export async function moveMessagesToAngle(sourceAngleId: string, targetAngleId: string): Promise<void> {
  await executeQuery(`
    UPDATE app_messages SET angle_id = $1, updated_at = NOW()
    WHERE angle_id = $2 AND deleted_at IS NULL
  `, [targetAngleId, sourceAngleId]);
}

/**
 * Move all assets and creatives from one message to another.
 */
export async function moveChildrenToMessage(sourceMessageId: string, targetMessageId: string): Promise<void> {
  await executeQuery(`
    UPDATE app_assets SET message_id = $1, updated_at = NOW()
    WHERE message_id = $2 AND deleted_at IS NULL
  `, [targetMessageId, sourceMessageId]);

  await executeQuery(`
    UPDATE app_creatives SET message_id = $1, updated_at = NOW()
    WHERE message_id = $2 AND deleted_at IS NULL
  `, [targetMessageId, sourceMessageId]);
}

// ============================================================================
// Cascade Restore
// ============================================================================

/**
 * Restore a soft-deleted product and ALL its descendants.
 * Clears deleted_at for product, its angles, their messages, and their assets/creatives.
 */
export async function cascadeRestoreProduct(id: string): Promise<void> {
  // 1. Restore the product
  await executeQuery(`
    UPDATE app_products SET deleted_at = NULL, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NOT NULL
  `, [id]);

  // 2. Restore angles of this product
  await executeQuery(`
    UPDATE app_angles SET deleted_at = NULL, updated_at = NOW()
    WHERE product_id = $1 AND deleted_at IS NOT NULL
  `, [id]);

  // 3. Restore messages of angles of this product
  await executeQuery(`
    UPDATE app_messages SET deleted_at = NULL, updated_at = NOW()
    WHERE angle_id IN (
      SELECT id FROM app_angles WHERE product_id = $1
    ) AND deleted_at IS NOT NULL
  `, [id]);

  // 4. Restore assets of messages of angles of this product
  await executeQuery(`
    UPDATE app_assets SET deleted_at = NULL, updated_at = NOW()
    WHERE message_id IN (
      SELECT m.id FROM app_messages m
      JOIN app_angles a ON a.id = m.angle_id
      WHERE a.product_id = $1
    ) AND deleted_at IS NOT NULL
  `, [id]);

  // 5. Restore creatives of messages of angles of this product
  await executeQuery(`
    UPDATE app_creatives SET deleted_at = NULL, updated_at = NOW()
    WHERE message_id IN (
      SELECT m.id FROM app_messages m
      JOIN app_angles a ON a.id = m.angle_id
      WHERE a.product_id = $1
    ) AND deleted_at IS NOT NULL
  `, [id]);
}

/**
 * Find a deleted product by name (for restore operations).
 */
export async function findDeletedProductByName(name: string): Promise<{ id: string; name: string } | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, name FROM app_products
    WHERE name ILIKE $1 AND deleted_at IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1
  `, [name]);

  if (rows.length === 0) return null;
  return { id: rows[0].id as string, name: rows[0].name as string };
}
