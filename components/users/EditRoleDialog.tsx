'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Select, Switch } from 'antd';
import type { AppUser } from '@/types/user';
import type { Role } from '@/types/roles';
import { useAuth } from '@/contexts/AuthContext';
import modalStyles from '@/styles/components/modal.module.css';
import { checkAuthError } from '@/lib/api/errorHandler';

interface EditRoleDialogProps {
  user: AppUser | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRoleDialog({ user, open, onClose, onSuccess }: EditRoleDialogProps) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Fetch roles when dialog opens
  useEffect(() => {
    if (open) {
      const loadRoles = async () => {
        setRolesLoading(true);
        try {
          const res = await fetch('/api/roles', { credentials: 'same-origin' });
          checkAuthError(res);
          const data = await res.json();
          setRoles(data.data || []);
        } catch {
          message.error('Failed to load roles');
        } finally {
          setRolesLoading(false);
        }
      };
      loadRoles();
    }
  }, [open, message]);

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

      checkAuthError(response);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update user role');
      }

      message.success('User role updated successfully');
      form.resetFields();

      // Refresh auth state: if we changed our own role, the server revoked
      // our session — checkAuth will detect the 401 and show the session
      // refresh page. If we changed another user's role, checkAuth updates
      // our permissions (no-op if unchanged).
      await checkAuth();

      onSuccess();
      onClose();
    } catch (error) {
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
      className={`${modalStyles.modal} ${modalStyles.formDialog}`}
    >
      <div className={modalStyles.dialogHeader}>
        <div className={modalStyles.dialogTitle}>Edit role</div>
        <div className={modalStyles.dialogSubtitle}>
          Change the permission level for this user.
        </div>
      </div>

      <div className={modalStyles.dialogUserCard}>
        <div className={modalStyles.dialogUserName}>{user?.name}</div>
        <div className={modalStyles.dialogUserEmail}>{user?.email}</div>
        <div className={modalStyles.dialogUserId}>ID {user?.external_id}</div>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label={<span className={modalStyles.formLabel}>Role</span>}
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

        <div className={modalStyles.switchRow}>
          <div>
            <div className={modalStyles.switchLabel}>Product Owner</div>
            <div className={modalStyles.switchDesc}>
              Appears as an owner in the marketing pipeline
            </div>
          </div>
          <Form.Item name="is_product_owner" valuePropName="checked" noStyle>
            <Switch size="small" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
