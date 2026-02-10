import { Pool } from '@neondatabase/serverless';
import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import type { AppUser } from '@/types/user';
import { UsersClientTable } from '@/components/settings/UsersClientTable';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getUsers(): Promise<AppUser[]> {
  const client = await pool.connect();

  try {
    const result = await client.query<AppUser>(
      `SELECT id, external_id, name, email, role, role_id, is_product_owner, created_at, updated_at
       FROM app_users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    return result.rows;
  } finally {
    client.release();
  }
}

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <SettingsPageWrapper requireAdmin>
      <UsersClientTable users={users} />
    </SettingsPageWrapper>
  );
}
