'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dropdown, Button, Popconfirm } from 'antd';
import { Star, Trash2, Plus } from 'lucide-react';
import { fetchSavedViews, deleteSavedView } from '@/lib/api/savedViewsClient';
import { resolveViewParams } from '@/lib/savedViews';
import { SaveViewModal } from '@/components/saved-views/SaveViewModal';
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

export function SavedViewsDropdown({ pagePath, onApplyView, getCurrentState }: SavedViewsDropdownProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
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

  const handleDelete = async (viewId: string) => {
    try {
      await deleteSavedView(viewId);
      setViews((prev) => prev.filter((v) => v.id !== viewId));
    } catch (err) {
      console.warn('Failed to delete saved view:', err);
    }
  };

  const handleSaveNew = () => {
    setDropdownOpen(false);
    setSaveModalOpen(true);
  };


  const menuItems = [
    ...views.map((view) => ({
      key: view.id,
      label: (
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 200 }}
        >
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {view.name}
          </div>
          <Popconfirm
            title="Delete this view?"
            onConfirm={() => handleDelete(view.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            placement="right"
          >
            <button
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-gray-400)',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = '#fef2f2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-gray-400)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Trash2 size={14} />
            </button>
          </Popconfirm>
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
    </>
  );
}
