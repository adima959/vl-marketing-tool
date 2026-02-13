'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Checkbox } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { FEATURES } from '@/types/roles';
import settingsStyles from '@/styles/components/settings.module.css';
import stickyStyles from '@/styles/tables/sticky.module.css';
import styles from './permissions.module.css';
import type {
  RoleWithPermissions,
  RolePermission,
  FeatureKey,
  PermissionAction,
} from '@/types/roles';
import type { ColumnsType } from 'antd/es/table';

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

const ACTION_FIELD_MAP: Record<PermissionAction, keyof PermissionGridRow> = {
  can_view: 'canView',
  can_create: 'canCreate',
  can_edit: 'canEdit',
  can_delete: 'canDelete',
};

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

interface PermissionGridProps {
  roleDetail: RoleWithPermissions;
  selectedRoleId: string;
  detailLoading: boolean;
  message: MessageInstance;
}

export default function PermissionGrid({
  roleDetail,
  selectedRoleId,
  detailLoading,
  message,
}: PermissionGridProps): React.ReactNode {
  const [gridRows, setGridRows] = useState<PermissionGridRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGridRows(buildGridRows(roleDetail.permissions, roleDetail.isSystem));
    setHasChanges(false);
  }, [roleDetail]);

  const handlePermissionChange = (featureKey: FeatureKey, action: PermissionAction, checked: boolean) => {
    setGridRows(prev => prev.map(row => {
      if (row.featureKey !== featureKey) return row;
      return { ...row, [ACTION_FIELD_MAP[action]]: checked };
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
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

  const gridColumns: ColumnsType<PermissionGridRow> = [
    {
      title: 'Feature', dataIndex: 'label', key: 'label', width: 200,
      render: (label: string, record: PermissionGridRow) => {
        if (record.isGroupHeader) return <span className={styles.groupLabel}>{label}</span>;
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
        if (!record.applicableActions.includes(action)) return <span className={styles.dash}>&mdash;</span>;
        const checked = record[ACTION_FIELD_MAP[action]] as boolean;
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

  return (
    <>
      <div className={`${settingsStyles.tableCard} ${styles.permissionGrid} ${stickyStyles.stickyTable}`}>
        <Table
          key={selectedRoleId}
          columns={gridColumns}
          dataSource={gridRows}
          loading={detailLoading}
          rowKey="key"
          size="small"
          pagination={false}
          sticky={{ offsetHeader: 0 }}
          rowClassName={(record) => record.isGroupHeader ? 'groupRow' : ''}
        />
      </div>
      {!roleDetail.isSystem && (
        <div className={styles.gridFooter}>
          <Button type="primary" size="small" onClick={handleSave} loading={saving} disabled={!hasChanges}>
            Save permissions
          </Button>
        </div>
      )}
    </>
  );
}
