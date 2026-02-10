import { validateTokenFromDatabase } from '@/lib/auth';
import { getUserByExternalId } from '@/lib/rbac';
import { getProducts } from '@/lib/marketing-tracker/db';
import { Pool } from '@neondatabase/serverless';
import type { Product, TrackerUser } from '@/types/marketing-tracker';
import { ProductsClientTable } from '@/components/settings/ProductsClientTable';
import styles from '@/styles/components/settings.module.css';
import { cookies } from 'next/headers';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getProductOwners(): Promise<TrackerUser[]> {
  const client = await pool.connect();

  try {
    const result = await client.query<{ id: string; name: string; email: string; created_at: string; updated_at: string }>(
      `SELECT id, name, email, created_at, updated_at
       FROM app_users
       WHERE deleted_at IS NULL AND is_product_owner = true
       ORDER BY name ASC`
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } finally {
    client.release();
  }
}

async function checkAuth(): Promise<{ isAuthenticated: boolean }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('crm_auth_token');

  if (!token) {
    return { isAuthenticated: false };
  }

  const { valid, user: crmUser } = await validateTokenFromDatabase(token.value);

  if (!valid || !crmUser) {
    return { isAuthenticated: false };
  }

  const user = await getUserByExternalId(crmUser.id);
  return {
    isAuthenticated: !!user
  };
}

export default async function ProductsPage() {
  const { isAuthenticated } = await checkAuth();

  if (!isAuthenticated) {
    return <div className={styles.authMessage}>Please log in to access this page.</div>;
  }

  const [products, users] = await Promise.all([
    getProducts(),
    getProductOwners()
  ]);

  return <ProductsClientTable products={products} users={users} />;
}
