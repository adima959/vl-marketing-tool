'use client';

import { Button, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import styles from './permissions.module.css';
import type { Role } from '@/types/roles';

interface RoleListPanelProps {
  roles: Role[];
  loading: boolean;
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  onCreateClick: () => void;
}

export default function RoleListPanel({
  roles,
  loading,
  selectedRoleId,
  onSelect,
  onCreateClick,
}: RoleListPanelProps): React.ReactNode {
  return (
    <div className={styles.rolePanel}>
      <div className={styles.rolePanelHeader}>
        <span className={styles.rolePanelCount}>
          {roles.length} role{roles.length !== 1 ? 's' : ''}
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={onCreateClick}
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
              onClick={() => onSelect(role.id)}
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
  );
}
