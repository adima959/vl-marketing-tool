// Marketing Tracker History Service
// Application-level audit logging for field-level changes
// Uses PostgreSQL (Neon) - placeholders: $1, $2, $3

import { executeQuery } from '@/lib/server/db';
import type { EntityType, ActivityAction } from '@/types/marketing-tracker';

// ============================================================================
// Types
// ============================================================================

export type HistoryAction = ActivityAction; // 'created' | 'updated' | 'deleted'

/**
 * A single history entry to be recorded
 */
export interface HistoryEntry {
  entityType: EntityType;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  action: HistoryAction;
  changedBy: string;
}

/**
 * A history record as stored in the database and returned by queries
 */
export interface HistoryRecord {
  id: string;
  entityType: EntityType;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  action: HistoryAction;
  changedBy: string;
  changedAt: string;
}

// Fields to skip when generating diff (system-managed fields)
const SKIP_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts snake_case database row keys to camelCase TypeScript object keys
 */
function toCamelCase<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }

  return result as T;
}

/**
 * Deep equality check for comparing field values
 * Handles arrays, objects, and primitives
 */
function deepEqual(a: unknown, b: unknown): boolean {
  // Handle null/undefined
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  // Handle different types
  if (typeof a !== typeof b) return false;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
  }

  // Primitives
  return a === b;
}

/**
 * Normalizes a value for comparison and storage
 * - Converts empty strings to null
 * - Handles Date objects
 */
function normalizeValue(value: unknown): unknown {
  if (value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Records one or more history entries using batch insert
 * @param entries Array of history entries to record
 */
export async function recordHistory(entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) return;

  // Build batch insert query
  const valuePlaceholders: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const entry of entries) {
    valuePlaceholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    values.push(
      entry.entityType,
      entry.entityId,
      entry.fieldName,
      JSON.stringify(entry.oldValue),
      JSON.stringify(entry.newValue),
      entry.action,
      entry.changedBy
    );
  }

  const query = `
    INSERT INTO app_entity_history (
      entity_type,
      entity_id,
      field_name,
      old_value,
      new_value,
      action,
      changed_by
    )
    VALUES ${valuePlaceholders.join(', ')}
  `;

  await executeQuery(query, values);
}

/**
 * Compares two objects and generates history entries for changed fields
 *
 * Behavior by action:
 * - 'created': Records all fields with null oldValue
 * - 'updated': Records only fields that changed
 * - 'deleted': Records single entry with field_name='_deleted' and entity snapshot
 *
 * @param oldObj The previous state (null for created)
 * @param newObj The new state
 * @param entityType The type of entity
 * @param entityId The entity's ID
 * @param changedBy The user ID who made the change
 * @param action The type of action
 * @returns Array of history entries to record
 */
export function diffObjects<T extends Record<string, unknown>>(
  oldObj: T | null,
  newObj: T,
  entityType: EntityType,
  entityId: string,
  changedBy: string,
  action: HistoryAction
): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  if (action === 'created') {
    // Record all fields with null oldValue
    for (const [key, value] of Object.entries(newObj)) {
      if (SKIP_FIELDS.has(key)) continue;

      const normalizedValue = normalizeValue(value);
      // Skip null/undefined values for created - no point recording "field set to null"
      if (normalizedValue === null || normalizedValue === undefined) continue;

      entries.push({
        entityType,
        entityId,
        fieldName: key,
        oldValue: null,
        newValue: normalizedValue,
        action,
        changedBy,
      });
    }
  } else if (action === 'updated') {
    // Record only changed fields
    if (!oldObj) {
      console.warn('diffObjects called with action=updated but oldObj is null');
      return entries;
    }

    for (const [key, newValue] of Object.entries(newObj)) {
      if (SKIP_FIELDS.has(key)) continue;

      const oldValue = oldObj[key];
      const normalizedOld = normalizeValue(oldValue);
      const normalizedNew = normalizeValue(newValue);

      if (!deepEqual(normalizedOld, normalizedNew)) {
        entries.push({
          entityType,
          entityId,
          fieldName: key,
          oldValue: normalizedOld,
          newValue: normalizedNew,
          action,
          changedBy,
        });
      }
    }
  } else if (action === 'deleted') {
    // Record single entry with entity snapshot
    // Use oldObj if provided, otherwise use newObj as the snapshot
    const snapshot = oldObj || newObj;

    // Remove system fields from snapshot
    const cleanSnapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(snapshot)) {
      if (!SKIP_FIELDS.has(key)) {
        cleanSnapshot[key] = normalizeValue(value);
      }
    }

    entries.push({
      entityType,
      entityId,
      fieldName: '_deleted',
      oldValue: cleanSnapshot,
      newValue: null,
      action,
      changedBy,
    });
  }

  return entries;
}

/**
 * Get the history for a specific entity
 * @param entityType The type of entity
 * @param entityId The entity's ID
 * @returns Array of history records, newest first
 */
export async function getEntityHistory(
  entityType: EntityType,
  entityId: string
): Promise<HistoryRecord[]> {
  const query = `
    SELECT
      id,
      entity_type,
      entity_id,
      field_name,
      old_value,
      new_value,
      action,
      changed_by,
      changed_at
    FROM app_entity_history
    WHERE entity_type = $1 AND entity_id = $2
    ORDER BY changed_at DESC
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [entityType, entityId]);

  return rows.map(row => {
    const record = toCamelCase<HistoryRecord>(row);
    // Parse JSONB values
    if (typeof record.oldValue === 'string') {
      try {
        record.oldValue = JSON.parse(record.oldValue);
      } catch {
        // Keep as string if not valid JSON
      }
    }
    if (typeof record.newValue === 'string') {
      try {
        record.newValue = JSON.parse(record.newValue);
      } catch {
        // Keep as string if not valid JSON
      }
    }
    return record;
  });
}

/**
 * Get recent history across all entities (for activity feed)
 * @param limit Maximum number of records to return
 * @returns Array of history records, newest first
 */
export async function getRecentHistory(limit: number = 50): Promise<HistoryRecord[]> {
  const query = `
    SELECT
      id,
      entity_type,
      entity_id,
      field_name,
      old_value,
      new_value,
      action,
      changed_by,
      changed_at
    FROM app_entity_history
    ORDER BY changed_at DESC
    LIMIT $1
  `;

  const rows = await executeQuery<Record<string, unknown>>(query, [limit]);

  return rows.map(row => {
    const record = toCamelCase<HistoryRecord>(row);
    // Parse JSONB values
    if (typeof record.oldValue === 'string') {
      try {
        record.oldValue = JSON.parse(record.oldValue);
      } catch {
        // Keep as string if not valid JSON
      }
    }
    if (typeof record.newValue === 'string') {
      try {
        record.newValue = JSON.parse(record.newValue);
      } catch {
        // Keep as string if not valid JSON
      }
    }
    return record;
  });
}

/**
 * Convenience function to record a single field change
 * Useful for simple inline updates
 */
export async function recordFieldChange(
  entityType: EntityType,
  entityId: string,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  changedBy: string
): Promise<void> {
  await recordHistory([
    {
      entityType,
      entityId,
      fieldName,
      oldValue: normalizeValue(oldValue),
      newValue: normalizeValue(newValue),
      action: 'updated',
      changedBy,
    },
  ]);
}

/**
 * Record entity creation with all initial field values
 */
export async function recordCreation<T extends Record<string, unknown>>(
  entityType: EntityType,
  entityId: string,
  entity: T,
  changedBy: string
): Promise<void> {
  const entries = diffObjects(null, entity, entityType, entityId, changedBy, 'created');
  await recordHistory(entries);
}

/**
 * Record entity update with before/after comparison
 */
export async function recordUpdate<T extends Record<string, unknown>>(
  entityType: EntityType,
  entityId: string,
  oldEntity: T,
  newEntity: T,
  changedBy: string
): Promise<void> {
  const entries = diffObjects(oldEntity, newEntity, entityType, entityId, changedBy, 'updated');
  if (entries.length > 0) {
    await recordHistory(entries);
  }
}

/**
 * Record entity deletion with final state snapshot
 */
export async function recordDeletion<T extends Record<string, unknown>>(
  entityType: EntityType,
  entityId: string,
  entity: T,
  changedBy: string
): Promise<void> {
  const entries = diffObjects(entity, entity, entityType, entityId, changedBy, 'deleted');
  await recordHistory(entries);
}
