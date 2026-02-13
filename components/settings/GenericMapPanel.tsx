'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, Button, Spin, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, StopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import styles from './data-maps.module.css';

const COUNTRY_OPTIONS = [
  { value: 'NO', label: 'NO' },
  { value: 'SE', label: 'SE' },
  { value: 'DK', label: 'DK' },
  { value: 'FI', label: 'FI' },
];

export interface ProductOption {
  id: string;
  name: string;
  color: string;
}

interface RowDraft {
  countryCode: string | null;
  productId: string | null;
}

export interface ClassificationData<TUnclassified, TClassified, TIgnored> {
  unclassified: TUnclassified[];
  classified: TClassified[];
  ignored: TIgnored[];
  products: ProductOption[];
}

export interface AutoMatchResult<TClassified> {
  matchedCount: number;
  matched: TClassified[];
}

/** Wraps an async action with id-based loading state and error handling */
async function runIdAction(
  id: string,
  setLoadingId: (id: string | null) => void,
  action: () => Promise<void>,
  setError: (msg: string | null) => void,
  errorLabel: string,
): Promise<void> {
  setLoadingId(id);
  try {
    await action();
  } catch (err) {
    setError(err instanceof Error ? err.message : errorLabel);
  } finally {
    setLoadingId(null);
  }
}

export interface GenericMapPanelProps<TUnclassified, TClassified, TIgnored> {
  api: {
    fetchData: () => Promise<ClassificationData<TUnclassified, TClassified, TIgnored>>;
    classify: (itemId: string, productId: string, countryCode: string) => Promise<TClassified>;
    ignore: (itemId: string) => Promise<TIgnored>;
    autoMatch: () => Promise<AutoMatchResult<TClassified>>;
    unclassify: (id: string) => Promise<string>;
  };
  accessors: {
    unclassified: {
      getId: (item: TUnclassified) => string;
      getName: (item: TUnclassified) => string;
    };
    classified: {
      getId: (item: TClassified) => string;
      getItemId: (item: TClassified) => string;
      getName: (item: TClassified) => string;
      getProduct: (item: TClassified) => ProductOption;
      getCountry: (item: TClassified) => string;
    };
    ignored: {
      getId: (item: TIgnored) => string;
      getItemId: (item: TIgnored) => string;
      getName: (item: TIgnored) => string;
    };
    reconstructUnclassified: (itemId: string, name: string) => TUnclassified;
  };
  labels: { singular: string; plural: string };
  itemNameClass?: string;
}

export function GenericMapPanel<TUnclassified, TClassified, TIgnored>({
  api,
  accessors,
  labels,
  itemNameClass = styles.itemName,
}: GenericMapPanelProps<TUnclassified, TClassified, TIgnored>): React.ReactNode {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unclassified, setUnclassified] = useState<TUnclassified[]>([]);
  const [classified, setClassified] = useState<TClassified[]>([]);
  const [ignored, setIgnored] = useState<TIgnored[]>([]);
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
      const data = await api.fetchData();
      setUnclassified(data.unclassified);
      setClassified(data.classified);
      setIgnored(data.ignored);
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, { product: ProductOption; items: TClassified[] }>();
    for (const item of classified) {
      const product = accessors.classified.getProduct(item);
      if (!groups.has(product.id)) {
        groups.set(product.id, {
          product,
          items: [],
        });
      }
      groups.get(product.id)!.items.push(item);
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.product.name.localeCompare(b.product.name)
    );
  }, [classified, accessors.classified]);

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

  const handleDraftChange = (itemId: string, field: 'countryCode' | 'productId', value: string): void => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const removeDraft = (itemId: string): void => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  /** Move an unclassified item back into the sorted unclassified list */
  const restoreToUnclassified = (itemId: string, name: string): void => {
    setUnclassified((prev) =>
      [...prev, accessors.reconstructUnclassified(itemId, name)].sort((a, b) =>
        accessors.unclassified.getName(a).localeCompare(accessors.unclassified.getName(b))
      )
    );
  };

  const handleClassify = async (item: TUnclassified): Promise<void> => {
    const itemId = accessors.unclassified.getId(item);
    const draft = drafts[itemId];
    if (!draft?.countryCode || !draft?.productId) return;

    await runIdAction(itemId, setSavingId, async () => {
      const result = await api.classify(itemId, draft.productId!, draft.countryCode!);
      setUnclassified((prev) => prev.filter((i) => accessors.unclassified.getId(i) !== itemId));
      setClassified((prev) => [...prev, result]);
      removeDraft(itemId);
    }, setError, `Failed to classify ${labels.singular}`);
  };

  const handleIgnore = async (item: TUnclassified): Promise<void> => {
    const itemId = accessors.unclassified.getId(item);
    await runIdAction(itemId, setIgnoringId, async () => {
      const result = await api.ignore(itemId);
      setUnclassified((prev) => prev.filter((i) => accessors.unclassified.getId(i) !== itemId));
      setIgnored((prev) =>
        [...prev, result].sort((a, b) => accessors.ignored.getName(a).localeCompare(accessors.ignored.getName(b)))
      );
      removeDraft(itemId);
    }, setError, `Failed to ignore ${labels.singular}`);
  };

  const handleUnignore = async (item: TIgnored): Promise<void> => {
    const id = accessors.ignored.getId(item);
    await runIdAction(id, setRemovingId, async () => {
      const itemId = await api.unclassify(id);
      setIgnored((prev) => prev.filter((i) => accessors.ignored.getId(i) !== id));
      restoreToUnclassified(itemId, accessors.ignored.getName(item));
    }, setError, `Failed to unignore ${labels.singular}`);
  };

  const handleUnclassify = async (item: TClassified): Promise<void> => {
    const id = accessors.classified.getId(item);
    await runIdAction(id, setRemovingId, async () => {
      const itemId = await api.unclassify(id);
      setClassified((prev) => prev.filter((i) => accessors.classified.getId(i) !== id));
      restoreToUnclassified(itemId, accessors.classified.getName(item));
    }, setError, 'Failed to remove classification');
  };

  const handleAutoMatch = async (): Promise<void> => {
    setAutoMatching(true);
    setError(null);
    try {
      const result = await api.autoMatch();
      if (result.matchedCount > 0) {
        const matchedIds = new Set(result.matched.map((m) => accessors.classified.getItemId(m)));
        setUnclassified((prev) => prev.filter((i) => !matchedIds.has(accessors.unclassified.getId(i))));
        setClassified((prev) => [...prev, ...result.matched]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to auto-match ${labels.plural}`);
    } finally {
      setAutoMatching(false);
    }
  };

  const activeProductGroup = activeCategory !== 'unclassified' && activeCategory !== 'ignored'
    ? productGroups.find((g) => g.product.id === activeCategory)
    : null;

  // Compute header info for active category (replaces nested ternary chains)
  const { contentTitle, activeCount } = useMemo(() => {
    if (activeCategory === 'unclassified') return { contentTitle: 'Unclassified', activeCount: unclassified.length };
    if (activeCategory === 'ignored') return { contentTitle: 'Ignored', activeCount: ignored.length };
    if (activeProductGroup) return { contentTitle: activeProductGroup.product.name, activeCount: activeProductGroup.items.length };
    return { contentTitle: '', activeCount: 0 };
  }, [activeCategory, unclassified.length, ignored.length, activeProductGroup]);

  const renderUnclassifiedList = (): React.ReactNode => {
    if (unclassified.length === 0) return <div className={styles.emptyState}>All {labels.plural} are classified</div>;
    return unclassified.map((item) => {
      const itemId = accessors.unclassified.getId(item);
      const itemName = accessors.unclassified.getName(item);
      const draft = drafts[itemId] || { countryCode: null, productId: null };
      const canSave = draft.countryCode && draft.productId;
      const isSaving = savingId === itemId;
      const isIgnoring = ignoringId === itemId;
      return (
        <div key={itemId} className={styles.itemRow}>
          <Tooltip title={itemName}><span className={itemNameClass}>{itemName}</span></Tooltip>
          <div className={styles.selectWrap}>
            <Select size="small" placeholder="Country" options={COUNTRY_OPTIONS} value={draft.countryCode} onChange={(val) => handleDraftChange(itemId, 'countryCode', val)} style={{ width: '100%' }} />
          </div>
          <div className={styles.productSelectWrap}>
            <Select size="small" placeholder="Product" options={productOptions} value={draft.productId} onChange={(val) => handleDraftChange(itemId, 'productId', val)} style={{ width: '100%' }} popupMatchSelectWidth={false} virtual={false} />
          </div>
          <Button className={styles.classifyBtn} type="primary" size="small" icon={<CheckOutlined />} disabled={!canSave || isSaving} loading={isSaving} onClick={() => handleClassify(item)} />
          <Tooltip title="Ignore">
            <Button className={styles.ignoreBtn} type="text" size="small" icon={<StopOutlined />} loading={isIgnoring} disabled={isSaving} onClick={() => handleIgnore(item)} />
          </Tooltip>
        </div>
      );
    });
  };

  const renderIgnoredList = (): React.ReactNode => {
    if (ignored.length === 0) return <div className={styles.emptyState}>No ignored {labels.plural}</div>;
    return ignored.map((item) => {
      const id = accessors.ignored.getId(item);
      const name = accessors.ignored.getName(item);
      return (
        <div key={id} className={styles.itemRow}>
          <Tooltip title={name}><span className={itemNameClass}>{name}</span></Tooltip>
          <Button className={styles.removeBtn} type="text" size="small" icon={<CloseOutlined />} danger loading={removingId === id} onClick={() => handleUnignore(item)} />
        </div>
      );
    });
  };

  const renderClassifiedList = (): React.ReactNode => {
    if (!activeProductGroup || activeProductGroup.items.length === 0) {
      return <div className={styles.emptyState}>No {labels.plural} classified under this product</div>;
    }
    return activeProductGroup.items.map((item) => {
      const id = accessors.classified.getId(item);
      const name = accessors.classified.getName(item);
      const countryCode = accessors.classified.getCountry(item);
      return (
        <div key={id} className={styles.itemRow}>
          <Tooltip title={name}><span className={itemNameClass}>{name}</span></Tooltip>
          <span className={styles.countryBadge}>{countryCode}</span>
          <Button className={styles.removeBtn} type="text" size="small" icon={<CloseOutlined />} danger loading={removingId === id} onClick={() => handleUnclassify(item)} />
        </div>
      );
    });
  };

  const renderCategoryContent = (): React.ReactNode => {
    if (activeCategory === 'unclassified') return renderUnclassifiedList();
    if (activeCategory === 'ignored') return renderIgnoredList();
    if (activeProductGroup) return renderClassifiedList();
    return <div className={styles.emptyState}>Select a category</div>;
  };

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
              <span className={styles.sidebarCount}>{g.items.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: content */}
      <div className={styles.content}>
        <div className={styles.contentHeader}>
          <div className={styles.contentHeaderLeft}>
            <span className={styles.contentTitle}>{contentTitle}</span>
            <span className={styles.contentCount}>{activeCount} {labels.plural}</span>
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
          ) : (
            renderCategoryContent()
          )}
        </div>
      </div>
    </div>
  );
}
