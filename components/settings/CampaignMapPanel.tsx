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
import styles from './data-maps.module.css';

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

export function CampaignMapPanel(): React.ReactNode {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unclassified, setUnclassified] = useState<UnclassifiedCampaign[]>([]);
  const [classified, setClassified] = useState<ClassifiedCampaign[]>([]);
  const [ignored, setIgnored] = useState<IgnoredCampaign[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('unclassified');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-match campaigns');
    } finally {
      setAutoMatching(false);
    }
  };

  const activeProductGroup = activeCategory !== 'unclassified' && activeCategory !== 'ignored'
    ? productGroups.find((g) => g.product.id === activeCategory)
    : null;

  const contentTitle = activeCategory === 'unclassified'
    ? 'Unclassified'
    : activeCategory === 'ignored'
      ? 'Ignored'
      : activeProductGroup?.product.name ?? '';

  const activeCount = activeCategory === 'unclassified'
    ? unclassified.length
    : activeCategory === 'ignored'
      ? ignored.length
      : activeProductGroup?.campaigns.length ?? 0;

  return (
    <div className={styles.layout}>
      {/* Left: category sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Categories</span>
        </div>
        <div className={styles.sidebarList}>
          <button
            className={`${styles.sidebarItem} ${activeCategory === 'unclassified' ? styles.sidebarItemActive : ''}`}
            onClick={() => setActiveCategory('unclassified')}
          >
            Unclassified
            <span className={styles.sidebarCount}>{unclassified.length}</span>
          </button>
          {ignored.length > 0 && (
            <button
              className={`${styles.sidebarItem} ${activeCategory === 'ignored' ? styles.sidebarItemActive : ''}`}
              onClick={() => setActiveCategory('ignored')}
            >
              Ignored
              <span className={styles.sidebarCount}>{ignored.length}</span>
            </button>
          )}
          {productGroups.map((g) => (
            <button
              key={g.product.id}
              className={`${styles.sidebarItem} ${activeCategory === g.product.id ? styles.sidebarItemActive : ''}`}
              onClick={() => setActiveCategory(g.product.id)}
            >
              <span className={styles.sidebarDot} style={{ backgroundColor: g.product.color }} />
              {g.product.name}
              <span className={styles.sidebarCount}>{g.campaigns.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: content */}
      <div className={styles.content}>
        <div className={styles.contentHeader}>
          <div className={styles.contentHeaderLeft}>
            <span className={styles.contentTitle}>{contentTitle}</span>
            <span className={styles.contentCount}>{activeCount} campaigns</span>
          </div>
          {activeCategory === 'unclassified' && unclassified.length > 0 && (
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={autoMatching}
              onClick={handleAutoMatch}
            >
              Auto-match
            </Button>
          )}
        </div>

        <div className={styles.itemList}>
          {error && <div className={styles.error}>{error}</div>}

          {loading ? (
            <div className={styles.loadingState}><Spin /></div>
          ) : activeCategory === 'unclassified' ? (
            unclassified.length === 0 ? (
              <div className={styles.emptyState}>All campaigns are classified</div>
            ) : (
              unclassified.map((campaign) => {
                const draft = drafts[campaign.campaignId] || { countryCode: null, productId: null };
                const canSave = draft.countryCode && draft.productId;
                const isSaving = savingId === campaign.campaignId;
                const isIgnoring = ignoringId === campaign.campaignId;

                return (
                  <div key={campaign.campaignId} className={styles.itemRow}>
                    <Tooltip title={campaign.campaignName}>
                      <span className={styles.itemName}>{campaign.campaignName}</span>
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
                        virtual={false}
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
          ) : activeCategory === 'ignored' ? (
            ignored.length === 0 ? (
              <div className={styles.emptyState}>No ignored campaigns</div>
            ) : (
              ignored.map((item) => (
                <div key={item.id} className={styles.itemRow}>
                  <Tooltip title={item.campaignName}>
                    <span className={styles.itemName}>{item.campaignName}</span>
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
                <div key={item.id} className={styles.itemRow}>
                  <Tooltip title={item.campaignName}>
                    <span className={styles.itemName}>{item.campaignName}</span>
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
        </div>
      </div>
    </div>
  );
}
