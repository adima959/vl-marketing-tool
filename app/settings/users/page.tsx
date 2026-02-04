'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { Table, Button, Tag, message, Spin } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import type { AppUser } from '@/types/user';
import type { ColumnsType } from 'antd/es/table';

// Lazy load the dialog component - only loads when user clicks Edit
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
      title: 'External ID',
      dataIndex: 'external_id',
      key: 'external_id',
      width: 200,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 250,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: AppUser) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleEditRole(record)}
        >
          Edit Role
        </Button>
      ),
    },
  ];

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  // Non-admin users should not see this page (handled by RouteGuard, but double check)
  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <p>Please log in to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage user accounts and roles</p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUsers}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table
          columns={columns}
          dataSource={users}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 20,
            showTotal: (total) => `Total ${total} users`,
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
