'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Select, Switch } from 'antd';
import type { AppUser } from '@/types/user';
import type { Role } from '@/types/roles';
import modalStyles from '@/styles/components/modal.module.css';

interface EditRoleDialogProps {
  user: AppUser | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRoleDialog({ user, open, onClose, onSuccess }: EditRoleDialogProps) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Fetch roles when dialog opens
  useEffect(() => {
    if (open) {
      setRolesLoading(true);
      fetch('/api/roles', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => setRoles(data.data || []))
        .catch(() => message.error('Failed to load roles'))
        .finally(() => setRolesLoading(false));
    }
  }, [open]);

  // Set initial value when user/roles load
  useEffect(() => {
    if (user && open && roles.length > 0) {
      form.setFieldsValue({ role_id: user.role_id || '', is_product_owner: !!user.is_product_owner });
    }
  }, [user, open, roles, form]);

  const handleSubmit = async (values: { role_id: string; is_product_owner: boolean }) => {
    if (!user) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: values.role_id, is_product_owner: values.is_product_owner }),
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
      className={modalStyles.modal}
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
        style={{ marginBottom: 0 }}
      >
        <Form.Item
          label={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)' }}>Role</span>}
          name="role_id"
          rules={[{ required: true, message: 'Please select a role' }]}
          style={{ marginBottom: 16 }}
        >
          <Select
            loading={rolesLoading}
            placeholder="Select a role"
            options={roles.map(r => ({
              label: r.name,
              value: r.id,
            }))}
          />
        </Form.Item>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)' }}>Product Owner</div>
            <div style={{ fontSize: 12, color: 'var(--color-gray-400)', marginTop: 2 }}>
              Appears as an owner in the marketing pipeline
            </div>
          </div>
          <Form.Item name="is_product_owner" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch size="small" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
