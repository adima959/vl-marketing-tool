'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Select, Button, Spin, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  fetchUrlClassifications,
  classifyUrl,
  ignoreUrl,
  autoMatchUrls,
  unclassifyUrl,
} from '@/lib/api/urlClassificationsClient';
import type { ClassifiedUrl, IgnoredUrl, ProductOption } from '@/lib/api/urlClassificationsClient';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './UrlClassificationModal.module.css';

interface UrlClassificationModalProps {
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

const COUNTRY_OPTIONS = [
  { value: 'NO', label: '🇳🇴 NO' },
  { value: 'SE', label: '🇸🇪 SE' },
  { value: 'DK', label: '🇩🇰 DK' },
  { value: 'FI', label: '🇫🇮 FI' },
];

/** Per-row local state for country/product selection */
interface RowDraft {
  countryCode: string | null;
  productId: string | null;
}

export function UrlClassificationModal({
  open,
  onClose,
  onCountChange,
}: UrlClassificationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unclassified, setUnclassified] = useState<string[]>([]);
  const [classified, setClassified] = useState<ClassifiedUrl[]>([]);
  const [ignored, setIgnored] = useState<IgnoredUrl[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [activeTab, setActiveTab] = useState<string>('unclassified');
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [ignoringUrl, setIgnoringUrl] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);

  // Per-row draft selections keyed by url_path
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUrlClassifications();
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

  // Group classified URLs by product for tabs
  const productGroups = useMemo(() => {
    const groups = new Map<string, { product: ProductOption; urls: ClassifiedUrl[] }>();
    for (const item of classified) {
      if (!groups.has(item.productId)) {
        groups.set(item.productId, {
          product: { id: item.productId, name: item.productName, color: item.productColor },
          urls: [],
        });
      }
      groups.get(item.productId)!.urls.push(item);
    }
    // Sort by product name
    return Array.from(groups.values()).sort((a, b) =>
      a.product.name.localeCompare(b.product.name)
    );
  }, [classified]);

  const handleDraftChange = (urlPath: string, field: 'countryCode' | 'productId', value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [urlPath]: { ...prev[urlPath], [field]: value },
    }));
  };

  const handleClassify = async (urlPath: string) => {
    const draft = drafts[urlPath];
    if (!draft?.countryCode || !draft?.productId) return;

    setSavingUrl(urlPath);
    try {
      const result = await classifyUrl(urlPath, draft.productId, draft.countryCode);
      // Optimistic update
      setUnclassified((prev) => prev.filter((u) => u !== urlPath));
      setClassified((prev) => [...prev, result]);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[urlPath];
        return next;
      });
      onCountChange?.(unclassified.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to classify URL');
    } finally {
      setSavingUrl(null);
    }
  };

  const handleIgnore = async (urlPath: string) => {
    setIgnoringUrl(urlPath);
    try {
      const result = await ignoreUrl(urlPath);
      setUnclassified((prev) => prev.filter((u) => u !== urlPath));
      setIgnored((prev) => [...prev, result].sort((a, b) => a.urlPath.localeCompare(b.urlPath)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[urlPath];
        return next;
      });
      onCountChange?.(unclassified.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ignore URL');
    } finally {
      setIgnoringUrl(null);
    }
  };

  const handleUnignore = async (item: IgnoredUrl) => {
    setRemovingId(item.id);
    try {
      const urlPath = await unclassifyUrl(item.id);
      setIgnored((prev) => prev.filter((i) => i.id !== item.id));
      setUnclassified((prev) => [...prev, urlPath].sort());
      onCountChange?.(unclassified.length + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unignore URL');
    } finally {
      setRemovingId(null);
    }
  };

  const handleUnclassify = async (item: ClassifiedUrl) => {
    setRemovingId(item.id);
    try {
      const urlPath = await unclassifyUrl(item.id);
      // Optimistic update
      setClassified((prev) => prev.filter((c) => c.id !== item.id));
      setUnclassified((prev) => [...prev, urlPath].sort());
      onCountChange?.(unclassified.length + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove classification');
    } finally {
      setRemovingId(null);
    }
  };

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    setError(null);
    try {
      const result = await autoMatchUrls();
      if (result.matchedCount > 0) {
        // Remove matched URLs from unclassified, add to classified
        const matchedPaths = new Set(result.matched.map((m) => m.urlPath));
        setUnclassified((prev) => prev.filter((u) => !matchedPaths.has(u)));
        setClassified((prev) => [...prev, ...result.matched]);
        onCountChange?.(unclassified.length - result.matchedCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-match URLs');
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

  // Active tab content
  const activeProductGroup = activeTab !== 'unclassified'
    ? productGroups.find((g) => g.product.id === activeTab)
    : null;

  return (
    <Modal
      title="URL Path Classification"
      open={open}
      onCancel={onClose}
      width={800}
      centered
      footer={null}
      className={`${modalStyles.modal} ${styles.modal}`}
    >
      {/* Custom header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>URL Path Classification</span>
          <span className={styles.subtitle}>
            {unclassified.length} unclassified
          </span>
        </div>
        {unclassified.length > 0 && (
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

      {error && <div className={styles.error}>{error}</div>}

      {/* Tabs */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${activeTab === 'unclassified' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('unclassified')}
        >
          Unclassified
          <span className={styles.tabCount}>{unclassified.length}</span>
        </button>
        {ignored.length > 0 && (
          <button
            className={`${styles.tab} ${activeTab === 'ignored' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('ignored')}
          >
            Ignored
            <span className={styles.tabCount}>{ignored.length}</span>
          </button>
        )}
        {productGroups.map((group) => (
          <button
            key={group.product.id}
            className={`${styles.tab} ${activeTab === group.product.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(group.product.id)}
          >
            <span className={styles.tabDot} style={{ backgroundColor: group.product.color }} />
            {group.product.name}
            <span className={styles.tabCount}>{group.urls.length}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingState}>
            <Spin />
          </div>
        ) : activeTab === 'unclassified' ? (
          unclassified.length === 0 ? (
            <div className={styles.emptyState}>All URL paths are classified</div>
          ) : (
            unclassified.map((urlPath) => {
              const draft = drafts[urlPath] || { countryCode: null, productId: null };
              const canSave = draft.countryCode && draft.productId;
              const isSaving = savingUrl === urlPath;
              const isIgnoring = ignoringUrl === urlPath;

              return (
                <div key={urlPath} className={styles.urlRow}>
                  <Tooltip title={urlPath}>
                    <span className={styles.urlPath}>{urlPath}</span>
                  </Tooltip>
                  <div className={styles.selectWrap}>
                    <Select
                      size="small"
                      placeholder="Country"
                      options={COUNTRY_OPTIONS}
                      value={draft.countryCode}
                      onChange={(val) => handleDraftChange(urlPath, 'countryCode', val)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className={styles.productSelectWrap}>
                    <Select
                      size="small"
                      placeholder="Product"
                      options={productOptions}
                      value={draft.productId}
                      onChange={(val) => handleDraftChange(urlPath, 'productId', val)}
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
                    onClick={() => handleClassify(urlPath)}
                  />
                  <Tooltip title="Ignore">
                    <Button
                      className={styles.ignoreBtn}
                      type="text"
                      size="small"
                      icon={<StopOutlined />}
                      loading={isIgnoring}
                      disabled={isSaving}
                      onClick={() => handleIgnore(urlPath)}
                    />
                  </Tooltip>
                </div>
              );
            })
          )
        ) : activeTab === 'ignored' ? (
          ignored.length === 0 ? (
            <div className={styles.emptyState}>No ignored URLs</div>
          ) : (
            ignored.map((item) => (
              <div key={item.id} className={styles.classifiedRow}>
                <Tooltip title={item.urlPath}>
                  <span className={styles.urlPath}>{item.urlPath}</span>
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
          activeProductGroup.urls.length === 0 ? (
            <div className={styles.emptyState}>No URLs classified under this product</div>
          ) : (
            activeProductGroup.urls.map((item) => (
              <div key={item.id} className={styles.classifiedRow}>
                <Tooltip title={item.urlPath}>
                  <span className={styles.urlPath}>{item.urlPath}</span>
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
          <div className={styles.emptyState}>Select a tab</div>
        )}
      </div>
    </Modal>
  );
}
