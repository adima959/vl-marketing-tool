'use client';

import { useState, useMemo, useCallback } from 'react';
import { Input, Button, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Trash2, X } from 'lucide-react';
import { usePipelineStore } from '@/stores/pipelineStore';
import { SidebarModal } from '@/components/ui/SidebarModal';
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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const anglesByProduct = useMemo(() => {
    const map: Record<string, typeof angles> = {};
    for (const product of products) {
      map[product.id] = angles.filter(a => a.productId === product.id);
    }
    return map;
  }, [products, angles]);

  const currentTab = activeTab || products[0]?.id || '';
  const currentProduct = products.find(p => p.id === currentTab);
  const currentAngles = anglesByProduct[currentTab] || [];

  const sidebarItems = useMemo(() =>
    products.map(p => ({
      key: p.id,
      label: p.name,
      count: (anglesByProduct[p.id] || []).length,
    })),
    [products, anglesByProduct],
  );

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
      setConfirmingDeleteId(null);
      message.success('Angle removed');
    } else {
      message.error(result.error || 'Failed to remove angle');
    }
  }, [deleteAngle, message]);

  const switchTab = useCallback((productId: string) => {
    setActiveTab(productId);
    setNewAngleName('');
    setConfirmingDeleteId(null);
  }, []);

  return (
    <SidebarModal
      open={open}
      onClose={onClose}
      title="Manage Angles"
      sidebar={{
        title: 'Products',
        items: sidebarItems,
        activeKey: currentTab,
        onSelect: switchTab,
      }}
      contentTitle={currentProduct?.name ?? 'Angles'}
      contentExtra={`${currentAngles.length} angle${currentAngles.length !== 1 ? 's' : ''}`}
      footer={
        <div className={styles.addRow}>
          <Input
            className={styles.addInput}
            placeholder="New angle name..."
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
      }
    >
      {currentAngles.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No angles yet</div>
          <div className={styles.emptyHint}>Add your first angle below to get started</div>
        </div>
      ) : (
        currentAngles.map(angle => {
          const isConfirming = confirmingDeleteId === angle.id;
          const hasMessages = (angle.messageCount ?? 0) > 0;

          if (isConfirming) {
            return (
              <div key={angle.id} className={`${styles.angleRow} ${styles.angleRowConfirm}`}>
                <span className={styles.confirmText}>
                  Delete &ldquo;{angle.name}&rdquo;?
                </span>
                <div className={styles.confirmActions}>
                  <button
                    className={styles.confirmYes}
                    onClick={() => handleDelete(angle.id)}
                  >
                    Delete
                  </button>
                  <button
                    className={styles.confirmCancel}
                    onClick={() => setConfirmingDeleteId(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={angle.id} className={styles.angleRow}>
              <span className={styles.angleName}>{angle.name}</span>
              {hasMessages && (
                <span className={styles.angleMsgCount}>
                  {angle.messageCount} msg{(angle.messageCount ?? 0) !== 1 ? 's' : ''}
                </span>
              )}
              <button
                className={styles.angleDeleteBtn}
                onClick={() => hasMessages ? undefined : setConfirmingDeleteId(angle.id)}
                disabled={hasMessages}
                title={hasMessages ? `${angle.messageCount} message(s) — remove messages first` : 'Delete angle'}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })
      )}
    </SidebarModal>
  );
}
