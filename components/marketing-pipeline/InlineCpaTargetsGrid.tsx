'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { InputNumber, App } from 'antd';
import { GEO_CONFIG, CHANNEL_CONFIG } from '@/types';
import type { Product, Geography, Channel, CpaTarget } from '@/types';
import type { SaveStatus } from '@/components/ui/NotionEditor';
import { usePipelineStore } from '@/stores/pipelineStore';
import styles from './CpaTargetsModal.module.css';

const GEOS: Geography[] = ['NO', 'SE', 'DK', 'FI'];
const CHANNELS: Channel[] = ['meta', 'google', 'taboola'];

type TargetGrid = Record<string, number | null>;

function buildGridKey(geo: Geography, channel: Channel): string {
  return `${geo}:${channel}`;
}

function initGrid(cpaTargets: CpaTarget[] | undefined): TargetGrid {
  const grid: TargetGrid = {};
  for (const geo of GEOS) {
    for (const ch of CHANNELS) {
      grid[buildGridKey(geo, ch)] = null;
    }
  }
  if (cpaTargets) {
    for (const t of cpaTargets) {
      const key = buildGridKey(t.geo, t.channel);
      if (key in grid) {
        grid[key] = t.target;
      }
    }
  }
  return grid;
}

interface InlineCpaTargetsGridProps {
  product: Product;
  onStatusChange?: (status: SaveStatus) => void;
}

export function InlineCpaTargetsGrid({ product, onStatusChange }: InlineCpaTargetsGridProps): React.ReactNode {
  const { message } = App.useApp();
  const loadPipeline = usePipelineStore(s => s.loadPipeline);
  const [grid, setGrid] = useState<TargetGrid>(() => initGrid(product.cpaTargets));
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(initGrid(product.cpaTargets)));
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);

  const setStatus = useCallback((status: SaveStatus) => {
    onStatusChangeRef.current?.(status);
  }, []);

  // Re-init grid when product CPA targets change externally
  useEffect(() => {
    const newGrid = initGrid(product.cpaTargets);
    setGrid(newGrid);
    lastSavedRef.current = JSON.stringify(newGrid);
  }, [product.id, product.cpaTargets]);

  const saveTargets = useCallback(async (currentGrid: TargetGrid) => {
    const serialized = JSON.stringify(currentGrid);
    if (serialized === lastSavedRef.current) return;

    setStatus('saving');
    try {
      const targets: { geo: Geography; channel: Channel; target: number }[] = [];
      for (const geo of GEOS) {
        for (const ch of CHANNELS) {
          const val = currentGrid[buildGridKey(geo, ch)];
          if (val != null && val > 0) {
            targets.push({ geo, channel: ch, target: val });
          }
        }
      }

      const res = await fetch(`/api/marketing-pipeline/products/${product.id}/cpa-targets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }

      lastSavedRef.current = serialized;
      setStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000);
      loadPipeline();
    } catch (err) {
      setStatus('error');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus('idle'), 3000);
      message.error(err instanceof Error ? err.message : 'Failed to save CPA targets');
    }
  }, [product.id, message, loadPipeline, setStatus]);

  // Keep a ref to the latest grid so the flush-on-unmount can access it
  const latestGridRef = useRef(grid);
  latestGridRef.current = grid;

  // Stable ref to saveTargets so the cleanup closure sees the latest version
  const saveTargetsRef = useRef(saveTargets);
  saveTargetsRef.current = saveTargets;

  const handleChange = useCallback((geo: Geography, channel: Channel, value: number | null) => {
    setGrid(prev => {
      const next = { ...prev, [buildGridKey(geo, channel)]: value };
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => saveTargets(next), 800);
      return next;
    });
  }, [saveTargets]);

  // Flush pending save on unmount (e.g. accordion closes) — don't lose data
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        // Fire the save immediately with the latest grid state
        saveTargetsRef.current(latestGridRef.current);
      }
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  return (
    <div className={styles.grid}>
      <div className={styles.headerRow}>
        <div className={styles.headerCell} />
        {CHANNELS.map(ch => (
          <div key={ch} className={styles.headerCell}>
            {CHANNEL_CONFIG[ch].label}
          </div>
        ))}
      </div>

      {GEOS.map(geo => (
        <div key={geo} className={styles.geoRow}>
          <div className={styles.geoLabel}>
            <span className={styles.geoFlag}>{GEO_CONFIG[geo].flag}</span>
            {GEO_CONFIG[geo].label}
          </div>
          {CHANNELS.map(ch => (
            <div key={ch} className={styles.targetCell}>
              <InputNumber
                value={grid[buildGridKey(geo, ch)]}
                onChange={(val) => handleChange(geo, ch, val)}
                placeholder="—"
                min={0}
                precision={0}
                controls={false}
                variant="borderless"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
