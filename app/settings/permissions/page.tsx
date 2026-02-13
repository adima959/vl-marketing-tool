/**
 * Permissions Page - Remains Client Component
 *
 * Architecture Decision: This page uses Client Component pattern
 *
 * Reasons for remaining client-side:
 * - Complex state management (roles, dialogs)
 * - Role selection with dependent permission grid loading
 * - Multiple dialogs with form state (create/edit role)
 *
 * Grid logic extracted to PermissionGrid component.
 * Role list extracted to RoleListPanel component.
 * Role dialog extracted to RoleFormDialog component.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { App, Button, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, LockOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/AccessDenied';
import settingsStyles from '@/styles/components/settings.module.css';
import RoleListPanel from './RoleListPanel';
import RoleFormDialog from './RoleFormDialog';
import PermissionGrid from './PermissionGrid';
import styles from './permissions.module.css';
import type { Role, RoleWithPermissions } from '@/types/roles';

export default function PermissionsPage() {
  const { isAuthenticated, isLoading: authLoading, hasPermission } = useAuth();
  const { message, modal } = App.useApp();

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDetail, setRoleDetail] = useState<RoleWithPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [dialogName, setDialogName] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');
  const [dialogCloneFrom, setDialogCloneFrom] = useState<string | undefined>();
  const [dialogSaving, setDialogSaving] = useState(false);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/roles', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to fetch roles');
      const data = await res.json();
      setRoles(data.data || []);
      return data.data || [];
    } catch {
      message.error('Failed to load roles');
      return [];
    }
  }, []);

  const fetchRoleDetail = useCallback(async (roleId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/roles/${roleId}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to fetch role');
      const data = await res.json();
      setRoleDetail(data.data as RoleWithPermissions);
    } catch {
      message.error('Failed to load role details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      setLoading(true);
      fetchRoles().then((fetchedRoles: Role[]) => {
        if (fetchedRoles.length > 0) {
          setSelectedRoleId(fetchedRoles[0].id);
          fetchRoleDetail(fetchedRoles[0].id);
        }
        setLoading(false);
      });
    }
  }, [isAuthenticated, authLoading, fetchRoles, fetchRoleDetail]);

  // When selected role changes
  useEffect(() => {
    if (selectedRoleId) {
      fetchRoleDetail(selectedRoleId);
    }
  }, [selectedRoleId, fetchRoleDetail]);

  // ------------------------------------------------------------------
  // Role CRUD handlers
  // ------------------------------------------------------------------

  const openCreateDialog = () => {
    setDialogMode('create');
    setDialogName('');
    setDialogDescription('');
    setDialogCloneFrom(undefined);
    setDialogOpen(true);
  };

  const openEditDialog = () => {
    if (!roleDetail) return;
    setDialogMode('edit');
    setDialogName(roleDetail.name);
    setDialogDescription(roleDetail.description || '');
    setDialogOpen(true);
  };

  const submitCreateRole = async () => {
    const res = await fetch('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: dialogName.trim(),
        description: dialogDescription.trim() || undefined,
        cloneFromRoleId: dialogCloneFrom,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create role');
    }
    const data = await res.json();
    message.success('Role created');
    setDialogOpen(false);
    const updated = await fetchRoles();
    setSelectedRoleId(data.data.id);
    if (updated.length > 0) fetchRoleDetail(data.data.id);
  };

  const submitEditRole = async () => {
    const res = await fetch(`/api/roles/${selectedRoleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: dialogName.trim(),
        description: dialogDescription.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update role');
    }
    message.success('Role updated');
    setDialogOpen(false);
    fetchRoles();
    if (selectedRoleId) fetchRoleDetail(selectedRoleId);
  };

  const handleDialogSubmit = async () => {
    if (!dialogName.trim()) {
      message.error('Role name is required');
      return;
    }
    setDialogSaving(true);
    try {
      if (dialogMode === 'create') await submitCreateRole();
      else await submitEditRole();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setDialogSaving(false);
    }
  };

  const handleDeleteRole = () => {
    if (!roleDetail || roleDetail.isSystem) return;

    modal.confirm({
      title: `Delete "${roleDetail.name}"?`,
      content: roleDetail.userCount
        ? `This role has ${roleDetail.userCount} assigned user(s). Reassign them before deleting.`
        : 'This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      okButtonProps: { disabled: (roleDetail.userCount ?? 0) > 0 },
      onOk: async () => {
        try {
          const res = await fetch(`/api/roles/${selectedRoleId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete');
          }

          message.success('Role deleted');
          const updated = await fetchRoles();
          if (updated.length > 0) {
            setSelectedRoleId(updated[0].id);
          } else {
            setSelectedRoleId(null);
            setRoleDetail(null);
          }
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Failed to delete role');
        }
      },
    });
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (authLoading) {
    return <div className={settingsStyles.centeredState}><Spin size="small" /></div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!hasPermission('admin.role_permissions', 'can_view')) {
    return <AccessDenied feature="Role & Permissions" />;
  }

  return (
    <div className={settingsStyles.page}>
      <div className={settingsStyles.sectionHeader}>
        <div className={settingsStyles.sectionInfo}>
          <h2 className={settingsStyles.sectionTitle}>Roles & Permissions</h2>
          <p className={settingsStyles.sectionSubtitle}>
            Manage roles and configure feature access for each role.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <RoleListPanel
          roles={roles}
          loading={loading}
          selectedRoleId={selectedRoleId}
          onSelect={setSelectedRoleId}
          onCreateClick={openCreateDialog}
        />

        {/* Right panel: Permission grid */}
        <div className={styles.gridPanel}>
          {selectedRoleId && roleDetail ? (
            <>
              <div className={styles.gridHeader}>
                <div className={styles.gridHeaderLeft}>
                  <span className={styles.gridHeaderName}>{roleDetail.name}</span>
                  {roleDetail.isSystem && (
                    <LockOutlined className={styles.systemBannerIcon} />
                  )}
                </div>
                {!roleDetail.isSystem && (
                  <div className={styles.gridHeaderActions}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={openEditDialog} />
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={handleDeleteRole} />
                  </div>
                )}
              </div>

              {roleDetail.isSystem && (
                <div className={styles.systemBanner}>
                  <InfoCircleOutlined className={styles.systemBannerIcon} />
                  System role — permissions cannot be modified.
                </div>
              )}

              <PermissionGrid
                roleDetail={roleDetail}
                selectedRoleId={selectedRoleId}
                detailLoading={detailLoading}
                message={message}
              />
            </>
          ) : (
            <div className={styles.gridEmpty}>
              {loading ? <Spin size="small" /> : 'Select a role to view permissions'}
            </div>
          )}
        </div>
      </div>

      <RoleFormDialog
        open={dialogOpen}
        mode={dialogMode}
        name={dialogName}
        description={dialogDescription}
        cloneFrom={dialogCloneFrom}
        roles={roles}
        saving={dialogSaving}
        onNameChange={setDialogName}
        onDescriptionChange={setDialogDescription}
        onCloneFromChange={setDialogCloneFrom}
        onSubmit={handleDialogSubmit}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
