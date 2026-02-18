'use client';

import { useState, useEffect, useRef } from 'react';
import { Select, Spin } from 'antd';
import type { Geography } from '@/types';
import { formatNok } from '@/lib/marketing-pipeline/cpaUtils';
import styles from './GeoTracksSection.module.css';

export interface AdCampaignOption {
  campaignId: string;
  campaignName: string;
  network: string;
  totalSpend: number;
  totalClicks: number;
}

interface InlineCampaignSelectProps {
  productId?: string;
  geo: Geography;
  excludeExternalIds?: Set<string>;
  onSelect: (option: AdCampaignOption) => void;
  onCancel: () => void;
}

export function InlineCampaignSelect({ productId, geo, excludeExternalIds, onSelect, onCancel }: InlineCampaignSelectProps): React.ReactNode {
  const [options, setOptions] = useState<AdCampaignOption[]>([]);
  const [loading, setLoading] = useState(false);
  const didFetch = useRef(false);

  useEffect(() => {
    if (!productId || didFetch.current) return;
    didFetch.current = true;
    setLoading(true);
    const params = new URLSearchParams({ productId, geo });
    fetch('/api/marketing-pipeline/campaigns/search?' + params.toString())
      .then(r => r.json())
      .then(json => {
        if (json.success) setOptions(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, geo]);

  const filteredOptions = excludeExternalIds?.size
    ? options.filter(o => !excludeExternalIds.has(o.campaignId))
    : options;

  return (
    <div className={styles.inlineCampaignSelect}>
      <Select
        showSearch
        autoFocus
        open
        placeholder={loading ? 'Loading campaigns...' : 'Search campaigns...'}
        loading={loading}
        disabled={loading}
        style={{ width: '100%' }}
        notFoundContent={loading ? <Spin size="small" /> : 'No campaigns found for this product + geo'}
        filterOption={(input, option) => {
          if (!option) return false;
          const search = (option as { searchText?: string }).searchText ?? '';
          return search.toLowerCase().includes(input.toLowerCase());
        }}
        onSelect={(value: string) => {
          const match = filteredOptions.find(o => o.campaignId === value);
          if (match) onSelect(match);
        }}
        onBlur={onCancel}
        optionLabelProp="label"
        options={filteredOptions.map(c => ({
          value: c.campaignId,
          label: c.campaignName,
          searchText: c.campaignName + ' ' + c.campaignId,
          title: c.campaignId,
        }))}
        optionRender={(option) => {
          const match = filteredOptions.find(o => o.campaignId === option.value);
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {match?.campaignName ?? option.value}
              </span>
              {match && match.totalSpend > 0 && (
                <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--color-gray-500)' }}>
                  {formatNok(match.totalSpend)}
                </span>
              )}
            </div>
          );
        }}
        virtual={false}
      />
    </div>
  );
}
