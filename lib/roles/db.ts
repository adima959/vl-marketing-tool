// Role & Permissions Database Query Helpers
// Uses PostgreSQL (Neon) - placeholders: $1, $2, $3

import { executeQuery } from '@/lib/server/db';
import { FEATURES } from '@/types/roles';
import type {
  Role,
  RolePermission,
  RoleWithPermissions,
  CreateRoleRequest,
  UpdateRoleRequest,
  UpdatePermissionsRequest,
} from '@/types/roles';

// ============================================================================
// Helper Functions
// ============================================================================

function toCamelCase<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

function rowsToCamelCase<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map(row => toCamelCase<T>(row));
}

// ============================================================================
// Roles
// ============================================================================

/**
 * Get all roles with user counts, ordered: system roles first, then alphabetical
 */
export async function getRoles(): Promise<Role[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT
      r.id,
      r.name,
      r.description,
      r.is_system,
      r.created_at,
      r.updated_at,
      (SELECT COUNT(*)::int FROM app_users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count
    FROM app_roles r
    WHERE r.deleted_at IS NULL
    ORDER BY r.is_system DESC, r.name ASC
  `);

  return rowsToCamelCase<Role>(rows);
}

/**
 * Get a single role by ID
 */
export async function getRoleById(id: string): Promise<Role | null> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT
      r.id,
      r.name,
      r.description,
      r.is_system,
      r.created_at,
      r.updated_at,
      (SELECT COUNT(*)::int FROM app_users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count
    FROM app_roles r
    WHERE r.id = $1 AND r.deleted_at IS NULL
  `, [id]);

  if (rows.length === 0) return null;
  return toCamelCase<Role>(rows[0]);
}

/**
 * Get a role with all its permissions
 */
export async function getRoleWithPermissions(id: string): Promise<RoleWithPermissions | null> {
  const role = await getRoleById(id);
  if (!role) return null;

  const permissions = await getPermissionsByRoleId(id);
  return { ...role, permissions };
}

/**
 * Create a new role. Optionally clone permissions from an existing role.
 */
export async function createRole(data: CreateRoleRequest): Promise<Role> {
  const rows = await executeQuery<Record<string, unknown>>(`
    INSERT INTO app_roles (name, description)
    VALUES ($1, $2)
    RETURNING id, name, description, is_system, created_at, updated_at
  `, [data.name, data.description || null]);

  const role = toCamelCase<Role>(rows[0]);

  if (data.cloneFromRoleId) {
    // Copy permissions from source role
    await executeQuery(`
      INSERT INTO app_role_permissions (role_id, feature_key, can_view, can_create, can_edit, can_delete)
      SELECT $1, feature_key, can_view, can_create, can_edit, can_delete
      FROM app_role_permissions
      WHERE role_id = $2
    `, [role.id, data.cloneFromRoleId]);
  } else {
    // Insert all features with false permissions
    const featureKeys = FEATURES.map(f => f.key);
    if (featureKeys.length > 0) {
      const valuePlaceholders: string[] = [];
      const values: unknown[] = [role.id];
      let paramIdx = 2;

      for (const key of featureKeys) {
        valuePlaceholders.push(`($1, $${paramIdx}, false, false, false, false)`);
        values.push(key);
        paramIdx++;
      }

      await executeQuery(`
        INSERT INTO app_role_permissions (role_id, feature_key, can_view, can_create, can_edit, can_delete)
        VALUES ${valuePlaceholders.join(', ')}
      `, values);
    }
  }

  return { ...role, userCount: 0 };
}

/**
 * Update a role's name/description. Blocks system roles.
 */
export async function updateRole(id: string, data: UpdateRoleRequest): Promise<Role> {
  // Guard: system roles cannot be updated
  const existing = await getRoleById(id);
  if (!existing) throw new Error('Role not found');
  if (existing.isSystem) throw new Error('System roles cannot be modified');

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }

  if (setClauses.length === 0) {
    return existing;
  }

  setClauses.push('updated_at = NOW()');
  values.push(id);

  const rows = await executeQuery<Record<string, unknown>>(`
    UPDATE app_roles
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND deleted_at IS NULL
    RETURNING id, name, description, is_system, created_at, updated_at
  `, values);

  if (rows.length === 0) throw new Error('Role not found');
  return toCamelCase<Role>(rows[0]);
}

/**
 * Soft delete a role. Blocks system roles and roles with assigned users.
 */
export async function deleteRole(id: string): Promise<void> {
  const existing = await getRoleById(id);
  if (!existing) throw new Error('Role not found');
  if (existing.isSystem) throw new Error('System roles cannot be deleted');
  if (existing.userCount && existing.userCount > 0) {
    throw new Error(`Cannot delete role with ${existing.userCount} assigned user(s). Reassign them first.`);
  }

  await executeQuery(`
    UPDATE app_roles SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL
  `, [id]);
}

// ============================================================================
// Permissions
// ============================================================================

/**
 * Get all permissions for a role
 */
export async function getPermissionsByRoleId(roleId: string): Promise<RolePermission[]> {
  const rows = await executeQuery<Record<string, unknown>>(`
    SELECT id, role_id, feature_key, can_view, can_create, can_edit, can_delete
    FROM app_role_permissions
    WHERE role_id = $1
  `, [roleId]);

  return rowsToCamelCase<RolePermission>(rows);
}

/**
 * Replace all permissions for a role. Blocks system roles.
 * Uses DELETE + INSERT (10 rows max, acceptable without transactions for Phase 1).
 */
export async function updatePermissions(
  roleId: string,
  permissions: UpdatePermissionsRequest['permissions']
): Promise<RolePermission[]> {
  // Guard: system roles cannot be updated
  const role = await getRoleById(roleId);
  if (!role) throw new Error('Role not found');
  if (role.isSystem) throw new Error('System role permissions cannot be modified');

  // Delete existing permissions
  await executeQuery(`DELETE FROM app_role_permissions WHERE role_id = $1`, [roleId]);

  // Insert new permissions
  if (permissions.length > 0) {
    const valuePlaceholders: string[] = [];
    const values: unknown[] = [roleId];
    let paramIdx = 2;

    for (const p of permissions) {
      valuePlaceholders.push(
        `($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
      );
      values.push(p.featureKey, p.canView, p.canCreate, p.canEdit, p.canDelete);
      paramIdx += 5;
    }

    await executeQuery(`
      INSERT INTO app_role_permissions (role_id, feature_key, can_view, can_create, can_edit, can_delete)
      VALUES ${valuePlaceholders.join(', ')}
    `, values);
  }

  return getPermissionsByRoleId(roleId);
}
