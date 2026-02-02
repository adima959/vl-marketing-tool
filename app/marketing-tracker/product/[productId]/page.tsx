'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Spin, Empty, Button, Table } from 'antd';
import { PlusOutlined, EditOutlined, UserOutlined, CalendarOutlined } from '@ant-design/icons';
import { Target, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, AngleModal } from '@/components/marketing-tracker';
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

  const {
    currentProduct,
    angles,
    isLoading,
    loadProduct,
    updateAngleStatus,
  } = useMarketingTrackerStore();

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
      render: (name: string, record: AngleRow) => (
        <Link href={`/marketing-tracker/angle/${record.id}`} className={styles.angleLink}>
          <div className={styles.angleNameCell}>
            <span className={styles.angleName}>{name}</span>
            {record.description && (
              <span className={styles.angleDescription}>{record.description}</span>
            )}
          </div>
        </Link>
      ),
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
      key: 'action',
      width: 40,
      render: (_: unknown, record: AngleRow) => (
        <Link href={`/marketing-tracker/angle/${record.id}`}>
          <ChevronRight size={16} className={styles.rowChevron} />
        </Link>
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
          <div className={styles.productHeader}>
            <div className={styles.productInfo}>
              <h1 className={styles.productTitle}>{currentProduct.name}</h1>
              {currentProduct.description && (
                <div
                  className={styles.productDescription}
                  dangerouslySetInnerHTML={{
                    __html: currentProduct.description
                  }}
                />
              )}
              {currentProduct.notes && (
                <p className={styles.productNotes}>{currentProduct.notes}</p>
              )}
              <div className={styles.productMeta}>
                <span className={styles.metaItem}>
                  <UserOutlined /> Owner: <strong>{currentProduct.owner?.name}</strong>
                </span>
                <span className={styles.metaItem}>
                  <CalendarOutlined /> Created: <strong>{formatDate(currentProduct.createdAt)}</strong>
                </span>
              </div>
            </div>
            <Button icon={<EditOutlined />}>Edit Product</Button>
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
      </div>
    </>
  );
}
