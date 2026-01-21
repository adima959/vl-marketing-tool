import { Modal, Checkbox, Button, Space } from 'antd';
import { useMemo, useState, useEffect } from 'react';
import { METRIC_COLUMNS } from '@/config/columns';
import { useColumnStore } from '@/stores/columnStore';
import type { MetricColumn } from '@/types';
import styles from './ColumnSettingsModal.module.css';

interface ColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ColumnSettingsModal({ open, onClose }: ColumnSettingsModalProps) {
  const { visibleColumns, setVisibleColumns, resetToDefaults } = useColumnStore();
  const [localVisible, setLocalVisible] = useState<string[]>(visibleColumns);

  // Sync local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalVisible(visibleColumns);
    }
  }, [open, visibleColumns]);

  // Marketing Data: impressions, clicks, ctr, cost, cpc, cpm, conversions
  const marketingColumns = useMemo(
    () =>
      METRIC_COLUMNS.filter((col) =>
        ['impressions', 'clicks', 'ctr', 'cost', 'cpc', 'cpm', 'conversions'].includes(col.id)
      ),
    []
  );

  // CRM Data: crmSubscriptions, approvedSales, approvalRate, realCpa
  const crmColumns = useMemo(
    () =>
      METRIC_COLUMNS.filter((col) =>
        ['crmSubscriptions', 'approvedSales', 'approvalRate', 'realCpa'].includes(col.id)
      ),
    []
  );

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
        {renderColumnGroup(marketingColumns, 'Marketing Data', 'marketingGroup')}
        {renderColumnGroup(crmColumns, 'CRM Data', 'crmGroup')}
      </div>
    </Modal>
  );
}
