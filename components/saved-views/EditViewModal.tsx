'use client';

import { useState, useEffect } from 'react';
import { Modal, Input, Popconfirm, Button, Switch } from 'antd';
import { Star } from 'lucide-react';
import { renameSavedView, deleteSavedView, toggleFavorite } from '@/lib/api/savedViewsClient';
import type { SavedView } from '@/types/savedViews';
import modalStyles from '@/styles/components/modal.module.css';

interface EditViewModalProps {
  open: boolean;
  onClose: () => void;
  view: SavedView | null;
  onRenamed: (updated: SavedView) => void;
  onDeleted: (viewId: string) => void;
}

export function EditViewModal({ open, onClose, view, onRenamed, onDeleted }: EditViewModalProps) {
  const [name, setName] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && view) {
      setName(view.name);
      setIsFavorite(view.isFavorite);
      setError(null);
      setSaving(false);
      setDeleting(false);
    }
  }, [open, view]);

  const handleSave = async () => {
    if (!view) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const nameChanged = trimmed !== view.name;
    const favoriteChanged = isFavorite !== view.isFavorite;
    if (!nameChanged && !favoriteChanged) { onClose(); return; }

    setSaving(true);
    setError(null);
    try {
      let updated: SavedView = { ...view, isFavorite };
      if (nameChanged) {
        const renamed = await renameSavedView(view.id, trimmed);
        updated = { ...updated, ...renamed, isFavorite: updated.isFavorite };
      }
      if (favoriteChanged) {
        await toggleFavorite(view.id, isFavorite);
      }
      onRenamed(updated);
      if (favoriteChanged || nameChanged) {
        window.dispatchEvent(new CustomEvent('favorites-changed', {
          detail: favoriteChanged && !isFavorite
            ? { action: 'remove', viewId: view.id }
            : { action: 'update', view: { ...updated, isFavorite } },
        }));
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!view) return;
    setDeleting(true);
    try {
      await deleteSavedView(view.id);
      onDeleted(view.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete view');
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Edit View"
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="Save"
      confirmLoading={saving}
      okButtonProps={{ disabled: !name.trim() || deleting }}
      width={380}
      destroyOnHidden
      className={modalStyles.modal}
      footer={(_, { OkBtn, CancelBtn }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Popconfirm
            title="Delete this saved view?"
            description="This cannot be undone."
            onConfirm={handleDelete}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true, loading: deleting }}
            placement="topLeft"
          >
            <Button type="text" danger size="small" loading={deleting}>
              Delete
            </Button>
          </Popconfirm>
          <div style={{ display: 'flex', gap: 8 }}>
            <CancelBtn />
            <OkBtn />
          </div>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleSave}
            maxLength={100}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={14} style={{ color: 'var(--color-primary-500)' }} fill={isFavorite ? 'var(--color-primary-500)' : 'none'} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Add to sidebar</span>
          </div>
          <Switch size="small" checked={isFavorite} onChange={setIsFavorite} />
        </div>
        {error && (
          <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div>
        )}
      </div>
    </Modal>
  );
}
