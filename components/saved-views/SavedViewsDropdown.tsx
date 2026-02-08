'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dropdown, Button } from 'antd';
import { Star, Pencil, Plus } from 'lucide-react';
import { fetchSavedViews, toggleFavorite } from '@/lib/api/savedViewsClient';
import { resolveViewParams } from '@/lib/savedViews';
import { SaveViewModal } from '@/components/saved-views/SaveViewModal';
import { EditViewModal } from '@/components/saved-views/EditViewModal';
import type { SavedView, ResolvedViewParams } from '@/types/savedViews';
import dropdownStyles from './SavedViewsDropdown.module.css';

interface CurrentState {
  dateRange: { start: Date; end: Date };
  dimensions?: string[];
  filters?: { field: string; operator: string; value: string }[];
  sortBy?: string | null;
  sortDir?: 'ascend' | 'descend' | null;
  period?: 'weekly' | 'biweekly' | 'monthly' | null;
  visibleColumns?: string[];
  totalColumns?: number;
}

interface SavedViewsDropdownProps {
  pagePath: string;
  onApplyView: (params: ResolvedViewParams) => void;
  getCurrentState: () => CurrentState;
}

const iconButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--color-gray-400)',
  flexShrink: 0,
};

export function SavedViewsDropdown({ pagePath, onApplyView, getCurrentState }: SavedViewsDropdownProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [editView, setEditView] = useState<SavedView | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const loadViews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSavedViews(pagePath);
      setViews(data);
    } catch (err) {
      console.warn('Failed to load saved views:', err);
    } finally {
      setLoading(false);
    }
  }, [pagePath]);

  // Load views on mount
  useEffect(() => {
    loadViews();
  }, [loadViews]);

  const handleApply = (view: SavedView) => {
    const params = resolveViewParams(view);
    onApplyView(params);
    setDropdownOpen(false);
  };

  const handleToggleFavorite = async (viewId: string, currentlyFavorite: boolean) => {
    try {
      await toggleFavorite(viewId, !currentlyFavorite);
      setViews((prev) =>
        prev.map((v) => v.id === viewId ? { ...v, isFavorite: !currentlyFavorite } : v)
      );
      window.dispatchEvent(new Event('favorites-changed'));
    } catch (err) {
      console.warn('Failed to toggle favorite:', err);
    }
  };

  const handleEdit = (view: SavedView) => {
    setDropdownOpen(false);
    setEditView(view);
  };

  const handleSaveNew = () => {
    setDropdownOpen(false);
    setSaveModalOpen(true);
  };

  const handleRenamed = (updated: SavedView) => {
    setViews((prev) => prev.map((v) => v.id === updated.id ? { ...v, name: updated.name, isFavorite: updated.isFavorite } : v));
  };

  const handleDeleted = (viewId: string) => {
    setViews((prev) => prev.filter((v) => v.id !== viewId));
    window.dispatchEvent(new Event('favorites-changed'));
  };

  const menuItems = [
    ...views.map((view) => ({
      key: view.id,
      label: (
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 200 }}
        >
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {view.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: -4 }}>
            <button
              title={view.isFavorite ? 'Remove from sidebar' : 'Add to sidebar'}
              onClick={(e) => { e.stopPropagation(); handleToggleFavorite(view.id, view.isFavorite); }}
              style={{
                ...iconButton,
                color: view.isFavorite ? 'var(--color-primary-500)' : 'var(--color-gray-400)',
              }}
              onMouseEnter={(e) => {
                if (!view.isFavorite) {
                  e.currentTarget.style.color = 'var(--color-primary-500)';
                  e.currentTarget.style.background = '#f0fdf4';
                }
              }}
              onMouseLeave={(e) => {
                if (!view.isFavorite) {
                  e.currentTarget.style.color = 'var(--color-gray-400)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <Star size={13} fill={view.isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button
              title="Edit view"
              onClick={(e) => { e.stopPropagation(); handleEdit(view); }}
              style={iconButton}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-gray-700)'; e.currentTarget.style.background = 'var(--color-background-tertiary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-gray-400)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Pencil size={13} />
            </button>
          </div>
        </div>
      ),
      onClick: () => handleApply(view),
    })),
    ...(views.length > 0 ? [{ key: 'divider', type: 'divider' as const }] : []),
    {
      key: 'save-new',
      icon: <Plus size={14} style={{ color: 'var(--color-primary-500)' }} />,
      label: <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-primary-500)' }}>Save current view</span>,
      onClick: handleSaveNew,
    },
  ];

  return (
    <>
      <Dropdown
        menu={{ items: menuItems }}
        trigger={['hover']}
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
        placement="bottomLeft"
        classNames={{ root: dropdownStyles.dropdownPopup }}
      >
        <Button
          type="text"
          size="small"
          loading={loading}
          icon={views.length > 0
            ? <Star size={16} fill="var(--color-primary-500)" stroke="var(--color-primary-500)" />
            : <Star size={16} className="text-gray-400" />
          }
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Dropdown>

      <SaveViewModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        pagePath={pagePath}
        currentState={getCurrentState()}
        onSaved={loadViews}
      />

      <EditViewModal
        open={editView !== null}
        onClose={() => setEditView(null)}
        view={editView}
        onRenamed={handleRenamed}
        onDeleted={handleDeleted}
      />
    </>
  );
}
