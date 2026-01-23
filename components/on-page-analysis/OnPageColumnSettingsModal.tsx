import { Modal, Checkbox, Button, Space } from 'antd';
import { useMemo, useState, useEffect } from 'react';
import { ON_PAGE_METRIC_COLUMNS } from '@/config/onPageColumns';
import { useOnPageColumnStore } from '@/stores/onPageColumnStore';
import type { MetricColumn } from '@/types';
import styles from '@/components/modals/ColumnSettingsModal.module.css';

interface OnPageColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function OnPageColumnSettingsModal({ open, onClose }: OnPageColumnSettingsModalProps) {
  const { visibleColumns, setVisibleColumns, resetToDefaults } = useOnPageColumnStore();
  const [localVisible, setLocalVisible] = useState<string[]>(visibleColumns);

  // Sync local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalVisible(visibleColumns);
    }
  }, [open, visibleColumns]);

  // Engagement: pageViews, uniqueVisitors, bounceRate, avgActiveTime
  const engagementColumns = useMemo(
    () =>
      ON_PAGE_METRIC_COLUMNS.filter((col) =>
        ['pageViews', 'uniqueVisitors', 'bounceRate', 'avgActiveTime'].includes(col.id)
      ),
    []
  );

  // Interactions: scrollPastHero, scrollRate, formViews, formStarters, ctaClicks
  const interactionColumns = useMemo(
    () =>
      ON_PAGE_METRIC_COLUMNS.filter((col) =>
        ['scrollPastHero', 'scrollRate', 'formViews', 'formStarters', 'ctaClicks'].includes(col.id)
      ),
    []
  );

  const handleToggle = (columnId: string, checked: boolean) => {
    if (checked) {
      setLocalVisible([...localVisible, columnId]);
    } else {
      setLocalVisible(localVisible.filter((id) => id !== columnId));
    }
  };

  const handleSave = () => {
    setVisibleColumns(localVisible);
    onClose();
  };

  const handleCancel = () => {
    setLocalVisible(visibleColumns);
    onClose();
  };

  const renderColumnGroup = (columns: MetricColumn[], groupName: string, groupClass: string) => (
    <div className={`${styles.columnGroup} ${styles[groupClass]}`}>
      <h3 className={styles.groupTitle}>{groupName}</h3>
      <div className={styles.columnList}>
        {columns.map((col) => (
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
      className={styles.modal}
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
      <div className={styles.content}>
        {renderColumnGroup(engagementColumns, 'Engagement', 'marketingGroup')}
        {renderColumnGroup(interactionColumns, 'Interactions', 'crmGroup')}
      </div>
    </Modal>
  );
}
