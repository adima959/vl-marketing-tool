'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { App, Table, Button, Tag, Spin } from 'antd';
import { EditOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import type { Product, TrackerUser } from '@/types/marketing-tracker';
import type { ColumnsType } from 'antd/es/table';

const ProductDialog = lazy(() =>
  import('@/components/settings/ProductDialog').then((mod) => ({ default: mod.ProductDialog }))
);

export default function ProductsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { message } = App.useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<TrackerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/marketing-tracker/products', {
        credentials: 'same-origin',
      });

      if (!response.ok) throw new Error('Failed to fetch products');

      const data = await response.json();
      setProducts(data.data || []);
    } catch {
      message.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', {
        credentials: 'same-origin',
      });

      if (!response.ok) return;

      const data = await response.json();
      setUsers(
        (data.users || [])
          .filter((u: { is_product_owner?: boolean }) => u.is_product_owner)
          .map((u: { id: string; name: string; email: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          }))
      );
    } catch {
      // Users list is best-effort for the owner dropdown
    }
  };

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchProducts();
      fetchUsers();
    }
  }, [isAuthenticated, authLoading]);

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
    fetchProducts();
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: Product) => (
        <div>
          <div className="text-[13px] font-medium text-[var(--color-gray-900)]">{name}</div>
          {record.sku && (
            <div className="text-[12px] font-mono text-[var(--color-gray-500)]">{record.sku}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => {
        const plain = desc ? desc.replace(/<[^>]*>/g, '') : '';
        return (
          <span className="text-[12px] text-[var(--color-gray-600)]">
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
        <span className="text-[13px] text-[var(--color-gray-700)]">
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
          style={{
            fontSize: 11,
            lineHeight: '18px',
            padding: '0 6px',
            borderRadius: 4,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.025em',
          }}
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
          className="text-[var(--color-gray-400)] hover:text-[var(--color-gray-700)]"
        />
      ),
    },
  ];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spin size="small" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 text-[13px] text-[var(--color-gray-500)]">
        Please log in to access this page.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--color-gray-900)]">Products</h2>
          <p className="text-[12px] text-[var(--color-gray-500)] mt-0.5">
            {products.length > 0 ? `${products.length} product${products.length !== 1 ? 's' : ''}` : 'Manage products and their details'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchProducts}
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

      <div className="rounded-md border border-[var(--color-border-light)] bg-white overflow-hidden">
        <Table
          columns={columns}
          dataSource={products}
          loading={loading}
          rowKey="id"
          size="small"
          pagination={{
            pageSize: 20,
            showTotal: (total) => (
              <span className="text-[12px] text-[var(--color-gray-500)]">
                {total} total
              </span>
            ),
            size: 'small',
          }}
        />
      </div>

      <Suspense fallback={<Spin />}>
        <ProductDialog
          product={selectedProduct}
          users={users}
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      </Suspense>
    </div>
  );
}
