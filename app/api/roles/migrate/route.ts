/**
 * Migration API endpoint for Role & Permissions
 * POST /api/roles/migrate
 *
 * Creates app_roles + app_role_permissions tables, seeds starter roles,
 * and migrates existing users' role_id based on their current role enum.
 * Idempotent — safe to run multiple times.
 */

import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { FEATURES } from '@/types/roles';

export async function POST(): Promise<NextResponse> {
  try {
    // Step 1: Create app_roles table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ
      );
    `);

    // Step 2: Create app_role_permissions table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
        feature_key VARCHAR(100) NOT NULL,
        can_view BOOLEAN NOT NULL DEFAULT false,
        can_create BOOLEAN NOT NULL DEFAULT false,
        can_edit BOOLEAN NOT NULL DEFAULT false,
        can_delete BOOLEAN NOT NULL DEFAULT false,
        UNIQUE(role_id, feature_key)
      );
    `);

    // Step 3: Add role_id column to app_users
    await executeQuery(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES app_roles(id);
    `);

    // Step 4: Create indexes
    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON app_role_permissions(role_id);`,
      `CREATE INDEX IF NOT EXISTS idx_role_permissions_feature ON app_role_permissions(feature_key);`,
      `CREATE INDEX IF NOT EXISTS idx_roles_not_deleted ON app_roles(id) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_users_role_id ON app_users(role_id) WHERE deleted_at IS NULL;`,
    ];

    for (const stmt of indexStatements) {
      try {
        await executeQuery(stmt);
      } catch {
        // Ignore index errors (may already exist)
      }
    }

    // Step 5: Seed starter roles (only if no roles exist)
    const roleCount = await executeQuery<{ count: string }>(`
      SELECT COUNT(*)::text as count FROM app_roles WHERE deleted_at IS NULL;
    `);

    if (parseInt(roleCount[0]?.count || '0') === 0) {
      // Create Admin role (system/immutable)
      const adminRows = await executeQuery<{ id: string }>(`
        INSERT INTO app_roles (name, description, is_system)
        VALUES ('Admin', 'Full access to all features. Cannot be modified.', true)
        RETURNING id;
      `);
      const adminRoleId = adminRows[0].id;

      // Create Editor role
      const editorRows = await executeQuery<{ id: string }>(`
        INSERT INTO app_roles (name, description, is_system)
        VALUES ('Editor', 'Can view all reports and manage marketing tools. No admin access.', false)
        RETURNING id;
      `);
      const editorRoleId = editorRows[0].id;

      // Create Viewer role
      const viewerRows = await executeQuery<{ id: string }>(`
        INSERT INTO app_roles (name, description, is_system)
        VALUES ('Viewer', 'Read-only access to reports and tools.', false)
        RETURNING id;
      `);
      const viewerRoleId = viewerRows[0].id;

      // Seed permissions for each role
      const featureKeys = FEATURES.map(f => f.key);

      for (const roleConfig of [
        {
          roleId: adminRoleId,
          getPerms: () => ({ canView: true, canCreate: true, canEdit: true, canDelete: true }),
        },
        {
          roleId: editorRoleId,
          getPerms: (key: string) => {
            if (key.startsWith('admin.')) {
              return { canView: false, canCreate: false, canEdit: false, canDelete: false };
            }
            if (key.startsWith('analytics.')) {
              return { canView: true, canCreate: false, canEdit: false, canDelete: false };
            }
            return { canView: true, canCreate: true, canEdit: true, canDelete: true };
          },
        },
        {
          roleId: viewerRoleId,
          getPerms: (key: string) => {
            if (key.startsWith('admin.')) {
              return { canView: false, canCreate: false, canEdit: false, canDelete: false };
            }
            return { canView: true, canCreate: false, canEdit: false, canDelete: false };
          },
        },
      ]) {
        const valuePlaceholders: string[] = [];
        const values: unknown[] = [roleConfig.roleId];
        let paramIdx = 2;

        for (const key of featureKeys) {
          const perms = roleConfig.getPerms(key);
          valuePlaceholders.push(
            `($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
          );
          values.push(key, perms.canView, perms.canCreate, perms.canEdit, perms.canDelete);
          paramIdx += 5;
        }

        await executeQuery(`
          INSERT INTO app_role_permissions (role_id, feature_key, can_view, can_create, can_edit, can_delete)
          VALUES ${valuePlaceholders.join(', ')}
        `, values);
      }

      // Step 6: Migrate existing users' role_id
      await executeQuery(`
        UPDATE app_users
        SET role_id = $1
        WHERE role = 'admin' AND role_id IS NULL AND deleted_at IS NULL
      `, [adminRoleId]);

      await executeQuery(`
        UPDATE app_users
        SET role_id = $1
        WHERE role = 'user' AND role_id IS NULL AND deleted_at IS NULL
      `, [viewerRoleId]);
    }

    // Step 7: Add is_product_owner column to app_users
    await executeQuery(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_product_owner BOOLEAN NOT NULL DEFAULT false;
    `);

    // Step 8: Verify
    const counts = await executeQuery<{
      roles: string;
      permissions: string;
      users_migrated: string;
      users_unmigrated: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM app_roles WHERE deleted_at IS NULL)::text as roles,
        (SELECT COUNT(*) FROM app_role_permissions)::text as permissions,
        (SELECT COUNT(*) FROM app_users WHERE role_id IS NOT NULL AND deleted_at IS NULL)::text as users_migrated,
        (SELECT COUNT(*) FROM app_users WHERE role_id IS NULL AND deleted_at IS NULL)::text as users_unmigrated
    `);

    return NextResponse.json({
      success: true,
      message: 'Role & Permissions migration completed',
      data: counts[0],
    });

  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check migration status
export async function GET(): Promise<NextResponse> {
  try {
    const counts = await executeQuery<{
      roles: string;
      permissions: string;
      users_migrated: string;
      users_unmigrated: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM app_roles WHERE deleted_at IS NULL)::text as roles,
        (SELECT COUNT(*) FROM app_role_permissions)::text as permissions,
        (SELECT COUNT(*) FROM app_users WHERE role_id IS NOT NULL AND deleted_at IS NULL)::text as users_migrated,
        (SELECT COUNT(*) FROM app_users WHERE role_id IS NULL AND deleted_at IS NULL)::text as users_unmigrated
    `);

    return NextResponse.json({
      success: true,
      data: counts[0],
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Tables may not exist yet. Run POST to migrate.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
