'use client';

import { useEffect } from 'react';
import { Table, InputNumber } from 'antd';
import { Settings, FolderOpen } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Product } from '@/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProductStatusBadge } from '@/components/marketing-pipeline';
import { usePipelineStore } from '@/stores/pipelineStore';
import stickyStyles from '@/styles/tables/sticky.module.css';
import styles from './page.module.css';

interface ProductRow extends Product {
  key: string;
  ownerName: string;
}

export default function ProductsSettingsPage() {
  const { products, users, loadPipeline, updateProductField } = usePipelineStore();

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const tableData: ProductRow[] = products.map(p => ({
    ...p,
    key: p.id,
    ownerName: users.find(u => u.id === p.ownerId)?.name || 'Unknown',
  }));

  const handleCpaChange = (productId: string, field: string, value: number | null) => {
    if (value != null) {
      updateProductField(productId, field, value);
    }
  };

  const columns: ColumnsType<ProductRow> = [
    {
      title: 'Product',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <span className={styles.productName}>{name}</span>,
    },
    {
      title: 'Owner',
      dataIndex: 'ownerName',
      key: 'owner',
      width: 140,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <ProductStatusBadge status={status as 'active' | 'inactive'} />
      ),
    },
    {
      title: 'CPA 🇳🇴',
      dataIndex: 'cpaTargetNo',
      key: 'cpaNo',
      width: 100,
      render: (value: number | undefined, record: ProductRow) => (
        <InputNumber
          value={value}
          onChange={(val) => handleCpaChange(record.id, 'cpaTargetNo', val)}
          prefix="$"
          size="small"
          min={0}
          className={styles.cpaInput}
        />
      ),
    },
    {
      title: 'CPA 🇸🇪',
      dataIndex: 'cpaTargetSe',
      key: 'cpaSe',
      width: 100,
      render: (value: number | undefined, record: ProductRow) => (
        <InputNumber
          value={value}
          onChange={(val) => handleCpaChange(record.id, 'cpaTargetSe', val)}
          prefix="$"
          size="small"
          min={0}
          className={styles.cpaInput}
        />
      ),
    },
    {
      title: 'CPA 🇩🇰',
      dataIndex: 'cpaTargetDk',
      key: 'cpaDk',
      width: 100,
      render: (value: number | undefined, record: ProductRow) => (
        <InputNumber
          value={value}
          onChange={(val) => handleCpaChange(record.id, 'cpaTargetDk', val)}
          prefix="$"
          size="small"
          min={0}
          className={styles.cpaInput}
        />
      ),
    },
    {
      title: 'Drive',
      dataIndex: 'driveFolderId',
      key: 'drive',
      width: 60,
      align: 'center' as const,
      render: (folderId: string | null) => folderId ? (
        <a
          href={`https://drive.google.com/drive/folders/${folderId}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open Drive folder"
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--color-gray-400)' }}
        >
          <FolderOpen size={16} />
        </a>
      ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Products Settings"
        icon={<Settings className="h-5 w-5" />}
      />
      <div className={styles.container}>
        <div className={styles.tableCard}>
          <div className={stickyStyles.stickyTable}>
            <Table
              columns={columns}
              dataSource={tableData}
              pagination={false}
              className={styles.productsTable}
              size="middle"
              tableLayout="fixed"
              sticky={{ offsetHeader: 0 }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
