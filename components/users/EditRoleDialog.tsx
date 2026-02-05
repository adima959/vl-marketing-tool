'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Select, message } from 'antd';
import type { AppUser, UserRole } from '@/types/user';

interface EditRoleDialogProps {
  user: AppUser | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRoleDialog({ user, open, onClose, onSuccess }: EditRoleDialogProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { role: UserRole }) => {
    if (!user) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: values.role }),
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update user role');
      }

      message.success('User role updated successfully');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating user role:', error);
      message.error(error instanceof Error ? error.message : 'Failed to update user role');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  useEffect(() => {
    if (user && open) {
      form.setFieldsValue({ role: user.role });
    }
  }, [user, open, form]);

  return (
    <Modal
      title={null}
      open={open}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="Update"
      cancelText="Cancel"
      destroyOnHidden
      width={400}
      styles={{
        header: { display: 'none' },
        body: { padding: '20px 24px 16px' },
        footer: { padding: '12px 24px 20px', borderTop: '1px solid var(--color-border-light)' },
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-gray-900)', marginBottom: 4 }}>
          Edit role
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
          Change the permission level for this user.
        </div>
      </div>

      <div
        style={{
          padding: '12px',
          borderRadius: 6,
          border: '1px solid var(--color-border-light)',
          backgroundColor: 'var(--color-background-secondary)',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-gray-900)' }}>
          {user?.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-gray-500)', marginTop: 2 }}>
          {user?.email}
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-family-mono)',
            color: 'var(--color-gray-400)',
            marginTop: 6,
          }}
        >
          ID {user?.external_id}
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ role: user?.role }}
        style={{ marginBottom: 0 }}
      >
        <Form.Item
          label={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)' }}>Role</span>}
          name="role"
          rules={[{ required: true, message: 'Please select a role' }]}
          style={{ marginBottom: 0 }}
        >
          <Select>
            <Select.Option value="user">User</Select.Option>
            <Select.Option value="admin">Admin</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}
