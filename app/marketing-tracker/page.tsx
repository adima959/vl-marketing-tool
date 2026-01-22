'use client';

import { useEffect } from 'react';
import { Input, Select, Spin, Empty, Button, Table, Avatar } from 'antd';
import { SearchOutlined, UserOutlined, PlusOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Clock, Package } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import type { ColumnsType } from 'antd/es/table';
import styles from './page.module.css';

interface ProductRow {
  key: string;
  id: string;
  name: string;
  description?: string;
  ownerName: string;
  ownerInitials: string;
  angleCount: number;
  activeAngleCount: number;
}

export default function MarketingTrackerDashboard() {
  const {
    products,
    users,
    isLoading,
    searchQuery,
    ownerFilter,
    loadDashboard,
    setSearchQuery,
    setOwnerFilter,
    getFilteredProducts,
  } = useMarketingTrackerStore();

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredProducts = getFilteredProducts();

  const ownerOptions = [
    { value: 'all', label: 'All Owners' },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

  // Transform products for table
  const tableData: ProductRow[] = filteredProducts.map((product) => ({
    key: product.id,
    id: product.id,
    name: product.name,
    description: product.description?.replace(/<[^>]*>/g, '').slice(0, 60),
    ownerName: product.owner?.name || 'Unknown',
    ownerInitials: product.owner?.name?.split(' ').map(n => n[0]).join('') || '?',
    angleCount: product.angleCount || 0,
    activeAngleCount: product.activeAngleCount || 0,
  }));

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
              <span className={styles.productDesc}>{record.description}...</span>
            )}
          </div>
        </Link>
      ),
    },
    {
      title: 'OWNER',
      dataIndex: 'ownerName',
      key: 'owner',
      width: 140,
      render: (name: string, record: ProductRow) => (
        <div className={styles.ownerCell}>
          <Avatar size="small" className={styles.ownerAvatar}>
            {record.ownerInitials}
          </Avatar>
          <span>{name.split(' ')[0]} {name.split(' ')[1]?.[0]}.</span>
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
      key: 'action',
      width: 40,
      render: (_: unknown, record: ProductRow) => (
        <Link href={`/marketing-tracker/product/${record.id}`}>
          <ChevronRight size={16} className={styles.rowChevron} />
        </Link>
      ),
    },
  ];

  // Mock activity data
  const recentActivity = [
    { id: '1', type: 'asset', user: 'AR', action: 'You created asset', detail: 'uploaded new UGC video for Garden Play', time: '2 hours ago' },
    { id: '2', type: 'angle', user: 'AR', action: 'You updated angle', detail: 'changed status of "The Active Grandparent" to Live', time: '1 day ago' },
    { id: '3', type: 'product', user: 'JD', action: 'You created product', detail: 'created new product "SleepRepair Night"', time: '2 days ago' },
  ];

  return (
    <>
      <PageHeader
        title="Marketing Tracker"
        icon={<Target className="h-5 w-5" />}
        actions={
          <Button type="primary" icon={<PlusOutlined />}>
            New Product
          </Button>
        }
      />
      <div className={styles.container}>
        <div className={styles.mainGrid}>
          {/* Products Section */}
          <div className={styles.productsSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <Package size={18} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Products</h2>
                <span className={styles.totalBadge}>{filteredProducts.length} Total</span>
              </div>
              <div className={styles.filters}>
                <Input
                  placeholder="Search products..."
                  prefix={<SearchOutlined />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                  allowClear
                />
                <Select
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  options={ownerOptions}
                  className={styles.ownerSelect}
                  suffixIcon={<UserOutlined />}
                />
              </div>
            </div>

            {isLoading ? (
              <div className={styles.loadingContainer}>
                <Spin size="large" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <Empty
                description={products.length === 0 ? 'No products yet' : 'No products match your filters'}
              />
            ) : (
              <Table
                columns={columns}
                dataSource={tableData}
                pagination={false}
                className={styles.productsTable}
                size="middle"
                rowClassName={styles.tableRow}
              />
            )}
          </div>

          {/* Activity Section */}
          <div className={styles.activitySection}>
            <div className={styles.activityHeader}>
              <Clock size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Recent Activity</h2>
            </div>
            <div className={styles.activityList}>
              {recentActivity.map((activity) => (
                <div key={activity.id} className={styles.activityItem}>
                  <Avatar size={36} className={styles.activityAvatar}>
                    {activity.user}
                  </Avatar>
                  <div className={styles.activityContent}>
                    <span className={styles.activityAction}>{activity.action}</span>
                    <span className={styles.activityDetail}>{activity.detail}</span>
                    <span className={styles.activityTime}>↻ {activity.time}</span>
                  </div>
                </div>
              ))}
              <button className={styles.viewAllButton}>View all activity</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
