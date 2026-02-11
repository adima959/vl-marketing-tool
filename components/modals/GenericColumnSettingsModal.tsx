import { Modal, Checkbox, Button, Space } from 'antd';
import { useState, useEffect } from 'react';
import type { MetricColumn } from '@/types';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './ColumnSettingsModal.module.css';

interface ColumnGroup {
  title: string;
  columns: MetricColumn[];
  className: string;
}

interface ColumnStore {
  visibleColumns: string[];
  setVisibleColumns: (columns: string[]) => void;
  resetToDefaults: () => void;
}

interface GenericColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
  useColumnStore: () => ColumnStore;
  columnGroups: ColumnGroup[];
}

/**
 * Generic column settings modal that can be used across different pages
 * Accepts a store hook and column groups configuration
 */
export function GenericColumnSettingsModal({
  open,
  onClose,
  useColumnStore,
  columnGroups,
}: GenericColumnSettingsModalProps) {
  const { visibleColumns, setVisibleColumns, resetToDefaults } = useColumnStore();
  const [localVisible, setLocalVisible] = useState<string[]>(visibleColumns);

  // Sync local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalVisible(visibleColumns);
    }
  }, [open, visibleColumns]);

  // Toggle column visibility
  const handleToggle = (columnId: string, checked: boolean) => {
    if (checked) {
      setLocalVisible([...localVisible, columnId]);
    } else {
      setLocalVisible(localVisible.filter((id) => id !== columnId));
    }
  };

  // Save changes
  const handleSave = () => {
    setVisibleColumns(localVisible);
    onClose();
  };

  // Cancel changes
  const handleCancel = () => {
    setLocalVisible(visibleColumns);
    onClose();
  };

  // Render column group
  const renderColumnGroup = (group: ColumnGroup) => (
    <div key={group.title} className={`${styles.columnGroup} ${styles[group.className]}`}>
      <h3 className={styles.groupTitle}>{group.title}</h3>
      <div className={styles.columnList}>
        {group.columns.map((col) => (
          <label key={col.id} className={styles.columnItem}>
            <Checkbox
              checked={localVisible.includes(col.id)}
              onChange={(e) => handleToggle(col.id, e.target.checked)}
              className={styles.checkbox}
            />
            <div className={styles.columnInfo}>
              <span className={styles.metricName}>{col.label}</span>
              <span className={styles.columnLabel}>{col.shortLabel}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      title={<span className={styles.modalTitle}>Column Settings</span>}
      open={open}
      onCancel={handleCancel}
      width={700}
      centered
      className={`${modalStyles.modal} ${styles.modal}`}
      styles={{
        header: { paddingBottom: 16, borderBottom: '1px solid #e8eaed' },
        body: { paddingTop: 20, paddingBottom: 8, maxHeight: 'calc(85vh - 180px)', overflowY: 'auto' },
      }}
      footer={
        <div className={styles.footer}>
          <Button onClick={resetToDefaults} size="middle" className={styles.resetButton}>
            Reset to Defaults
          </Button>
          <Space size={12}>
            <Button onClick={handleCancel} size="middle">
              Cancel
            </Button>
            <Button type="primary" onClick={handleSave} size="middle">
              Save
            </Button>
          </Space>
        </div>
      }
    >
      <div className={styles.content}>{columnGroups.map(renderColumnGroup)}</div>
    </Modal>
  );
}
