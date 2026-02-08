'use client';

import { useState, useMemo, useCallback } from 'react';
import { Modal, Input, Button, App, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Trash2 } from 'lucide-react';
import { usePipelineStore } from '@/stores/pipelineStore';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './AngleManagerModal.module.css';

interface AngleManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function AngleManagerModal({ open, onClose }: AngleManagerModalProps) {
  const { products, angles, createAngle, deleteAngle, loadPipeline } = usePipelineStore();
  const { message } = App.useApp();
  const [newAngleName, setNewAngleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');

  const anglesByProduct = useMemo(() => {
    const map: Record<string, typeof angles> = {};
    for (const product of products) {
      map[product.id] = angles.filter(a => a.productId === product.id);
    }
    return map;
  }, [products, angles]);

  const currentTab = activeTab || products[0]?.id || '';
  const totalAngles = angles.length;
  const currentAngles = anglesByProduct[currentTab] || [];

  const handleAdd = useCallback(async () => {
    const name = newAngleName.trim();
    if (!name || !currentTab) return;

    setLoading(true);
    try {
      const result = await createAngle({ productId: currentTab, name });
      if (result) {
        setNewAngleName('');
        await loadPipeline();
        message.success('Angle created');
      } else {
        message.error('Failed to create angle');
      }
    } finally {
      setLoading(false);
    }
  }, [newAngleName, currentTab, createAngle, loadPipeline, message]);

  const handleDelete = useCallback(async (angleId: string) => {
    const result = await deleteAngle(angleId);
    if (result.success) {
      message.success('Angle removed');
    } else {
      message.error(result.error || 'Failed to remove angle');
    }
  }, [deleteAngle, message]);

  const switchTab = useCallback((productId: string) => {
    setActiveTab(productId);
    setNewAngleName('');
  }, []);

  return (
    <Modal
      title="Manage Angles"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
      className={`${modalStyles.modal} ${styles.modal}`}
    >
      {/* Custom header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Manage Angles</span>
          <span className={styles.subtitle}>{totalAngles} total</span>
        </div>
      </div>

      {/* Custom tab bar */}
      <div className={styles.tabBar}>
        {products.map(product => {
          const count = (anglesByProduct[product.id] || []).length;
          const isActive = product.id === currentTab;
          return (
            <button
              key={product.id}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => switchTab(product.id)}
            >
              {product.name}
              <span className={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {currentAngles.length === 0 ? (
          <div className={styles.emptyState}>No angles yet — add one below</div>
        ) : (
          currentAngles.map(angle => (
            <div key={angle.id} className={styles.angleRow}>
              <span className={styles.angleName}>{angle.name}</span>
              {(angle.messageCount ?? 0) > 0 ? (
                <Tooltip title={`${angle.messageCount} message(s) — remove messages first`}>
                  <button className={styles.angleDeleteBtn} disabled>
                    <Trash2 size={14} />
                  </button>
                </Tooltip>
              ) : (
                <button
                  className={styles.angleDeleteBtn}
                  onClick={() => handleDelete(angle.id)}
                  title="Remove angle"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
        <div className={styles.addRow}>
          <Input
            className={styles.addInput}
            placeholder="Add new angle..."
            value={newAngleName}
            onChange={(e) => setNewAngleName(e.target.value)}
            onPressEnter={handleAdd}
            variant="borderless"
          />
          <Button
            className={styles.addBtn}
            icon={<PlusOutlined />}
            onClick={handleAdd}
            loading={loading}
            disabled={!newAngleName.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
