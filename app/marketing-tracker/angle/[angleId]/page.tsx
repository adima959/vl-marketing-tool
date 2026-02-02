'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Spin, Empty, Button, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Target, ChevronRight, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, MessageModal } from '@/components/marketing-tracker';
import { EditableField } from '@/components/ui/EditableField';
import { RichEditableField } from '@/components/ui/RichEditableField';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import type { ColumnsType } from 'antd/es/table';
import type { Message } from '@/types';
import styles from './page.module.css';

interface MessageRow {
  key: string;
  id: string;
  name: string;
  specificPainPoint?: string;
  corePromise?: string;
  status: Message['status'];
  assetCount: number;
  creativeCount: number;
}

export default function AnglePage() {
  const [messageModalOpen, setMessageModalOpen] = useState(false);

  const {
    currentProduct,
    currentAngle,
    messages,
    isLoading,
    loadAngle,
    updateAngleStatus,
    updateMessageStatus,
    updateAngleField,
  } = useMarketingTrackerStore();

  const params = useParams<{ angleId: string }>();
  const angleId = params.angleId;

  useEffect(() => {
    if (angleId) {
      loadAngle(angleId);
    }
  }, [angleId, loadAngle]);

  // Transform messages for table
  const tableData: MessageRow[] = messages.map((message) => ({
    key: message.id,
    id: message.id,
    name: message.name,
    specificPainPoint: message.specificPainPoint,
    corePromise: message.corePromise,
    status: message.status,
    assetCount: message.assetCount || 0,
    creativeCount: message.creativeCount || 0,
  }));

  const columns: ColumnsType<MessageRow> = [
    {
      title: 'MESSAGE NAME',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MessageRow) => (
        <Link href={`/marketing-tracker/message/${record.id}`} className={styles.messageLink}>
          <div className={styles.messageNameCell}>
            <span className={styles.messageName}>{name}</span>
            {record.specificPainPoint && (
              <span className={styles.messagePainPoint}>{record.specificPainPoint}</span>
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
      render: (status: Message['status'], record: MessageRow) => (
        <StatusBadge
          status={status}
          variant="dot"
          editable
          onChange={(newStatus) => updateMessageStatus(record.id, newStatus)}
        />
      ),
    },
    {
      title: 'CORE PROMISE',
      dataIndex: 'corePromise',
      key: 'corePromise',
      width: 280,
      render: (promise?: string) => (
        <span className={styles.promiseCell}>
          {promise || '-'}
        </span>
      ),
    },
    {
      title: 'ASSETS',
      dataIndex: 'assetCount',
      key: 'assets',
      width: 80,
      align: 'center',
      render: (count: number) => (
        <span className={styles.countBadge}>{count}</span>
      ),
    },
    {
      title: 'CREATIVES',
      dataIndex: 'creativeCount',
      key: 'creatives',
      width: 90,
      align: 'center',
      render: (count: number) => (
        <span className={styles.countBadge}>{count}</span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_: unknown, record: MessageRow) => (
        <Link href={`/marketing-tracker/message/${record.id}`}>
          <ChevronRight size={16} className={styles.rowChevron} />
        </Link>
      ),
    },
  ];

  if (isLoading && !currentAngle) {
    return (
      <>
        <PageHeader title="Loading..." icon={<Target className="h-5 w-5" />} />
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (!currentAngle) {
    return (
      <>
        <PageHeader title="Angle Not Found" icon={<Target className="h-5 w-5" />} />
        <div className={styles.container}>
          <Empty description="Angle not found" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={currentAngle.name}
        icon={<Target className="h-5 w-5" />}
      />
      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/marketing-tracker" className={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <ChevronRight size={14} />
          {currentProduct && (
            <>
              <Link
                href={`/marketing-tracker/product/${currentProduct.id}`}
                className={styles.breadcrumbLink}
              >
                {currentProduct.name}
              </Link>
              <ChevronRight size={14} />
            </>
          )}
          <span className={styles.breadcrumbCurrent}>{currentAngle.name}</span>
        </div>

        {/* Angle Header Card */}
        <div className={styles.angleCard}>
          <div className={styles.angleHeader}>
            <div className={styles.angleInfo}>
              <span className={styles.angleLabel}>Angle</span>
              <div className={styles.angleTitleRow}>
                <EditableField
                  value={currentAngle.name}
                  onChange={(value) => updateAngleField(currentAngle.id, 'name', value)}
                  placeholder="Angle name"
                />
              </div>
              <div className={styles.angleDescriptionRow}>
                <RichEditableField
                  value={currentAngle.description || ''}
                  onChange={(value) => updateAngleField(currentAngle.id, 'description', value)}
                  placeholder="Add a description..."
                />
              </div>
            </div>
            <div className={styles.angleActions}>
              <StatusBadge
                status={currentAngle.status}
                variant="dot"
                editable
                onChange={(newStatus) => updateAngleStatus(currentAngle.id, newStatus)}
              />
            </div>
          </div>
        </div>

        {/* Messages Section */}
        <div className={styles.messagesSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <MessageSquare size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Messages (Hypotheses)</h2>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setMessageModalOpen(true)}>
              Add Message
            </Button>
          </div>

          <MessageModal
            open={messageModalOpen}
            onClose={() => setMessageModalOpen(false)}
            onSuccess={() => loadAngle(angleId)}
            angleId={angleId}
          />

          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <Empty description="No messages yet" />
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={tableData}
              pagination={false}
              className={styles.messagesTable}
              size="middle"
              rowClassName={styles.tableRow}
            />
          )}
        </div>
      </div>
    </>
  );
}
