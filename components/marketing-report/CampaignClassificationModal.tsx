'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, Button, Spin, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  fetchCampaignClassifications,
  classifyCampaign,
  ignoreCampaign,
  autoMatchCampaigns,
  unclassifyCampaign,
} from '@/lib/api/campaignClassificationsClient';
import type {
  ClassifiedCampaign,
  IgnoredCampaign,
  UnclassifiedCampaign,
  ProductOption,
} from '@/lib/api/campaignClassificationsClient';
import { SidebarModal } from '@/components/ui/SidebarModal';
import type { SidebarModalItem } from '@/components/ui/SidebarModal';
import styles from './CampaignClassificationModal.module.css';

interface CampaignClassificationModalProps {
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

const COUNTRY_OPTIONS = [
  { value: 'NO', label: 'NO' },
  { value: 'SE', label: 'SE' },
  { value: 'DK', label: 'DK' },
  { value: 'FI', label: 'FI' },
];

interface RowDraft {
  countryCode: string | null;
  productId: string | null;
}

export function CampaignClassificationModal({
  open,
  onClose,
  onCountChange,
}: CampaignClassificationModalProps): React.ReactNode {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unclassified, setUnclassified] = useState<UnclassifiedCampaign[]>([]);
  const [classified, setClassified] = useState<ClassifiedCampaign[]>([]);
  const [ignored, setIgnored] = useState<IgnoredCampaign[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [activeTab, setActiveTab] = useState<string>('unclassified');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCampaignClassifications();
      setUnclassified(data.unclassified);
      setClassified(data.classified);
      setIgnored(data.ignored);
      setProducts(data.products);
      onCountChange?.(data.unclassified.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (open) {
      loadData();
      setActiveTab('unclassified');
      setDrafts({});
    }
  }, [open, loadData]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, { product: ProductOption; campaigns: ClassifiedCampaign[] }>();
    for (const item of classified) {
      if (!groups.has(item.productId)) {
        groups.set(item.productId, {
          product: { id: item.productId, name: item.productName, color: item.productColor },
          campaigns: [],
        });
      }
      groups.get(item.productId)!.campaigns.push(item);
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.product.name.localeCompare(b.product.name)
    );
  }, [classified]);

  const sidebarItems = useMemo((): SidebarModalItem[] => [
    { key: 'unclassified', label: 'Unclassified', count: unclassified.length },
    ...(ignored.length > 0 ? [{ key: 'ignored', label: 'Ignored', count: ignored.length }] : []),
    ...productGroups.map((g) => ({
      key: g.product.id,
      label: g.product.name,
      color: g.product.color,
      count: g.campaigns.length,
    })),
  ], [unclassified.length, ignored.length, productGroups]);

  const handleDraftChange = (campaignId: string, field: 'countryCode' | 'productId', value: string): void => {
    setDrafts((prev) => ({
      ...prev,
      [campaignId]: { ...prev[campaignId], [field]: value },
    }));
  };

  const handleClassify = async (campaign: UnclassifiedCampaign): Promise<void> => {
    const draft = drafts[campaign.campaignId];
    if (!draft?.countryCode || !draft?.productId) return;

    setSavingId(campaign.campaignId);
    try {
      const result = await classifyCampaign(campaign.campaignId, draft.productId, draft.countryCode);
      setUnclassified((prev) => prev.filter((c) => c.campaignId !== campaign.campaignId));
      setClassified((prev) => [...prev, result]);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[campaign.campaignId];
        return next;
      });
      onCountChange?.(unclassified.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to classify campaign');
    } finally {
      setSavingId(null);
    }
  };

  const handleIgnore = async (campaign: UnclassifiedCampaign): Promise<void> => {
    setIgnoringId(campaign.campaignId);
    try {
      const result = await ignoreCampaign(campaign.campaignId);
      setUnclassified((prev) => prev.filter((c) => c.campaignId !== campaign.campaignId));
      setIgnored((prev) => [...prev, result].sort((a, b) => a.campaignName.localeCompare(b.campaignName)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[campaign.campaignId];
        return next;
      });
      onCountChange?.(unclassified.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ignore campaign');
    } finally {
      setIgnoringId(null);
    }
  };

  const handleUnignore = async (item: IgnoredCampaign): Promise<void> => {
    setRemovingId(item.id);
    try {
      const campaignId = await unclassifyCampaign(item.id);
      setIgnored((prev) => prev.filter((i) => i.id !== item.id));
      setUnclassified((prev) =>
        [...prev, { campaignId, campaignName: item.campaignName }].sort((a, b) =>
          a.campaignName.localeCompare(b.campaignName)
        )
      );
      onCountChange?.(unclassified.length + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unignore campaign');
    } finally {
      setRemovingId(null);
    }
  };

  const handleUnclassify = async (item: ClassifiedCampaign): Promise<void> => {
    setRemovingId(item.id);
    try {
      const campaignId = await unclassifyCampaign(item.id);
      setClassified((prev) => prev.filter((c) => c.id !== item.id));
      setUnclassified((prev) =>
        [...prev, { campaignId, campaignName: item.campaignName }].sort((a, b) =>
          a.campaignName.localeCompare(b.campaignName)
        )
      );
      onCountChange?.(unclassified.length + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove classification');
    } finally {
      setRemovingId(null);
    }
  };

  const handleAutoMatch = async (): Promise<void> => {
    setAutoMatching(true);
    setError(null);
    try {
      const result = await autoMatchCampaigns();
      if (result.matchedCount > 0) {
        const matchedIds = new Set(result.matched.map((m) => m.campaignId));
        setUnclassified((prev) => prev.filter((c) => !matchedIds.has(c.campaignId)));
        setClassified((prev) => [...prev, ...result.matched]);
        onCountChange?.(unclassified.length - result.matchedCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-match campaigns');
    } finally {
      setAutoMatching(false);
    }
  };

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: (
          <span>
            <span className={styles.productDot} style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
        ),
      })),
    [products]
  );

  const activeProductGroup = activeTab !== 'unclassified' && activeTab !== 'ignored'
    ? productGroups.find((g) => g.product.id === activeTab)
    : null;

  const contentTitle = activeTab === 'unclassified'
    ? 'Unclassified'
    : activeTab === 'ignored'
      ? 'Ignored'
      : activeProductGroup?.product.name ?? '';

  const activeCount = activeTab === 'unclassified'
    ? unclassified.length
    : activeTab === 'ignored'
      ? ignored.length
      : activeProductGroup?.campaigns.length ?? 0;

  return (
    <SidebarModal
      open={open}
      onClose={onClose}
      title="Campaign Classification"
      width={900}
      sidebar={{
        title: 'Categories',
        items: sidebarItems,
        activeKey: activeTab,
        onSelect: setActiveTab,
      }}
      contentTitle={contentTitle}
      contentExtra={`${activeCount} campaigns`}
      contentActions={
        activeTab === 'unclassified' && unclassified.length > 0 ? (
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={autoMatching}
            onClick={handleAutoMatch}
          >
            Auto-match
          </Button>
        ) : undefined
      }
    >
      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>
          <Spin />
        </div>
      ) : activeTab === 'unclassified' ? (
        unclassified.length === 0 ? (
          <div className={styles.emptyState}>All campaigns are classified</div>
        ) : (
          unclassified.map((campaign) => {
            const draft = drafts[campaign.campaignId] || { countryCode: null, productId: null };
            const canSave = draft.countryCode && draft.productId;
            const isSaving = savingId === campaign.campaignId;
            const isIgnoring = ignoringId === campaign.campaignId;

            return (
              <div key={campaign.campaignId} className={styles.campaignRow}>
                <Tooltip title={campaign.campaignName}>
                  <span className={styles.campaignName}>{campaign.campaignName}</span>
                </Tooltip>
                <div className={styles.selectWrap}>
                  <Select
                    size="small"
                    placeholder="Country"
                    options={COUNTRY_OPTIONS}
                    value={draft.countryCode}
                    onChange={(val) => handleDraftChange(campaign.campaignId, 'countryCode', val)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className={styles.productSelectWrap}>
                  <Select
                    size="small"
                    placeholder="Product"
                    options={productOptions}
                    value={draft.productId}
                    onChange={(val) => handleDraftChange(campaign.campaignId, 'productId', val)}
                    style={{ width: '100%' }}
                    popupMatchSelectWidth={false}
                  />
                </div>
                <Button
                  className={styles.classifyBtn}
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={!canSave || isSaving}
                  loading={isSaving}
                  onClick={() => handleClassify(campaign)}
                />
                <Tooltip title="Ignore">
                  <Button
                    className={styles.ignoreBtn}
                    type="text"
                    size="small"
                    icon={<StopOutlined />}
                    loading={isIgnoring}
                    disabled={isSaving}
                    onClick={() => handleIgnore(campaign)}
                  />
                </Tooltip>
              </div>
            );
          })
        )
      ) : activeTab === 'ignored' ? (
        ignored.length === 0 ? (
          <div className={styles.emptyState}>No ignored campaigns</div>
        ) : (
          ignored.map((item) => (
            <div key={item.id} className={styles.classifiedRow}>
              <Tooltip title={item.campaignName}>
                <span className={styles.campaignName}>{item.campaignName}</span>
              </Tooltip>
              <Button
                className={styles.removeBtn}
                type="text"
                size="small"
                icon={<CloseOutlined />}
                danger
                loading={removingId === item.id}
                onClick={() => handleUnignore(item)}
              />
            </div>
          ))
        )
      ) : activeProductGroup ? (
        activeProductGroup.campaigns.length === 0 ? (
          <div className={styles.emptyState}>No campaigns classified under this product</div>
        ) : (
          activeProductGroup.campaigns.map((item) => (
            <div key={item.id} className={styles.classifiedRow}>
              <Tooltip title={item.campaignName}>
                <span className={styles.campaignName}>{item.campaignName}</span>
              </Tooltip>
              <span className={styles.countryBadge}>{item.countryCode}</span>
              <Button
                className={styles.removeBtn}
                type="text"
                size="small"
                icon={<CloseOutlined />}
                danger
                loading={removingId === item.id}
                onClick={() => handleUnclassify(item)}
              />
            </div>
          ))
        )
      ) : (
        <div className={styles.emptyState}>Select a category</div>
      )}
    </SidebarModal>
  );
}
