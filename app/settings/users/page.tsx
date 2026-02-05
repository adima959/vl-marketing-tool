'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { Table, Button, Tag, message, Spin } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import type { AppUser } from '@/types/user';
import type { ColumnsType } from 'antd/es/table';

const EditRoleDialog = lazy(() =>
  import('@/components/users/EditRoleDialog').then((mod) => ({ default: mod.EditRoleDialog }))
);

export default function UsersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users', {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        if (response.status === 403) {
          message.error('You do not have permission to view users');
          return;
        }
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchUsers();
    }
  }, [isAuthenticated, authLoading]);

  const handleEditRole = (record: AppUser) => {
    setSelectedUser(record);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedUser(null);
  };

  const handleDialogSuccess = () => {
    fetchUsers();
  };

  const columns: ColumnsType<AppUser> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: AppUser) => (
        <div>
          <div className="text-[13px] font-medium text-[var(--color-gray-900)]">{name}</div>
          <div className="text-[12px] text-[var(--color-gray-500)]">{record.email}</div>
        </div>
      ),
    },
    {
      title: 'External ID',
      dataIndex: 'external_id',
      key: 'external_id',
      width: 180,
      render: (id: string) => (
        <span className="text-[12px] font-mono text-[var(--color-gray-500)]">{id}</span>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => (
        <Tag
          color={role === 'admin' ? 'red' : undefined}
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
          {role}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => (
        <span className="text-[12px] text-[var(--color-gray-500)]">
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
          <h2 className="text-[14px] font-semibold text-[var(--color-gray-900)]">Team members</h2>
          <p className="text-[12px] text-[var(--color-gray-500)] mt-0.5">
            {users.length > 0 ? `${users.length} user${users.length !== 1 ? 's' : ''}` : 'Manage user accounts and roles'}
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUsers}
          loading={loading}
          size="small"
        >
          Refresh
        </Button>
      </div>

      <div className="rounded-md border border-[var(--color-border-light)] bg-white overflow-hidden">
        <Table
          columns={columns}
          dataSource={users}
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
        <EditRoleDialog
          user={selectedUser}
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      </Suspense>
    </div>
  );
}
