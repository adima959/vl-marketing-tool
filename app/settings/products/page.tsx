import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import { getProducts } from '@/lib/marketing-tracker/db';
import { Pool } from '@neondatabase/serverless';
import type { TrackerUser } from '@/types/marketing-tracker';
import { ProductsClientTable } from '@/components/settings/ProductsClientTable';

export const dynamic = 'force-dynamic';

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

export default async function ProductsPage() {
  const [products, users] = await Promise.all([
    getProducts(),
    getProductOwners()
  ]);

  return (
    <SettingsPageWrapper>
      <ProductsClientTable products={products} users={users} />
    </SettingsPageWrapper>
  );
}
