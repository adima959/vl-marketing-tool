'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Spin, Empty, Button, Table } from 'antd';
import { PlusOutlined, UserOutlined, CalendarOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, ProductStatusBadge, AngleModal, DeleteConfirmModal } from '@/components/marketing-tracker';
import { EditableField } from '@/components/ui/EditableField';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { RichEditableField } from '@/components/ui/RichEditableField';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import type { ColumnsType } from 'antd/es/table';
import type { Angle } from '@/types';
import styles from './page.module.css';

interface AngleRow {
  key: string;
  id: string;
  name: string;
  description?: string;
  status: Angle['status'];
  messageCount: number;
}

export default function ProductPage() {
  const [angleModalOpen, setAngleModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AngleRow | null>(null);

  const {
    currentProduct,
    angles,
    users,
    isLoading,
    loadProduct,
    updateAngleStatus,
    updateProductField,
  } = useMarketingTrackerStore();

  // Transform users for select options
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.name,
  }));

  const params = useParams<{ productId: string }>();
  const productId = params.productId;

  useEffect(() => {
    if (productId) {
      loadProduct(productId);
    }
  }, [productId, loadProduct]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Transform angles for table
  const tableData: AngleRow[] = angles.map((angle) => ({
    key: angle.id,
    id: angle.id,
    name: angle.name,
    description: angle.description,
    status: angle.status,
    messageCount: angle.messageCount || 0,
  }));

  const columns: ColumnsType<AngleRow> = [
    {
      title: 'ANGLE NAME',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: AngleRow) => {
        // Strip HTML tags from description for plain text display
        const plainDescription = record.description?.replace(/<[^>]*>/g, '') || '';
        return (
          <Link href={`/marketing-tracker/angle/${record.id}`} className={styles.angleLink}>
            <div className={styles.angleNameCell}>
              <span className={styles.angleName}>{name}</span>
              {plainDescription && (
                <span className={styles.angleDescription}>{plainDescription}</span>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: Angle['status'], record: AngleRow) => (
        <StatusBadge
          status={status}
          variant="dot"
          editable
          onChange={(newStatus) => updateAngleStatus(record.id, newStatus)}
        />
      ),
    },
    {
      title: 'MESSAGES',
      dataIndex: 'messageCount',
      key: 'messages',
      width: 100,
      align: 'center',
      render: (count: number) => (
        <span className={styles.countBadge}>{count}</span>
      ),
    },
    {
      title: '',
      key: 'delete',
      width: 40,
      render: (_: unknown, record: AngleRow) => (
        <button
          className={styles.deleteButton}
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(record); }}
          title="Delete angle"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  if (isLoading && !currentProduct) {
    return (
      <>
        <PageHeader title="Loading..." icon={<Target className="h-5 w-5" />} />
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (!currentProduct) {
    return (
      <>
        <PageHeader title="Product Not Found" icon={<Target className="h-5 w-5" />} />
        <div className={styles.container}>
          <Empty description="Product not found" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={currentProduct.name}
        icon={<Target className="h-5 w-5" />}
      />
      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/marketing-tracker" className={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <ChevronRight size={14} />
          <span className={styles.breadcrumbCurrent}>{currentProduct.name}</span>
        </div>

        {/* Product Info Card */}
        <div className={styles.productCard}>
          <div className={styles.productInfo}>
            <div className={styles.productTitleRow}>
              <EditableField
                value={currentProduct.name}
                onChange={(value) => updateProductField(currentProduct.id, 'name', value)}
                placeholder="Product name"
              />
            </div>
            <div className={styles.productDescriptionRow}>
              <RichEditableField
                value={currentProduct.description || ''}
                onChange={(value) => updateProductField(currentProduct.id, 'description', value)}
                placeholder="Add a description, notes, pricing info..."
              />
            </div>
            <div className={styles.productMeta}>
              <span className={`${styles.metaItem} ${styles.ownerMeta}`}>
                <UserOutlined /> Owner:{' '}
                <EditableSelect
                  value={currentProduct.ownerId ?? undefined}
                  options={userOptions}
                  onChange={(value) => updateProductField(currentProduct.id, 'ownerId', value)}
                  placeholder="Select owner"
                  displayLabel={currentProduct.owner?.name}
                />
              </span>
              <span className={styles.metaItem}>
                Status:{' '}
                <ProductStatusBadge
                  status={currentProduct.status}
                  editable
                  onChange={(newStatus) => updateProductField(currentProduct.id, 'status', newStatus)}
                />
              </span>
              <span className={styles.metaItem}>
                <CalendarOutlined /> Created: <strong>{formatDate(currentProduct.createdAt)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Angles Section */}
        <div className={styles.anglesSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <Target size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Angles (Problem Areas)</h2>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAngleModalOpen(true)}>
              New Angle
            </Button>
          </div>

          <AngleModal
            open={angleModalOpen}
            onClose={() => setAngleModalOpen(false)}
            onSuccess={() => loadProduct(productId)}
            productId={productId}
          />

          {angles.length === 0 ? (
            <div className={styles.emptyState}>
              <Empty description="No angles yet" />
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={tableData}
              pagination={false}
              className={styles.anglesTable}
              size="middle"
              rowClassName={styles.tableRow}
            />
          )}
        </div>

        {deleteTarget && (
          <DeleteConfirmModal
            open={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onSuccess={() => loadProduct(productId)}
            entityType="angle"
            entityId={deleteTarget.id}
            entityName={deleteTarget.name}
            childCount={deleteTarget.messageCount}
            childLabel="messages"
            moveTargets={angles
              .filter((a) => a.id !== deleteTarget.id)
              .map((a) => ({ id: a.id, name: a.name }))}
          />
        )}
      </div>
    </>
  );
}
