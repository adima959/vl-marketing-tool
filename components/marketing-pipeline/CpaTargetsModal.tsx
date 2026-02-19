'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, InputNumber, App } from 'antd';
import { GEO_CONFIG, CHANNEL_CONFIG } from '@/types';
import type { Product, Geography, Channel, CpaTarget } from '@/types';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './CpaTargetsModal.module.css';

const GEOS: Geography[] = ['NO', 'SE', 'DK'];
const CHANNELS: Channel[] = ['meta', 'google', 'taboola'];

interface CpaTargetsModalProps {
  open: boolean;
  product: Product;
  onClose: () => void;
  onSave: () => void;
}

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

export function CpaTargetsModal({ open, product, onClose, onSave }: CpaTargetsModalProps): React.ReactNode {
  const { message } = App.useApp();
  const [grid, setGrid] = useState<TargetGrid>(() => initGrid(product.cpaTargets));
  const [saving, setSaving] = useState(false);

  // Re-init grid when product or open changes
  useEffect(() => {
    if (open) {
      setGrid(initGrid(product.cpaTargets));
    }
  }, [open, product.id, product.cpaTargets]);

  const handleChange = useCallback((geo: Geography, channel: Channel, value: number | null) => {
    setGrid(prev => ({ ...prev, [buildGridKey(geo, channel)]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const targets: { geo: Geography; channel: Channel; target: number }[] = [];
      for (const geo of GEOS) {
        for (const ch of CHANNELS) {
          const val = grid[buildGridKey(geo, ch)];
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

      message.success('CPA targets saved');
      onSave();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save CPA targets');
    } finally {
      setSaving(false);
    }
  }, [grid, product.id, message, onSave, onClose]);

  return (
    <Modal
      open={open}
      title={`CPA Targets — ${product.name}`}
      className={modalStyles.modal}
      onCancel={onClose}
      onOk={handleSave}
      okText="Save"
      confirmLoading={saving}
      width={480}
      destroyOnHidden
    >
      <p className={styles.subtitle}>
        Set target CPA (NOK) per geo and network. Empty cells mean no target (health shows gray).
      </p>
      <div className={styles.grid}>
        {/* Header row */}
        <div className={styles.headerRow}>
          <div className={styles.headerCell} />
          {CHANNELS.map(ch => (
            <div key={ch} className={styles.headerCell}>
              {CHANNEL_CONFIG[ch].label}
            </div>
          ))}
        </div>

        {/* Geo rows */}
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
    </Modal>
  );
}
