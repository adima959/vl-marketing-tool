'use client';

import { useState, lazy, Suspense } from 'react';
import { App, Table, Button, Tag } from 'antd';
import { EditOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { Product, TrackerUser } from '@/types/marketing-tracker';
import type { ColumnsType } from 'antd/es/table';
import styles from '@/styles/components/settings.module.css';
import stickyStyles from '@/styles/tables/sticky.module.css';

const ProductDialog = lazy(() =>
  import('@/components/settings/ProductDialog').then((mod) => ({ default: mod.ProductDialog }))
);

interface ProductsClientTableProps {
  products: Product[];
  users: TrackerUser[];
}

export function ProductsClientTable({ products, users }: ProductsClientTableProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      router.refresh();
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (record: Product) => {
    setSelectedProduct(record);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedProduct(null);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedProduct(null);
  };

  const handleDialogSuccess = () => {
    router.refresh();
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: Product) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {record.color && (
            <span className={styles.colorDot} style={{ backgroundColor: record.color }} />
          )}
          <div>
            <div className={styles.cellPrimary}>{name}</div>
            {record.sku && <div className={styles.cellMono}>{record.sku}</div>}
          </div>
        </div>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 300,
      ellipsis: true,
      render: (desc: string) => {
        const plain = desc ? desc.replace(/<[^>]*>/g, '') : '';
        return (
          <span className={styles.cellSecondary}>
            {plain || '\u2014'}
          </span>
        );
      },
    },
    {
      title: 'Product owner',
      key: 'owner',
      width: 160,
      render: (_: unknown, record: Product) => (
        <span className={styles.cellPrimary} style={{ fontWeight: 400 }}>
          {record.owner?.name || '\u2014'}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag
          color={status === 'active' ? 'green' : undefined}
          className={styles.tag}
        >
          {status}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      align: 'right' as const,
      render: (_: unknown, record: Product) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
          className={styles.rowAction}
        />
      ),
    },
  ];

  return (
    <>
      <div className={styles.page}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionInfo}>
            <h2 className={styles.sectionTitle}>Products</h2>
            <p className={styles.sectionSubtitle}>
              {products.length > 0 ? `${products.length} product${products.length !== 1 ? 's' : ''}` : 'Manage products and their details'}
            </p>
          </div>
          <div className={styles.sectionActions}>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              size="small"
            >
              Add product
            </Button>
          </div>
        </div>

        <div className={`${styles.tableCard} ${stickyStyles.stickyTable}`}>
          <Table
            columns={columns}
            dataSource={products}
            loading={loading}
            rowKey="id"
            size="small"
            sticky={{ offsetHeader: 0 }}
            pagination={{
              pageSize: 20,
              showTotal: (total) => (
                <span className={styles.cellDate}>{total} total</span>
              ),
              size: 'small',
            }}
          />
        </div>
      </div>

      <Suspense fallback={null}>
        <ProductDialog
          product={selectedProduct}
          users={users}
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      </Suspense>
    </>
  );
}
