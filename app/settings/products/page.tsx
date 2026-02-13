'use client';

import { useState, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import { ProductsClientTable } from '@/components/settings/ProductsClientTable';
import { AccessDenied } from '@/components/AccessDenied';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';
import type { TrackerUser } from '@/types/marketing-tracker';
import styles from '@/styles/components/settings.module.css';
import { checkAuthError } from '@/lib/api/errorHandler';

export default function ProductsPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<TrackerUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (authLoading) {
    return <div className={styles.centeredState}><Spin size="small" /></div>;
  }

  if (!hasPermission('admin.product_settings', 'can_view')) {
    return <AccessDenied feature="Product Settings" />;
  }

  return (
    <SettingsPageWrapper>
      {loading ? (
        <div className={styles.centeredState}>
          <Spin size="small" />
        </div>
      ) : (
        <ProductsClientTable products={products} users={users} onRefresh={fetchData} />
      )}
    </SettingsPageWrapper>
  );
}
