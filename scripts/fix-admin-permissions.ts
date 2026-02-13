/**
 * One-time fix: Upsert all feature keys for system roles (Admin)
 * with full permissions (can_view, can_create, can_edit, can_delete = true).
 *
 * This fixes missing permission rows (e.g. admin.data_maps) that were
 * added to FEATURES after the initial migration seed ran.
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

const FEATURE_KEYS = [
  'analytics.dashboard',
  'analytics.marketing_report',
  'analytics.on_page_analysis',
  'analytics.validation_reports',
  'tools.marketing_tracker',
  'tools.marketing_pipeline',
  'shared.saved_views',
  'admin.user_management',
  'admin.product_settings',
  'admin.data_maps',
  'admin.role_permissions',
];

const UPSERT_SQL = `
  INSERT INTO app_role_permissions (role_id, feature_key, can_view, can_create, can_edit, can_delete)
  VALUES ($1, $2, true, true, true, true)
  ON CONFLICT (role_id, feature_key) DO UPDATE SET
    can_view = true, can_create = true, can_edit = true, can_delete = true
`;

const VERIFY_SQL = `
  SELECT r.name, COUNT(rp.id) as perm_count
  FROM app_roles r
  LEFT JOIN app_role_permissions rp ON rp.role_id = r.id
  WHERE r.is_system = true AND r.deleted_at IS NULL
  GROUP BY r.name
`;

async function fix(): Promise<void> {
  const { rows: systemRoles } = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM app_roles WHERE is_system = true AND deleted_at IS NULL'
  );

  if (systemRoles.length === 0) {
    console.log('No system roles found. Run the migration first.');
    return;
  }

  for (const role of systemRoles) {
    console.log('Reconciling permissions for system role: ' + role.name);

    let upserted = 0;
    for (const key of FEATURE_KEYS) {
      await pool.query(UPSERT_SQL, [role.id, key]);
      upserted++;
    }

    console.log('  Upserted ' + String(upserted) + ' permission rows');
  }

  const { rows: verify } = await pool.query(VERIFY_SQL);

  console.log('\nVerification:');
  for (const row of verify) {
    console.log('  ' + row.name + ': ' + row.perm_count + ' permission rows');
  }

  await pool.end();
  console.log('\nDone.');
}

fix().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
