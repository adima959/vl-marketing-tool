'use client';

import { useState } from 'react';
import { Modal, Form, Select, Input, message } from 'antd';
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

  // Reset form when user changes
  if (user && open) {
    form.setFieldsValue({ role: user.role });
  }

  return (
    <Modal
      title="Edit User Role"
      open={open}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="Update Role"
      cancelText="Cancel"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ role: user?.role }}
      >
        <Form.Item label="External ID">
          <Input value={user?.external_id} disabled />
        </Form.Item>

        <Form.Item label="Name">
          <Input value={user?.name} disabled />
        </Form.Item>

        <Form.Item label="Email">
          <Input value={user?.email} disabled />
        </Form.Item>

        <Form.Item
          label="Role"
          name="role"
          rules={[{ required: true, message: 'Please select a role' }]}
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
