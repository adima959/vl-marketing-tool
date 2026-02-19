'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Spin, App } from 'antd';
import { Plus, Trash2, X, Check, Pencil } from 'lucide-react';
import type { Product, Angle } from '@/types/marketing-pipeline';
import styles from '@/components/settings/data-maps.module.css';
import angleStyles from '@/components/settings/angle-map.module.css';

async function fetchData(): Promise<{ products: Product[]; angles: Angle[] }> {
  const res = await fetch('/api/marketing-pipeline/angles');
  if (!res.ok) throw new Error('Failed to fetch angles');
  const json = await res.json();
  return json.data;
}

async function createAngleApi(productId: string, name: string): Promise<Angle> {
  const res = await fetch('/api/marketing-pipeline/angles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, name }),
  });
  if (!res.ok) throw new Error('Failed to create angle');
  const json = await res.json();
  return json.data;
}

async function renameAngleApi(angleId: string, name: string): Promise<Angle> {
  const res = await fetch(`/api/marketing-pipeline/angles/${angleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to rename angle');
  const json = await res.json();
  return json.data;
}

async function deleteAngleApi(angleId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/marketing-pipeline/angles/${angleId}`, { method: 'DELETE' });
  const json = await res.json();
  return json;
}

export function AngleMapPanel() {
  const { message } = App.useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProductId, setActiveProductId] = useState<string>('');
  const [newAngleName, setNewAngleName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchData();
      setProducts(data.products);
      setAngles(data.angles);
      if (!activeProductId && data.products.length > 0) {
        setActiveProductId(data.products[0].id);
      }
    } catch {
      message.error('Failed to load angles');
    } finally {
      setLoading(false);
    }
  }, [activeProductId, message]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const anglesByProduct = useMemo(() => {
    const map: Record<string, Angle[]> = {};
    for (const p of products) {
      map[p.id] = angles.filter(a => a.productId === p.id);
    }
    return map;
  }, [products, angles]);

  const currentProduct = products.find(p => p.id === activeProductId);
  const currentAngles = anglesByProduct[activeProductId] || [];

  const handleAdd = useCallback(async () => {
    const name = newAngleName.trim();
    if (!name || !activeProductId) return;
    setAddLoading(true);
    try {
      const created = await createAngleApi(activeProductId, name);
      setNewAngleName('');
      setAngles(prev => [...prev, created]);
      message.success('Angle created');
    } catch {
      message.error('Failed to create angle');
    } finally {
      setAddLoading(false);
    }
  }, [newAngleName, activeProductId, message]);

  const handleDelete = useCallback(async (angleId: string) => {
    const result = await deleteAngleApi(angleId);
    if (result.success) {
      setConfirmingDeleteId(null);
      setAngles(prev => prev.filter(a => a.id !== angleId));
      message.success('Angle removed');
    } else {
      message.error(result.error || 'Failed to remove angle');
    }
  }, [message]);

  const startEditing = useCallback((angle: Angle) => {
    setEditingId(angle.id);
    setEditingName(angle.name);
    setConfirmingDeleteId(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setEditLoading(true);
    try {
      await renameAngleApi(editingId, name);
      setAngles(prev => prev.map(a => a.id === editingId ? { ...a, name } : a));
      setEditingId(null);
      setEditingName('');
      message.success('Angle renamed');
    } catch {
      message.error('Failed to rename angle');
    } finally {
      setEditLoading(false);
    }
  }, [editingId, editingName, message]);

  const switchProduct = useCallback((productId: string) => {
    setActiveProductId(productId);
    setNewAngleName('');
    setConfirmingDeleteId(null);
    setEditingId(null);
  }, []);

  const canAdd = newAngleName.trim().length > 0;

  if (loading) {
    return <div className={styles.loadingState}><Spin size="small" /></div>;
  }

  if (products.length === 0) {
    return <div className={styles.emptyState}>No products found. Create products first.</div>;
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar: product list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Products</span>
        </div>
        <div className={styles.sidebarList}>
          {products.map(p => {
            const count = (anglesByProduct[p.id] || []).length;
            const isActive = activeProductId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                onClick={() => switchProduct(p.id)}
              >
                {p.color && <span className={styles.sidebarDot} style={{ backgroundColor: p.color }} />}
                {p.name}
                <span className={styles.sidebarCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content: angle list */}
      <div className={styles.content}>
        <div className={styles.contentHeader}>
          <div className={styles.contentHeaderLeft}>
            <span className={styles.contentTitle}>{currentProduct?.name ?? 'Angles'}</span>
            <span className={styles.contentCount}>{currentAngles.length} angle{currentAngles.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className={styles.itemList}>
          {/* Add row — always at the top */}
          <div className={angleStyles.addRow}>
            <input
              className={angleStyles.addInput}
              placeholder="New angle name..."
              value={newAngleName}
              onChange={(e) => setNewAngleName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              type="button"
              className={`${angleStyles.addBtn} ${canAdd ? angleStyles.addBtnActive : ''}`}
              onClick={handleAdd}
              disabled={!canAdd || addLoading}
            >
              <Plus size={14} />
              {addLoading ? 'Adding...' : 'Add Angle'}
            </button>
          </div>

          {currentAngles.length === 0 ? (
            <div className={styles.emptyState}>No angles yet — type a name above to get started</div>
          ) : (
            currentAngles.map(angle => {
              const isConfirming = confirmingDeleteId === angle.id;
              const isEditing = editingId === angle.id;
              const hasMessages = (angle.messageCount ?? 0) > 0;

              if (isConfirming) {
                return (
                  <div key={angle.id} className={angleStyles.confirmRow}>
                    <span className={styles.confirmText}>
                      Delete &ldquo;{angle.name}&rdquo;?
                    </span>
                    <button type="button" className={styles.confirmYes} onClick={() => handleDelete(angle.id)}>
                      Delete
                    </button>
                    <button type="button" className={angleStyles.cancelBtn} onClick={() => setConfirmingDeleteId(null)}>
                      <X size={14} />
                    </button>
                  </div>
                );
              }

              if (isEditing) {
                const canSave = editingName.trim().length > 0 && editingName.trim() !== angle.name;
                return (
                  <div key={angle.id} className={`${angleStyles.angleRow} ${angleStyles.editRow}`}>
                    <input
                      className={angleStyles.editInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canSave) handleSaveEdit();
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={angleStyles.saveBtn}
                      onClick={handleSaveEdit}
                      disabled={!canSave || editLoading}
                    >
                      <Check size={14} />
                      Save
                    </button>
                    <button type="button" className={angleStyles.cancelBtn} onClick={cancelEditing}>
                      <X size={14} />
                    </button>
                  </div>
                );
              }

              return (
                <div key={angle.id} className={angleStyles.angleRow}>
                  <span className={angleStyles.angleName}>{angle.name}</span>
                  {hasMessages && (
                    <span className={angleStyles.msgCount}>
                      {angle.messageCount} msg{(angle.messageCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    className={angleStyles.editBtn}
                    onClick={() => startEditing(angle)}
                    title="Rename angle"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className={angleStyles.deleteBtn}
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
        </div>
      </div>
    </div>
  );
}
