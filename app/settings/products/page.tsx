'use client';

import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import { ProductsClientTable } from '@/components/settings/ProductsClientTable';
import type { Product } from '@/types';
import type { TrackerUser } from '@/types/marketing-tracker';
import styles from '@/styles/components/settings.module.css';
import { checkAuthError } from '@/lib/api/errorHandler';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<TrackerUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsRes, usersRes] = await Promise.all([
          fetch('/api/marketing-tracker/products'),
          fetch('/api/marketing-tracker/users'),
        ]);

        checkAuthError(productsRes);
        checkAuthError(usersRes);

        const [productsData, usersData] = await Promise.all([
          productsRes.json(),
          usersRes.json(),
        ]);

        setProducts(productsData.data || []);
        setUsers(usersData.data || []);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <SettingsPageWrapper>
      {loading ? (
        <div className={styles.centeredState}>
          <Spin size="small" />
        </div>
      ) : (
        <ProductsClientTable products={products} users={users} />
      )}
    </SettingsPageWrapper>
  );
}
