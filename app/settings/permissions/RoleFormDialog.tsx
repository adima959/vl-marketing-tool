'use client';

import { Modal, Input, Select } from 'antd';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './permissions.module.css';
import type { Role } from '@/types/roles';

const { TextArea } = Input;

interface RoleFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  name: string;
  description: string;
  cloneFrom: string | undefined;
  roles: Role[];
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCloneFromChange: (value: string | undefined) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function RoleFormDialog({
  open,
  mode,
  name,
  description,
  cloneFrom,
  roles,
  saving,
  onNameChange,
  onDescriptionChange,
  onCloneFromChange,
  onSubmit,
  onCancel,
}: RoleFormDialogProps): React.ReactNode {
  return (
    <Modal
      title={null}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={saving}
      okText={mode === 'create' ? 'Create' : 'Save'}
      destroyOnHidden
      width={420}
      className={`${modalStyles.modal} ${modalStyles.formDialog}`}
    >
      <div className={modalStyles.dialogHeader}>
        <div className={modalStyles.dialogTitle}>
          {mode === 'create' ? 'Create role' : 'Edit role'}
        </div>
        <div className={modalStyles.dialogSubtitle}>
          {mode === 'create'
            ? 'Define a new role and optionally clone permissions.'
            : 'Update role name and description.'}
        </div>
      </div>

      <div className={styles.dialogForm}>
        <div className={styles.dialogField}>
          <label className={styles.dialogLabel}>Name</label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Marketing Manager"
          />
        </div>
        <div className={styles.dialogField}>
          <label className={styles.dialogLabel}>Description</label>
          <TextArea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Optional description of this role's purpose"
            rows={2}
          />
        </div>
        {mode === 'create' && (
          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>Clone permissions from</label>
            <Select
              value={cloneFrom}
              onChange={onCloneFromChange}
              placeholder="Start with blank permissions"
              allowClear
              style={{ width: '100%' }}
              options={roles.map(r => ({ label: r.name, value: r.id }))}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
