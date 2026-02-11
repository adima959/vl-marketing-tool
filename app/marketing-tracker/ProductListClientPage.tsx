'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spin, Empty, Button, Table, Avatar, Radio, Alert } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { sanitizeHtml } from '@/lib/sanitize';
import { Target, Package, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProductModal, ProductStatusBadge, ActivityFeed, DeleteConfirmModal } from '@/components/marketing-tracker';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import type { ColumnsType } from 'antd/es/table';
import type { ProductStatus } from '@/types';
import stickyStyles from '@/styles/tables/sticky.module.css';
import styles from './page.module.css';

interface ProductRow {
  key: string;
  id: string;
  name: string;
  description?: string;
  status: ProductStatus;
  ownerId?: string | null;
  ownerName: string;
  ownerInitials: string;
  angleCount: number;
  activeAngleCount: number;
}

export default function ProductListClientPage() {
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const refreshActivity = useCallback(() => setActivityKey((k) => k + 1), []);

  const {
    products,
    users,
    isLoading,
    productStatusFilter,
    loadDashboard,
    setProductStatusFilter,
    getFilteredProducts,
    updateProductField,
  } = useMarketingTrackerStore();

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredProducts = getFilteredProducts();

  // User options for EditableSelect
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.name,
  }));

  // Transform products for table
  const tableData: ProductRow[] = filteredProducts.map((product) => ({
    key: product.id,
    id: product.id,
    name: product.name,
    description: product.description || undefined,
    status: product.status,
    ownerId: product.ownerId,
    ownerName: product.owner?.name || 'Unknown',
    ownerInitials: product.owner?.name?.split(' ').map(n => n[0]).join('') || '?',
    angleCount: product.angleCount || 0,
    activeAngleCount: product.activeAngleCount || 0,
  }));

  const handleStatusChange = async (productId: string, newStatus: ProductStatus) => {
    await updateProductField(productId, 'status', newStatus);
    // Reload to apply filter (product may disappear if switched to inactive while viewing active)
    loadDashboard();
    refreshActivity();
  };

  const handleOwnerChange = async (productId: string, newOwnerId: string) => {
    await updateProductField(productId, 'ownerId', newOwnerId);
    refreshActivity();
  };

  const handleStatusFilterChange = (value: ProductStatus | 'all') => {
    setProductStatusFilter(value);
    // Trigger reload with new filter
    setTimeout(() => loadDashboard(), 0);
  };

  const columns: ColumnsType<ProductRow> = [
    {
      title: 'PRODUCT NAME',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ProductRow) => (
        <Link href={`/marketing-tracker/product/${record.id}`} className={styles.productLink}>
          <div className={styles.productNameCell}>
            <span className={styles.productName}>{name}</span>
            {record.description && (
              <span
                className={styles.productDesc}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.description) }}
              />
            )}
          </div>
        </Link>
      ),
    },
    {
      title: 'OWNER',
      dataIndex: 'ownerName',
      key: 'owner',
      width: 220,
      render: (_: string, record: ProductRow) => (
        <div className={styles.ownerCell} onClick={(e) => e.stopPropagation()}>
          <Avatar size="small" className={styles.ownerAvatar}>
            {record.ownerInitials}
          </Avatar>
          <EditableSelect
            value={record.ownerId ?? undefined}
            options={userOptions}
            onChange={(value) => handleOwnerChange(record.id, value)}
            displayLabel={`${record.ownerName.split(' ')[0]} ${record.ownerName.split(' ')[1]?.[0] || ''}.`}
          />
        </div>
      ),
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ProductStatus, record: ProductRow) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ProductStatusBadge
            status={status}
            editable
            onChange={(newStatus) => handleStatusChange(record.id, newStatus)}
          />
        </div>
      ),
    },
    {
      title: 'ANGLES',
      dataIndex: 'angleCount',
      key: 'angles',
      width: 100,
      align: 'center',
      render: (count: number) => <span className={styles.countCell}>{count}</span>,
    },
    {
      title: 'ACTIVE',
      dataIndex: 'activeAngleCount',
      key: 'active',
      width: 100,
      align: 'center',
      render: (count: number) => (
        <span className={`${styles.countCell} ${styles.activeCount}`}>{count}</span>
      ),
    },
    {
      title: '',
      key: 'delete',
      width: 40,
      render: (_: unknown, record: ProductRow) => (
        <button
          className={styles.deleteButton}
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(record); }}
          title="Delete product"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <>
      <Alert
        message={<span style={{ color: '#d32f2f' }}>This page is still under development — feel free to explore, but nothing here is final.</span>}
        type="warning"
        banner
        showIcon={false}
        style={{ textAlign: 'center' }}
      />
      <PageHeader
        title="Marketing Tracker"
        icon={<Target className="h-5 w-5" />}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setProductModalOpen(true)}>
            New Product
          </Button>
        }
      />

      <ProductModal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        onSuccess={() => { loadDashboard(); refreshActivity(); }}
        users={users}
      />
      <div className={styles.container}>
        <div className={styles.productsSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <Package size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Products</h2>
              <span className={styles.totalBadge}>{filteredProducts.length} Total</span>
            </div>
            <div className={styles.filters}>
              <Radio.Group
                value={productStatusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="active">Active</Radio.Button>
                <Radio.Button value="all">All</Radio.Button>
              </Radio.Group>
            </div>
          </div>

          {isLoading ? (
            <div className={styles.loadingContainer}>
              <Spin size="large" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <Empty
              description={products.length === 0 ? 'No products yet' : 'No products match your filter'}
            />
          ) : (
            <div className={stickyStyles.stickyTable}>
              <Table
                columns={columns}
                dataSource={tableData}
                pagination={false}
                className={styles.productsTable}
                size="middle"
                rowClassName={styles.tableRow}
                tableLayout="fixed"
                sticky={{ offsetHeader: 0 }}
              />
            </div>
          )}
        </div>

        <ActivityFeed refreshKey={activityKey} />
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => { loadDashboard(); refreshActivity(); }}
          entityType="product"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          childCount={deleteTarget.angleCount}
          childLabel="angles"
          moveTargets={filteredProducts
            .filter((p) => p.id !== deleteTarget.id)
            .map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
    </>
  );
}
