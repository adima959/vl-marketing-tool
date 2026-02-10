'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { App, Spin, Empty, Button, Modal, Tabs } from 'antd';
import { sanitizeHtml } from '@/lib/sanitize';
import { PlusOutlined, EditOutlined, ExportOutlined, LinkOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Globe, FileText, ExternalLink, Lightbulb, MessageSquare, Video } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, AssetTypeIcon, AssetModal, CreativeModal } from '@/components/marketing-tracker';
import { EditableField } from '@/components/ui/EditableField';
import { EditableTags } from '@/components/ui/EditableTags';
import modalStyles from '@/styles/components/modal.module.css';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import {
  GEO_CONFIG,
  ASSET_TYPE_CONFIG,
  CREATIVE_FORMAT_CONFIG,
  type Geography,
  type Asset,
  type Creative,
  type AssetType,
  type CreativeFormat,
} from '@/types';
import styles from './page.module.css';

interface MessageClientPageProps {
  messageId: string;
}

export default function MessageClientPage({ messageId }: MessageClientPageProps) {
  const {
    currentProduct,
    currentAngle,
    currentMessage,
    assets,
    creatives,
    isLoading,
    loadMessage,
    updateMessageStatus,
    updateMessageField,
  } = useMarketingTrackerStore();
  const { message: antMessage, modal } = App.useApp();

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(false);
  const [creativeDetailOpen, setCreativeDetailOpen] = useState(false);
  const [assetCreateOpen, setAssetCreateOpen] = useState(false);
  const [creativeCreateOpen, setCreativeCreateOpen] = useState(false);
  const [assetEditOpen, setAssetEditOpen] = useState(false);
  const [creativeEditOpen, setCreativeEditOpen] = useState(false);
  const [activeGeo, setActiveGeo] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('assets');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (messageId) {
      loadMessage(messageId);
    }
  }, [messageId, loadMessage]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Debounced auto-save for field changes
  const handleFieldChange = useCallback((field: string, value: string | string[]) => {
    if (!messageId) return;

    // Clear existing timer for this field
    if (debounceTimers.current[field]) {
      clearTimeout(debounceTimers.current[field]);
    }

    setSaveStatus('saving');

    debounceTimers.current[field] = setTimeout(async () => {
      await updateMessageField(messageId, field, value);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    }, 600);
  }, [messageId, updateMessageField]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openAssetDetail = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetDetailOpen(true);
  };

  const closeAssetDetail = () => {
    setAssetDetailOpen(false);
    setSelectedAsset(null);
  };

  const openCreativeDetail = (creative: Creative) => {
    setSelectedCreative(creative);
    setCreativeDetailOpen(true);
  };

  const closeCreativeDetail = () => {
    setCreativeDetailOpen(false);
    setSelectedCreative(null);
  };

  const handleCreateSuccess = () => {
    if (messageId) loadMessage(messageId);
  };

  const handleEditAsset = () => {
    setAssetDetailOpen(false);
    setAssetEditOpen(true);
  };

  const handleEditCreative = () => {
    setCreativeDetailOpen(false);
    setCreativeEditOpen(true);
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      const response = await fetch(`/api/marketing-tracker/assets/${assetId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete asset');
      antMessage.success('Asset deleted');
      closeAssetDetail();
      if (messageId) loadMessage(messageId);
    } catch (error) {
      antMessage.error(error instanceof Error ? error.message : 'Failed to delete asset');
    }
  };

  const handleDeleteCreative = async (creativeId: string) => {
    try {
      const response = await fetch(`/api/marketing-tracker/creatives/${creativeId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete creative');
      antMessage.success('Creative deleted');
      closeCreativeDetail();
      if (messageId) loadMessage(messageId);
    } catch (error) {
      antMessage.error(error instanceof Error ? error.message : 'Failed to delete creative');
    }
  };

  // Filter assets and creatives by geo
  const filteredAssets = activeGeo === 'all' ? assets : assets.filter((a) => a.geo === activeGeo);

  const filteredCreatives = activeGeo === 'all' ? creatives : creatives.filter((c) => c.geo === activeGeo);

  // Group assets by geo for sidebar counts
  const assetsByGeo = assets.reduce(
    (acc, asset) => {
      if (!acc[asset.geo]) acc[asset.geo] = [];
      acc[asset.geo].push(asset);
      return acc;
    },
    {} as Record<Geography, Asset[]>
  );

  const creativesByGeo = creatives.reduce(
    (acc, creative) => {
      if (!acc[creative.geo]) acc[creative.geo] = [];
      acc[creative.geo].push(creative);
      return acc;
    },
    {} as Record<Geography, Creative[]>
  );

  // Get total items per geo
  const totalByGeo = Object.keys(GEO_CONFIG).reduce(
    (acc, geo) => {
      const g = geo as Geography;
      acc[g] = (assetsByGeo[g]?.length || 0) + (creativesByGeo[g]?.length || 0);
      return acc;
    },
    {} as Record<Geography, number>
  );

  // Group filtered assets by type
  const assetsByType = filteredAssets.reduce(
    (acc, asset) => {
      if (!acc[asset.type]) acc[asset.type] = [];
      acc[asset.type].push(asset);
      return acc;
    },
    {} as Record<AssetType, Asset[]>
  );

  // Group filtered creatives by format
  const creativesByFormat = filteredCreatives.reduce(
    (acc, creative) => {
      if (!acc[creative.format]) acc[creative.format] = [];
      acc[creative.format].push(creative);
      return acc;
    },
    {} as Record<CreativeFormat, Creative[]>
  );

  // Get geo tabs with counts
  const totalItems = assets.length + creatives.length;
  const geoTabs = [
    { key: 'all', label: 'All', flag: null as string | null, count: totalItems },
    ...Object.entries(GEO_CONFIG)
      .filter(([geo]) => totalByGeo[geo as Geography] > 0)
      .map(([geo, config]) => ({
        key: geo,
        label: config.label,
        flag: config.flag as string | null,
        count: totalByGeo[geo as Geography],
      })),
  ];

  if (isLoading && !currentMessage) {
    return (
      <>
        <PageHeader title="Loading..." icon={<Target className="h-5 w-5" />} />
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (!currentMessage) {
    return (
      <>
        <PageHeader title="Message Not Found" icon={<Target className="h-5 w-5" />} />
        <div className={styles.container}>
          <Empty description="Message not found" />
        </div>
      </>
    );
  }

  // Get current values from server state
  const painPoint = currentMessage.specificPainPoint || '';
  const corePromise = currentMessage.corePromise || '';
  const keyIdea = currentMessage.keyIdea || '';
  const hookDirection = currentMessage.primaryHookDirection || '';
  const headlines = currentMessage.headlines || [];
  const description = currentMessage.description || '';

  // Strip HTML from description for editing (simple approach)
  const plainDescription = description.replace(/<[^>]*>/g, '');

  return (
    <>
      <PageHeader title={currentMessage.name} icon={<MessageSquare className="h-5 w-5" />} />
      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/marketing-tracker" className={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <ChevronRight size={14} />
          {currentProduct && (
            <>
              <Link href={`/marketing-tracker/product/${currentProduct.id}`} className={styles.breadcrumbLink}>
                {currentProduct.name}
              </Link>
              <ChevronRight size={14} />
            </>
          )}
          {currentAngle && (
            <>
              <Link href={`/marketing-tracker/angle/${currentAngle.id}`} className={styles.breadcrumbLink}>
                {currentAngle.name}
              </Link>
              <ChevronRight size={14} />
            </>
          )}
          <span className={styles.breadcrumbCurrent}>{currentMessage.name}</span>
        </div>

        {/* Message Header Card */}
        <div className={styles.headerCard}>
          <div className={styles.headerTop}>
            <span className={styles.headerLabel}>MESSAGE HYPOTHESIS</span>
            <div className={styles.headerActions}>
              <StatusBadge
                status={currentMessage.status}
                variant="dot"
                editable
                onChange={(newStatus) => updateMessageStatus(currentMessage.id, newStatus)}
              />
              {saveStatus === 'saving' && <span className={styles.saveIndicator}>Saving...</span>}
              {saveStatus === 'saved' && <span className={styles.saveIndicatorDone}><CheckOutlined /> Saved</span>}
            </div>
          </div>
          <h1 className={styles.headerTitle}>{currentMessage.name}</h1>

          <div className={styles.headerGrid}>
            {/* Pain Point */}
            <div className={styles.hypothesisSection}>
              <span className={styles.sectionLabel}>
                <Lightbulb size={14} /> PAIN POINT
              </span>
              <EditableField
                value={painPoint}
                onChange={(v) => handleFieldChange('specificPainPoint', v)}
                placeholder="Add a pain point..."
                quoted
                multiline
              />
            </div>

            {/* Core Promise */}
            <div className={styles.hypothesisSection}>
              <span className={styles.sectionLabel}>
                <Target size={14} /> CORE PROMISE
              </span>
              <EditableField
                value={corePromise}
                onChange={(v) => handleFieldChange('corePromise', v)}
                placeholder="Add a core promise..."
                quoted
                multiline
              />
            </div>

            {/* Key Idea */}
            <div className={styles.hypothesisSection}>
              <span className={styles.sectionLabel}>
                <MessageSquare size={14} /> KEY IDEA
              </span>
              <EditableField
                value={keyIdea}
                onChange={(v) => handleFieldChange('keyIdea', v)}
                placeholder="Add a key idea..."
                multiline
              />
            </div>

            {/* Hook Direction */}
            <div className={styles.hypothesisSection}>
              <span className={styles.sectionLabel}>
                <Video size={14} /> HOOK DIRECTION
              </span>
              <EditableField
                value={hookDirection}
                onChange={(v) => handleFieldChange('primaryHookDirection', v)}
                placeholder="Add a hook direction..."
                multiline
              />
            </div>
          </div>

          {/* Headlines */}
          <div className={styles.headlinesSection}>
            <span className={styles.sectionLabel}>HEADLINES</span>
            <EditableTags
              tags={headlines}
              onChange={(h) => handleFieldChange('headlines', h)}
              placeholder="New headline..."
              addLabel="Add"
            />
          </div>

          {/* Strategy notes section */}
          <div className={styles.strategySection}>
            <span className={styles.sectionLabel}>
              <FileText size={14} /> STRATEGY NOTES
            </span>
            <EditableField
              value={plainDescription}
              onChange={(v) => handleFieldChange('description', v)}
              placeholder="Add strategy notes..."
              multiline
            />
          </div>
        </div>

        {/* Tabs navigation */}
        <div className={styles.tabsContainer}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'assets', label: `Assets (${assets.length})` },
              { key: 'creatives', label: `Creatives (${creatives.length})` },
            ]}
          />
        </div>

        {/* Assets/Creatives Section with Geo Sidebar */}
        <div className={styles.assetsGrid}>
          {/* Geo Sidebar */}
          <div className={styles.geoSidebar}>
            <h3 className={styles.sidebarTitle}>Filter by Geography</h3>
            <div className={styles.geoList}>
              {geoTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`${styles.geoItem} ${activeGeo === tab.key ? styles.geoItemActive : ''}`}
                  onClick={() => setActiveGeo(tab.key)}
                >
                  <span className={styles.geoFlag}>{tab.key === 'all' ? <Globe size={16} /> : tab.flag}</span>
                  <span className={styles.geoName}>{tab.label}</span>
                  <span className={styles.geoCount}>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content based on active tab */}
          <div className={styles.assetsList}>
            <div className={styles.assetsHeader}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => activeTab === 'assets' ? setAssetCreateOpen(true) : setCreativeCreateOpen(true)}
              >
                {activeTab === 'assets' ? 'Add Asset' : 'Add Creative'}
              </Button>
            </div>

            {activeTab === 'assets' ? (
              /* Assets List */
              filteredAssets.length === 0 ? (
                <Empty description="No assets for this geography" />
              ) : (
                Object.entries(assetsByType).map(([type, typeAssets]) => (
                  <div key={type} className={styles.assetTypeGroup}>
                    <div className={styles.assetTypeHeader}>
                      <AssetTypeIcon type={type as AssetType} />
                      <span className={styles.assetTypeName}>{ASSET_TYPE_CONFIG[type as AssetType].label}S</span>
                      <span className={styles.assetTypeCount}>{typeAssets.length}</span>
                    </div>
                    <div className={styles.assetTypeItems}>
                      {typeAssets.map((asset) => (
                        <div key={asset.id} className={styles.assetItem} onClick={() => openAssetDetail(asset)}>
                          <LinkOutlined className={styles.assetIcon} />
                          <div className={styles.assetInfo}>
                            <span className={styles.assetName}>
                              {asset.name}
                              {asset.url && (
                                <a
                                  href={asset.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={styles.assetExternalLink}
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </span>
                            {asset.notes && <span className={styles.assetNotes}>{asset.notes}</span>}
                          </div>
                          <span className={styles.assetDate}>{formatDate(asset.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : /* Creatives List */
            filteredCreatives.length === 0 ? (
              <Empty description="No creatives for this geography" />
            ) : (
              Object.entries(creativesByFormat).map(([format, formatCreatives]) => (
                <div key={format} className={styles.assetTypeGroup}>
                  <div className={styles.assetTypeHeader}>
                    <Video size={16} className={styles.assetTypeIcon} />
                    <span className={styles.assetTypeName}>
                      {CREATIVE_FORMAT_CONFIG[format as CreativeFormat].label}S
                    </span>
                    <span className={styles.assetTypeCount}>{formatCreatives.length}</span>
                  </div>
                  <div className={styles.assetTypeItems}>
                    {formatCreatives.map((creative) => (
                      <div key={creative.id} className={styles.assetItem} onClick={() => openCreativeDetail(creative)}>
                        <Video size={16} className={styles.assetIcon} />
                        <div className={styles.assetInfo}>
                          <span className={styles.assetName}>
                            {creative.name}
                            {creative.url && (
                              <a
                                href={creative.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={styles.assetExternalLink}
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </span>
                          {creative.cta && <span className={styles.assetNotes}>CTA: {creative.cta}</span>}
                        </div>
                        <span className={styles.assetDate}>{formatDate(creative.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Asset Create Modal */}
      <AssetModal
        open={assetCreateOpen}
        onClose={() => setAssetCreateOpen(false)}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
      />

      {/* Creative Create Modal */}
      <CreativeModal
        open={creativeCreateOpen}
        onClose={() => setCreativeCreateOpen(false)}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
      />

      {/* Asset Edit Modal */}
      <AssetModal
        open={assetEditOpen}
        onClose={() => { setAssetEditOpen(false); setSelectedAsset(null); }}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
        asset={selectedAsset}
      />

      {/* Creative Edit Modal */}
      <CreativeModal
        open={creativeEditOpen}
        onClose={() => { setCreativeEditOpen(false); setSelectedCreative(null); }}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
        creative={selectedCreative}
      />

      {/* Asset Detail Modal */}
      <Modal
        title={selectedAsset?.name}
        open={assetDetailOpen}
        onCancel={closeAssetDetail}
        className={modalStyles.modal}
        footer={[
          selectedAsset?.url && (
            <Button key="open" type="primary" icon={<ExportOutlined />} href={selectedAsset.url} target="_blank">
              Open Link
            </Button>
          ),
          <Button key="edit" icon={<EditOutlined />} onClick={handleEditAsset}>
            Edit
          </Button>,
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={() => selectedAsset && modal.confirm({
              title: 'Delete Asset',
              content: `Are you sure you want to delete "${selectedAsset.name}"?`,
              okText: 'Delete',
              okType: 'danger',
              onOk: () => handleDeleteAsset(selectedAsset.id),
            })}
          >
            Delete
          </Button>,
          <Button key="close" onClick={closeAssetDetail}>
            Close
          </Button>,
        ]}
        width={600}
      >
        {selectedAsset && (
          <div className={styles.modalContent}>
            <div className={styles.modalMeta}>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>Type</span>
                <span className={styles.metaValue}>
                  <AssetTypeIcon type={selectedAsset.type} showLabel />
                </span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>Geography</span>
                <span className={styles.metaValue}>
                  {GEO_CONFIG[selectedAsset.geo].flag} {GEO_CONFIG[selectedAsset.geo].label}
                </span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>Created</span>
                <span className={styles.metaValue}>{formatDate(selectedAsset.createdAt)}</span>
              </div>
            </div>

            {selectedAsset.url && (
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>URL</h4>
                <a href={selectedAsset.url} target="_blank" rel="noopener noreferrer" className={styles.modalUrl}>
                  {selectedAsset.url}
                </a>
              </div>
            )}

            {selectedAsset.content && (
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Content</h4>
                <div className={styles.modalContentText} dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedAsset.content) }} />
              </div>
            )}

            {selectedAsset.notes && (
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Notes</h4>
                <p className={styles.modalNotes}>{selectedAsset.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Creative Detail Modal */}
      <Modal
        title={selectedCreative?.name}
        open={creativeDetailOpen}
        onCancel={closeCreativeDetail}
        className={modalStyles.modal}
        footer={[
          selectedCreative?.url && (
            <Button key="open" type="primary" icon={<ExportOutlined />} href={selectedCreative.url} target="_blank">
              Open Link
            </Button>
          ),
          <Button key="edit" icon={<EditOutlined />} onClick={handleEditCreative}>
            Edit
          </Button>,
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={() => selectedCreative && modal.confirm({
              title: 'Delete Creative',
              content: `Are you sure you want to delete "${selectedCreative.name}"?`,
              okText: 'Delete',
              okType: 'danger',
              onOk: () => handleDeleteCreative(selectedCreative.id),
            })}
          >
            Delete
          </Button>,
          <Button key="close" onClick={closeCreativeDetail}>
            Close
          </Button>,
        ]}
        width={600}
      >
        {selectedCreative && (
          <div className={styles.modalContent}>
            <div className={styles.modalMeta}>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>Format</span>
                <span className={styles.metaValue}>{CREATIVE_FORMAT_CONFIG[selectedCreative.format].label}</span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>Geography</span>
                <span className={styles.metaValue}>
                  {GEO_CONFIG[selectedCreative.geo].flag} {GEO_CONFIG[selectedCreative.geo].label}
                </span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>CTA</span>
                <span className={styles.metaValue}>{selectedCreative.cta || '-'}</span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.metaLabel}>Created</span>
                <span className={styles.metaValue}>{formatDate(selectedCreative.createdAt)}</span>
              </div>
            </div>

            {selectedCreative.url && (
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>URL</h4>
                <a href={selectedCreative.url} target="_blank" rel="noopener noreferrer" className={styles.modalUrl}>
                  {selectedCreative.url}
                </a>
              </div>
            )}

            {selectedCreative.notes && (
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Notes</h4>
                <p className={styles.modalNotes}>{selectedCreative.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
