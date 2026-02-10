import { Pool } from '@neondatabase/serverless';
import { validateRequest } from '@/lib/auth';
import { getUserByExternalId } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { UsersClientTable } from '@/components/settings/UsersClientTable';
import styles from '@/styles/components/settings.module.css';
import { cookies } from 'next/headers';

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

async function checkAuth(): Promise<{ isAuthenticated: boolean; isAdmin: boolean }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token');

  if (!token) {
    return { isAuthenticated: false, isAdmin: false };
  }

  const { valid, user: crmUser } = await validateRequest({
    headers: new Headers({ cookie: `auth_token=${token.value}` })
  } as any);

  if (!valid || !crmUser) {
    return { isAuthenticated: false, isAdmin: false };
  }

  const user = await getUserByExternalId(crmUser.id);
  return {
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin'
  };
}

export default async function UsersPage() {
  const { isAuthenticated, isAdmin } = await checkAuth();

  if (!isAuthenticated) {
    return <div className={styles.authMessage}>Please log in to access this page.</div>;
  }

  if (!isAdmin) {
    return <div className={styles.authMessage}>You do not have permission to view this page.</div>;
  }

  const users = await getUsers();

  return <UsersClientTable users={users} />;
}
