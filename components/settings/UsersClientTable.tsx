'use client';

import { useState, lazy, Suspense } from 'react';
import { App, Table, Button, Tag, Switch } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { AppUser } from '@/types/user';
import type { ColumnsType } from 'antd/es/table';
import styles from '@/styles/components/settings.module.css';

const EditRoleDialog = lazy(() =>
  import('@/components/users/EditRoleDialog').then((mod) => ({ default: mod.EditRoleDialog }))
);

interface UsersClientTableProps {
  users: AppUser[];
}

export function UsersClientTable({ users }: UsersClientTableProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
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

  const handleEditRole = (record: AppUser) => {
    setSelectedUser(record);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedUser(null);
  };

  const handleDialogSuccess = () => {
    router.refresh();
  };

  const handleToggleProductOwner = async (record: AppUser, checked: boolean) => {
    try {
      const response = await fetch(`/api/users/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_product_owner: checked }),
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Failed to update');
      router.refresh();
    } catch {
      message.error('Failed to update product owner status');
    }
  };

  const columns: ColumnsType<AppUser> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: AppUser) => (
        <div>
          <div className={styles.cellPrimary}>{name}</div>
          <div className={styles.cellSecondary}>{record.email}</div>
        </div>
      ),
    },
    {
      title: 'External ID',
      dataIndex: 'external_id',
      key: 'external_id',
      width: 180,
      render: (id: string) => <span className={styles.cellMono}>{id}</span>,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => (
        <Tag
          color={role === 'admin' ? 'red' : undefined}
          className={styles.tag}
        >
          {role}
        </Tag>
      ),
    },
    {
      title: 'Product Owner',
      dataIndex: 'is_product_owner',
      key: 'is_product_owner',
      width: 120,
      align: 'center' as const,
      render: (value: boolean, record: AppUser) => (
        <Switch
          size="small"
          checked={!!value}
          onChange={(checked) => handleToggleProductOwner(record, checked)}
        />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => (
        <span className={styles.cellDate}>
          {new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, record: AppUser) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleEditRole(record)}
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
            <h2 className={styles.sectionTitle}>Team members</h2>
            <p className={styles.sectionSubtitle}>
              {users.length > 0 ? `${users.length} user${users.length !== 1 ? 's' : ''}` : 'Manage user accounts and roles'}
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
          </div>
        </div>

        <div className={styles.tableCard}>
          <Table
            columns={columns}
            dataSource={users}
            loading={loading}
            rowKey="id"
            size="small"
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
        <EditRoleDialog
          user={selectedUser}
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      </Suspense>
    </>
  );
}
