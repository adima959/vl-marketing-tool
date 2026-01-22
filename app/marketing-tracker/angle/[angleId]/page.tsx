'use client';

import { useEffect } from 'react';
import { Spin, Empty, Button, Table } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Users, Lightbulb, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/marketing-tracker';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import type { ColumnsType } from 'antd/es/table';
import type { SubAngle } from '@/types';
import styles from './page.module.css';

interface SubAngleRow {
  key: string;
  id: string;
  name: string;
  hook?: string;
  status: SubAngle['status'];
  assetCount: number;
}

export default function MainAnglePage() {
  const {
    currentProduct,
    currentMainAngle,
    subAngles,
    isLoading,
    loadMainAngle,
    updateMainAngleStatus,
    updateSubAngleStatus,
  } = useMarketingTrackerStore();

  const angleId = typeof window !== 'undefined'
    ? window.location.pathname.split('/').pop()
    : '';

  useEffect(() => {
    if (angleId) {
      loadMainAngle(angleId);
    }
  }, [angleId, loadMainAngle]);

  // Transform sub-angles for table
  const tableData: SubAngleRow[] = subAngles.map((subAngle) => ({
    key: subAngle.id,
    id: subAngle.id,
    name: subAngle.name,
    hook: subAngle.hook,
    status: subAngle.status,
    assetCount: subAngle.assetCount || 0,
  }));

  const columns: ColumnsType<SubAngleRow> = [
    {
      title: 'SUB-ANGLE NAME',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SubAngleRow) => (
        <Link href={`/marketing-tracker/sub-angle/${record.id}`} className={styles.subAngleLink}>
          <div className={styles.subAngleNameCell}>
            <span className={styles.subAngleName}>{name}</span>
          </div>
        </Link>
      ),
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: SubAngle['status'], record: SubAngleRow) => (
        <StatusBadge
          status={status}
          variant="dot"
          editable
          onChange={(newStatus) => updateSubAngleStatus(record.id, newStatus)}
        />
      ),
    },
    {
      title: 'SPECIFIC HOOK',
      dataIndex: 'hook',
      key: 'hook',
      width: 280,
      render: (hook?: string) => (
        <span className={styles.hookCell}>
          {hook || '-'}
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
      title: '',
      key: 'action',
      width: 40,
      render: (_: unknown, record: SubAngleRow) => (
        <Link href={`/marketing-tracker/sub-angle/${record.id}`}>
          <ChevronRight size={16} className={styles.rowChevron} />
        </Link>
      ),
    },
  ];

  if (isLoading && !currentMainAngle) {
    return (
      <>
        <PageHeader title="Loading..." icon={<Target className="h-5 w-5" />} />
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (!currentMainAngle) {
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
        title={currentMainAngle.name}
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
          <span className={styles.breadcrumbCurrent}>{currentMainAngle.name}</span>
        </div>

        {/* Main content with sidebar layout */}
        <div className={styles.mainGrid}>
          {/* Left: Main content */}
          <div className={styles.mainContent}>
            {/* Angle Header Card */}
            <div className={styles.angleCard}>
              <div className={styles.angleHeader}>
                <div className={styles.angleInfo}>
                  <h1 className={styles.angleTitle}>{currentMainAngle.name}</h1>
                  {currentMainAngle.hook && (
                    <div className={styles.coreHook}>
                      <span className={styles.hookLabel}>CORE HOOK</span>
                      <p className={styles.hookValue}>"{currentMainAngle.hook}"</p>
                    </div>
                  )}
                  {currentMainAngle.description && (
                    <div className={styles.strategySection}>
                      <span className={styles.strategyLabel}>DESCRIPTION / STRATEGY</span>
                      <div
                        className={styles.strategyText}
                        dangerouslySetInnerHTML={{ __html: currentMainAngle.description }}
                      />
                    </div>
                  )}
                </div>
                <div className={styles.angleActions}>
                  <StatusBadge
                    status={currentMainAngle.status}
                    variant="dot"
                    editable
                    onChange={(newStatus) => updateMainAngleStatus(currentMainAngle.id, newStatus)}
                  />
                  <Button icon={<EditOutlined />}>Edit</Button>
                </div>
              </div>
            </div>

            {/* Sub-Angles Section */}
            <div className={styles.subAnglesSection}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleRow}>
                  <GitBranch size={18} className={styles.sectionIcon} />
                  <h2 className={styles.sectionTitle}>Sub-Angles & Executions</h2>
                </div>
                <Button type="primary" icon={<PlusOutlined />}>
                  Add Sub-Angle
                </Button>
              </div>

              {subAngles.length === 0 ? (
                <div className={styles.emptyState}>
                  <Empty description="No sub-angles yet" />
                </div>
              ) : (
                <Table
                  columns={columns}
                  dataSource={tableData}
                  pagination={false}
                  className={styles.subAnglesTable}
                  size="middle"
                  rowClassName={styles.tableRow}
                />
              )}
            </div>
          </div>

          {/* Right: Context Sidebar */}
          <div className={styles.contextSidebar}>
            <h3 className={styles.sidebarTitle}>Angle Context</h3>

            {currentMainAngle.targetAudience && (
              <div className={styles.contextBlock}>
                <div className={styles.contextLabel}>
                  <Users size={14} /> Target Audience
                </div>
                <p className={styles.contextValue}>{currentMainAngle.targetAudience}</p>
              </div>
            )}

            {currentMainAngle.painPoint && (
              <div className={styles.contextBlock}>
                <div className={styles.contextLabel}>
                  <Lightbulb size={14} /> Pain Point
                </div>
                <p className={styles.contextValue}>{currentMainAngle.painPoint}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
