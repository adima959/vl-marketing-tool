'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, Input, Radio, Select, Switch } from 'antd';
import { Star } from 'lucide-react';
import { createSavedView, toggleFavorite } from '@/lib/api/savedViewsClient';
import { detectDatePreset, DATE_PRESET_LABELS } from '@/lib/savedViews';
import { formatLocalDate } from '@/lib/types/api';
import { ALL_DIMENSIONS } from '@/config/dimensions';
import { ALL_DASHBOARD_DIMENSIONS } from '@/config/dashboardDimensions';
import { ALL_ON_PAGE_DIMENSIONS } from '@/config/onPageDimensions';
import { ALL_VALIDATION_RATE_DIMENSIONS } from '@/config/validationRateDimensions';
import type { DatePreset, DateMode } from '@/types/savedViews';
import modalStyles from '@/styles/components/modal.module.css';

const ALL_KNOWN_DIMENSIONS = [
  ...ALL_DIMENSIONS,
  ...ALL_DASHBOARD_DIMENSIONS,
  ...ALL_ON_PAGE_DIMENSIONS,
  ...ALL_VALIDATION_RATE_DIMENSIONS,
];

function getDimensionLabel(id: string): string {
  const dim = ALL_KNOWN_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
}

interface CurrentState {
  dateRange?: { start: Date; end: Date };
  dimensions?: string[];
  filters?: { field: string; operator: string; value: string }[];
  sortBy?: string | null;
  sortDir?: 'ascend' | 'descend' | null;
  period?: 'weekly' | 'biweekly' | 'monthly' | null;
  visibleColumns?: string[];
  totalColumns?: number;
  suggestedName?: string;
}

interface SaveViewModalProps {
  open: boolean;
  onClose: () => void;
  pagePath: string;
  currentState: CurrentState;
  onSaved: () => void;
}

const presetOptions = Object.entries(DATE_PRESET_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function SaveViewModal({ open, onClose, pagePath, currentState, onSaved }: SaveViewModalProps) {
  const [name, setName] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('relative');
  const [datePreset, setDatePreset] = useState<DatePreset | undefined>();
  const [addToSidebar, setAddToSidebar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDates = !!currentState.dateRange;

  const detectedPreset = useMemo(
    () => hasDates ? detectDatePreset(currentState.dateRange!.start, currentState.dateRange!.end) : null,
    [hasDates, currentState.dateRange?.start, currentState.dateRange?.end]
  );

  const autoName = useMemo(() => {
    const parts: string[] = [];
    if (currentState.dimensions?.length) {
      parts.push(currentState.dimensions.map(getDimensionLabel).join(', '));
    }
    if (hasDates) {
      if (dateMode === 'relative' && datePreset) {
        parts.push(DATE_PRESET_LABELS[datePreset]);
      } else {
        const start = formatLocalDate(currentState.dateRange!.start);
        const end = formatLocalDate(currentState.dateRange!.end);
        parts.push(start === end ? start : `${start} — ${end}`);
      }
    }
    return parts.join(' — ') || currentState.suggestedName || 'Saved view';
  }, [currentState.dimensions, currentState.dateRange, currentState.suggestedName, hasDates, dateMode, datePreset]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setName('');
      setAddToSidebar(false);
      setError(null);
      setSaving(false);
      if (!hasDates) {
        setDateMode('none');
        setDatePreset(undefined);
      } else if (detectedPreset) {
        setDateMode('relative');
        setDatePreset(detectedPreset);
      } else {
        setDateMode('absolute');
        setDatePreset(undefined);
      }
    }
  }, [open, detectedPreset, hasDates]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const created = await createSavedView({
        name: name.trim() || autoName,
        pagePath,
        dateMode,
        ...(dateMode === 'relative'
          ? { datePreset }
          : dateMode === 'absolute'
            ? {
                dateStart: formatLocalDate(currentState.dateRange!.start),
                dateEnd: formatLocalDate(currentState.dateRange!.end),
              }
            : {}),
        ...(currentState.dimensions && { dimensions: currentState.dimensions }),
        ...(currentState.filters?.length && { filters: currentState.filters }),
        ...(currentState.sortBy && { sortBy: currentState.sortBy }),
        ...(currentState.sortDir && { sortDir: currentState.sortDir }),
        ...(currentState.period && { period: currentState.period }),
        ...(currentState.visibleColumns && { visibleColumns: currentState.visibleColumns }),
      });

      if (addToSidebar) {
        await toggleFavorite(created.id, true);
        window.dispatchEvent(new Event('favorites-changed'));
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save view');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Save Current View"
      open={open}
      onOk={handleSave}
      onCancel={onClose}
      okText="Save"
      confirmLoading={saving}
      okButtonProps={{ disabled: dateMode === 'relative' && !datePreset }}
      width={400}
      destroyOnHidden
      className={modalStyles.modal}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
            Name
          </label>
          <Input
            placeholder={autoName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleSave}
            maxLength={100}
            autoFocus
          />
        </div>

        {currentState.dimensions && currentState.dimensions.length > 0 && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
              Dimensions
            </label>
            <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {currentState.dimensions.map((dim, i) => (
                <span key={dim} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 && <span style={{ color: '#d1d5db' }}>→</span>}
                  <span style={{ padding: '2px 8px', background: '#f5f6f7', borderRadius: 4 }}>{getDimensionLabel(dim)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {currentState.filters && currentState.filters.length > 0 && (
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            <span style={{ fontWeight: 500, color: '#374151' }}>Filters: </span>
            {currentState.filters.length} active {currentState.filters.length === 1 ? 'filter' : 'filters'}
          </div>
        )}

        {currentState.visibleColumns && currentState.totalColumns && currentState.visibleColumns.length < currentState.totalColumns && (
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            <span style={{ fontWeight: 500, color: '#374151' }}>Columns: </span>
            {currentState.visibleColumns.length} of {currentState.totalColumns} visible
          </div>
        )}

        {hasDates && (
          <>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                Date Range
              </label>
              <Radio.Group
                value={dateMode}
                onChange={(e) => setDateMode(e.target.value)}
                style={{ display: 'flex', gap: 16 }}
              >
                <Radio value="relative">Relative</Radio>
                <Radio value="absolute">Absolute</Radio>
              </Radio.Group>
            </div>

            {dateMode === 'relative' ? (
              <Select
                placeholder="Select a date preset"
                value={datePreset}
                onChange={(val) => setDatePreset(val)}
                options={presetOptions}
                style={{ width: '100%' }}
              />
            ) : (
              <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 12px', background: '#f5f6f7', borderRadius: 6 }}>
                {formatLocalDate(currentState.dateRange!.start)} — {formatLocalDate(currentState.dateRange!.end)}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={14} style={{ color: 'var(--color-primary-500)' }} fill={addToSidebar ? 'var(--color-primary-500)' : 'none'} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Add to sidebar</span>
          </div>
          <Switch size="small" checked={addToSidebar} onChange={setAddToSidebar} />
        </div>

        {error && (
          <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div>
        )}
      </div>
    </Modal>
  );
}
