'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Spin, Empty, Button, Modal, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, ExportOutlined, LinkOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Globe, FileText, ExternalLink, Lightbulb, MessageSquare, Video } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, AssetTypeIcon } from '@/components/marketing-tracker';
import { EditableField } from '@/components/ui/EditableField';
import { EditableTags } from '@/components/ui/EditableTags';
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

export default function MessagePage() {
  const {
    currentProduct,
    currentAngle,
    currentMessage,
    assets,
    creatives,
    isLoading,
    loadMessage,
    updateMessageStatus,
  } = useMarketingTrackerStore();

  // Local editable state (not persisted yet)
  const [editedFields, setEditedFields] = useState<{
    specificPainPoint?: string;
    corePromise?: string;
    keyIdea?: string;
    primaryHookDirection?: string;
    headlines?: string[];
    description?: string;
  }>({});

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
  const [activeGeo, setActiveGeo] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('assets');

  const params = useParams<{ messageId: string }>();
  const messageId = params.messageId;

  useEffect(() => {
    if (messageId) {
      loadMessage(messageId);
    }
  }, [messageId, loadMessage]);

  // Reset edited fields when message changes
  useEffect(() => {
    setEditedFields({});
  }, [currentMessage?.id]);

  // Get the current value (edited or original)
  const getValue = <T,>(field: keyof typeof editedFields, original: T): T => {
    return (editedFields[field] !== undefined ? editedFields[field] : original) as T;
  };

  const handleFieldChange = (field: keyof typeof editedFields, value: string | string[]) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openAssetModal = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetModalOpen(true);
  };

  const closeAssetModal = () => {
    setAssetModalOpen(false);
    setSelectedAsset(null);
  };

  const openCreativeModal = (creative: Creative) => {
    setSelectedCreative(creative);
    setCreativeModalOpen(true);
  };

  const closeCreativeModal = () => {
    setCreativeModalOpen(false);
    setSelectedCreative(null);
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

  // Get current values (with edits applied)
  const painPoint = getValue('specificPainPoint', currentMessage.specificPainPoint || '');
  const corePromise = getValue('corePromise', currentMessage.corePromise || '');
  const keyIdea = getValue('keyIdea', currentMessage.keyIdea || '');
  const hookDirection = getValue('primaryHookDirection', currentMessage.primaryHookDirection || '');
  const headlines = getValue('headlines', currentMessage.headlines || []);
  const description = getValue('description', currentMessage.description || '');

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
              <Button icon={<EditOutlined />}>Edit</Button>
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
              <Button type="primary" icon={<PlusOutlined />}>
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
                        <div key={asset.id} className={styles.assetItem} onClick={() => openAssetModal(asset)}>
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
                      <div key={creative.id} className={styles.assetItem} onClick={() => openCreativeModal(creative)}>
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

      {/* Asset Detail Modal */}
      <Modal
        title={selectedAsset?.name}
        open={assetModalOpen}
        onCancel={closeAssetModal}
        footer={[
          selectedAsset?.url && (
            <Button key="open" type="primary" icon={<ExportOutlined />} href={selectedAsset.url} target="_blank">
              Open Link
            </Button>
          ),
          <Button key="edit" icon={<EditOutlined />}>
            Edit
          </Button>,
          <Button key="close" onClick={closeAssetModal}>
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
                <div className={styles.modalContentText} dangerouslySetInnerHTML={{ __html: selectedAsset.content }} />
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
        open={creativeModalOpen}
        onCancel={closeCreativeModal}
        footer={[
          selectedCreative?.url && (
            <Button key="open" type="primary" icon={<ExportOutlined />} href={selectedCreative.url} target="_blank">
              Open Link
            </Button>
          ),
          <Button key="edit" icon={<EditOutlined />}>
            Edit
          </Button>,
          <Button key="close" onClick={closeCreativeModal}>
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
