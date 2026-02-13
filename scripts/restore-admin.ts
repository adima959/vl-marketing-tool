/**
 * Restore a user to admin role by email.
 *
 * Usage: npx tsx scripts/restore-admin.ts arifagic@gmail.com
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/restore-admin.ts <email>');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

const FIND_ADMIN_ROLE_SQL = `
  SELECT id FROM app_roles
  WHERE name = 'Admin' AND is_system = true AND deleted_at IS NULL
  LIMIT 1
`;

const UPDATE_USER_SQL = `
  UPDATE app_users
  SET role = 'admin', role_id = $1, updated_at = NOW()
  WHERE email = $2 AND deleted_at IS NULL
  RETURNING id, name, email, role, role_id
`;

async function restore(): Promise<void> {
  const { rows: adminRoles } = await pool.query(FIND_ADMIN_ROLE_SQL);

  if (adminRoles.length === 0) {
    console.error('Admin role not found. Run the migration first.');
    await pool.end();
    process.exit(1);
  }

  const adminRoleId = adminRoles[0].id;
  const { rows: updated } = await pool.query(UPDATE_USER_SQL, [adminRoleId, email]);

  if (updated.length === 0) {
    console.error('No active user found with email: ' + email);
  } else {
    const u = updated[0];
    console.log('Restored to admin:');
    console.log('  Name: ' + u.name);
    console.log('  Email: ' + u.email);
    console.log('  Role: ' + u.role);
    console.log('  Role ID: ' + u.role_id);
  }

  await pool.end();
}

restore().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
