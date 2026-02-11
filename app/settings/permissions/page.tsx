/**
 * Permissions Page - Remains Client Component
 *
 * Architecture Decision: This page uses Client Component pattern
 *
 * Reasons for remaining client-side:
 * - 575 lines of complex state management (roles, permissions grid, dialogs)
 * - Heavy inline editing with permission checkboxes requiring real-time updates
 * - Multiple dialogs with form state (create/edit role)
 * - Role selection with dependent permission grid loading
 * - Extensive local state synchronization before save
 *
 * Conversion to Server Component would require:
 * - Splitting into 5+ separate client components
 * - Complex state lifting and coordination
 * - Significant refactoring effort with minimal benefit
 *
 * Current pattern is appropriate for this admin-only configuration page.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Checkbox, Tag, Modal, Input, Select, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LockOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import { AuthErrorPage } from '@/components/auth/AuthErrorPage';
import { FEATURES } from '@/types/roles';
import modalStyles from '@/styles/components/modal.module.css';
import settingsStyles from '@/styles/components/settings.module.css';
import styles from './permissions.module.css';
import type {
  Role,
  RoleWithPermissions,
  RolePermission,
  FeatureKey,
  PermissionAction,
} from '@/types/roles';
import type { ColumnsType } from 'antd/es/table';

const { TextArea } = Input;

// ============================================================================
// Types
// ============================================================================

interface PermissionGridRow {
  key: string;
  featureKey?: FeatureKey;
  label: string;
  isGroupHeader: boolean;
  isDisabled: boolean;
  applicableActions: PermissionAction[];
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build grid rows from FEATURES constant + current permissions */
function buildGridRows(permissions: RolePermission[], isDisabled: boolean): PermissionGridRow[] {
  const permMap = new Map<string, RolePermission>();
  for (const p of permissions) {
    permMap.set(p.featureKey, p);
  }

  const rows: PermissionGridRow[] = [];
  let lastGroup = '';

  for (const feature of FEATURES) {
    if (feature.group !== lastGroup) {
      rows.push({
        key: `group-${feature.group}`,
        label: feature.group,
        isGroupHeader: true,
        isDisabled,
        applicableActions: [],
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      });
      lastGroup = feature.group;
    }

    const perm = permMap.get(feature.key);
    rows.push({
      key: feature.key,
      featureKey: feature.key,
      label: feature.label,
      isGroupHeader: false,
      isDisabled,
      applicableActions: feature.applicableActions,
      canView: perm?.canView ?? false,
      canCreate: perm?.canCreate ?? false,
      canEdit: perm?.canEdit ?? false,
      canDelete: perm?.canDelete ?? false,
    });
  }

  return rows;
}

// ============================================================================
// Component
// ============================================================================

export default function PermissionsPage() {
  const { isAuthenticated, isLoading: authLoading, authError } = useAuth();
  const { message, modal } = App.useApp();

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDetail, setRoleDetail] = useState<RoleWithPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Grid state (local edits before save)
  const [gridRows, setGridRows] = useState<PermissionGridRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

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
      const role = data.data as RoleWithPermissions;
      setRoleDetail(role);
      setGridRows(buildGridRows(role.permissions, role.isSystem));
      setHasChanges(false);
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
  // Permission grid handlers
  // ------------------------------------------------------------------

  const handlePermissionChange = (featureKey: FeatureKey, action: PermissionAction, checked: boolean) => {
    setGridRows(prev => prev.map(row => {
      if (row.featureKey !== featureKey) return row;
      return { ...row, [action === 'can_view' ? 'canView' : action === 'can_create' ? 'canCreate' : action === 'can_edit' ? 'canEdit' : 'canDelete']: checked };
    }));
    setHasChanges(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleId) return;
    setSaving(true);

    const permissions = gridRows
      .filter(r => !r.isGroupHeader && r.featureKey)
      .map(r => ({
        featureKey: r.featureKey!,
        canView: r.canView,
        canCreate: r.canCreate,
        canEdit: r.canEdit,
        canDelete: r.canDelete,
      }));

    try {
      const res = await fetch(`/api/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ permissions }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      message.success('Permissions saved');
      setHasChanges(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

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

  const handleDialogSubmit = async () => {
    if (!dialogName.trim()) {
      message.error('Role name is required');
      return;
    }

    setDialogSaving(true);
    try {
      if (dialogMode === 'create') {
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
      } else {
        // Edit mode
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
      }
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
  // Permission grid columns
  // ------------------------------------------------------------------

  const gridColumns: ColumnsType<PermissionGridRow> = [
    {
      title: 'Feature',
      dataIndex: 'label',
      key: 'label',
      width: 200,
      render: (label: string, record: PermissionGridRow) => {
        if (record.isGroupHeader) {
          return <span className={styles.groupLabel}>{label}</span>;
        }
        return <span className={styles.featureLabel}>{label}</span>;
      },
    },
    ...(['can_view', 'can_create', 'can_edit', 'can_delete'] as PermissionAction[]).map(action => ({
      title: action.replace('can_', '').charAt(0).toUpperCase() + action.replace('can_', '').slice(1),
      key: action,
      width: 80,
      align: 'center' as const,
      render: (_: unknown, record: PermissionGridRow) => {
        if (record.isGroupHeader) return null;
        const isApplicable = record.applicableActions.includes(action);
        if (!isApplicable) return <span className={styles.dash}>&mdash;</span>;

        const fieldMap: Record<PermissionAction, keyof PermissionGridRow> = {
          can_view: 'canView',
          can_create: 'canCreate',
          can_edit: 'canEdit',
          can_delete: 'canDelete',
        };
        const checked = record[fieldMap[action]] as boolean;

        return (
          <Checkbox
            checked={checked}
            disabled={record.isDisabled}
            onChange={(e) => handlePermissionChange(record.featureKey!, action, e.target.checked)}
          />
        );
      },
    })),
  ];

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (authLoading) {
    return <div className={settingsStyles.centeredState}><Spin size="small" /></div>;
  }

  if (!isAuthenticated || authError) {
    return <AuthErrorPage />;
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
        {/* Left panel: Role list */}
        <div className={styles.rolePanel}>
          <div className={styles.rolePanelHeader}>
            <span className={styles.rolePanelCount}>
              {roles.length} role{roles.length !== 1 ? 's' : ''}
            </span>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={openCreateDialog}
            >
              Add role
            </Button>
          </div>

          <div className={styles.roleList}>
            {loading ? (
              <div className={styles.roleListLoading}>
                <Spin size="small" />
              </div>
            ) : (
              roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`${styles.roleItem} ${selectedRoleId === role.id ? styles.roleItemActive : ''}`}
                >
                  <div className={styles.roleItemTop}>
                    <span className={styles.roleItemName}>{role.name}</span>
                    {role.isSystem && <Tag className={styles.systemTag}>System</Tag>}
                  </div>
                  <div className={styles.roleItemBottom}>
                    <span className={styles.roleItemDesc}>
                      {role.description || 'No description'}
                    </span>
                    <span className={styles.roleItemUsers}>
                      {role.userCount ?? 0} user{(role.userCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

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

              <div className={`${settingsStyles.tableCard} ${styles.permissionGrid}`}>
                <Table
                  key={selectedRoleId}
                  columns={gridColumns}
                  dataSource={gridRows}
                  loading={detailLoading}
                  rowKey="key"
                  size="small"
                  pagination={false}
                  rowClassName={(record) =>
                    record.isGroupHeader ? 'groupRow' : ''
                  }
                />
              </div>

              {!roleDetail.isSystem && (
                <div className={styles.gridFooter}>
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleSavePermissions}
                    loading={saving}
                    disabled={!hasChanges}
                  >
                    Save permissions
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.gridEmpty}>
              {loading ? <Spin size="small" /> : 'Select a role to view permissions'}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Role Dialog */}
      <Modal
        title={null}
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onOk={handleDialogSubmit}
        confirmLoading={dialogSaving}
        okText={dialogMode === 'create' ? 'Create' : 'Save'}
        destroyOnHidden
        width={420}
        className={`${modalStyles.modal} ${modalStyles.formDialog}`}
      >
        <div className={modalStyles.dialogHeader}>
          <div className={modalStyles.dialogTitle}>
            {dialogMode === 'create' ? 'Create role' : 'Edit role'}
          </div>
          <div className={modalStyles.dialogSubtitle}>
            {dialogMode === 'create'
              ? 'Define a new role and optionally clone permissions.'
              : 'Update role name and description.'}
          </div>
        </div>

        <div className={styles.dialogForm}>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Name</label>
            <Input
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              placeholder="e.g. Marketing Manager"
            />
          </div>
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Description</label>
            <TextArea
              value={dialogDescription}
              onChange={(e) => setDialogDescription(e.target.value)}
              placeholder="Optional description of this role's purpose"
              rows={2}
            />
          </div>
          {dialogMode === 'create' && (
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Clone permissions from</label>
              <Select
                value={dialogCloneFrom}
                onChange={setDialogCloneFrom}
                placeholder="Start with blank permissions"
                allowClear
                style={{ width: '100%' }}
                options={roles.map(r => ({ label: r.name, value: r.id }))}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
