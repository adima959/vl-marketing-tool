'use client';

import { Tabs, Select } from 'antd';
import { useState, useEffect } from 'react';
import { Geography, GEO_CONFIG } from '@/types';

interface GeoTabsProps {
  activeGeo: Geography | 'all';
  onChange: (geo: Geography | 'all') => void;
  showAll?: boolean;
  mode?: 'tabs' | 'dropdown';
}

const STORAGE_KEY = 'marketing-tracker-geo-view-mode';

export function GeoTabs({ activeGeo, onChange, showAll = true, mode: propMode }: GeoTabsProps) {
  const [mode, setMode] = useState<'tabs' | 'dropdown'>(propMode || 'tabs');

  // Load preference from localStorage
  useEffect(() => {
    if (!propMode) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'tabs' || saved === 'dropdown') {
        setMode(saved);
      }
    }
  }, [propMode]);

  // Save preference to localStorage
  const handleModeChange = (newMode: 'tabs' | 'dropdown') => {
    setMode(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  const geoOptions = [
    ...(showAll ? [{ value: 'all', label: 'All Geos' }] : []),
    ...Object.entries(GEO_CONFIG).map(([key, config]) => ({
      value: key,
      label: `${config.flag} ${config.label}`,
    })),
  ];

  if (mode === 'dropdown') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Select
          value={activeGeo}
          onChange={onChange}
          options={geoOptions}
          style={{ width: 140 }}
          size="small"
        />
        {!propMode && (
          <span
            onClick={() => handleModeChange('tabs')}
            style={{ fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            Switch to tabs
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Tabs
        activeKey={activeGeo}
        onChange={(key) => onChange(key as Geography | 'all')}
        size="small"
        items={geoOptions.map((opt) => ({
          key: opt.value,
          label: opt.label,
        }))}
      />
      {!propMode && (
        <span
          onClick={() => handleModeChange('dropdown')}
          style={{ fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'pointer' }}
        >
          Switch to dropdown
        </span>
      )}
    </div>
  );
}
