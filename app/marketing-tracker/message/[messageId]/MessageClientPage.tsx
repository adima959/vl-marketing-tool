'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { App, Spin, Empty, Button, Tabs } from 'antd';
import { PlusOutlined, LinkOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Globe, ExternalLink, MessageSquare, Video } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { AssetTypeIcon, AssetModal, CreativeModal } from '@/components/marketing-tracker';
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
import { AssetDetailModal } from './AssetDetailModal';
import { CreativeDetailModal } from './CreativeDetailModal';
import { MessageHeaderCard } from './MessageHeaderCard';
import styles from './page.module.css';

type ModalState =
  | null
  | { type: 'asset-detail'; asset: Asset }
  | { type: 'creative-detail'; creative: Creative }
  | { type: 'asset-create' }
  | { type: 'creative-create' }
  | { type: 'asset-edit'; asset: Asset }
  | { type: 'creative-edit'; creative: Creative };

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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

  const [activeModal, setActiveModal] = useState<ModalState>(null);
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

  const closeModal = () => setActiveModal(null);

  const handleCreateSuccess = () => {
    if (messageId) loadMessage(messageId);
  };

  const handleDelete = async (type: 'asset' | 'creative', id: string) => {
    try {
      const response = await fetch(`/api/marketing-tracker/${type}s/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || `Failed to delete ${type}`);
      antMessage.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`);
      closeModal();
      if (messageId) loadMessage(messageId);
    } catch (error) {
      antMessage.error(error instanceof Error ? error.message : `Failed to delete ${type}`);
    }
  };

  // Derived data: filter + group assets/creatives by geo, type, and format
  const { filteredAssets, filteredCreatives, geoTabs, assetsByType, creativesByFormat } = useMemo(() => {
    const fAssets = activeGeo === 'all' ? assets : assets.filter(a => a.geo === activeGeo);
    const fCreatives = activeGeo === 'all' ? creatives : creatives.filter(c => c.geo === activeGeo);

    // Geo sidebar counts
    const totalByGeo: Record<string, number> = {};
    for (const a of assets) totalByGeo[a.geo] = (totalByGeo[a.geo] || 0) + 1;
    for (const c of creatives) totalByGeo[c.geo] = (totalByGeo[c.geo] || 0) + 1;

    const tabs = [
      { key: 'all', label: 'All', flag: null as string | null, count: assets.length + creatives.length },
      ...Object.entries(GEO_CONFIG)
        .filter(([geo]) => (totalByGeo[geo] || 0) > 0)
        .map(([geo, config]) => ({
          key: geo,
          label: config.label,
          flag: config.flag as string | null,
          count: totalByGeo[geo] || 0,
        })),
    ];

    const byType: Record<string, Asset[]> = {};
    for (const a of fAssets) (byType[a.type] ??= []).push(a);

    const byFormat: Record<string, Creative[]> = {};
    for (const c of fCreatives) (byFormat[c.format] ??= []).push(c);

    return { filteredAssets: fAssets, filteredCreatives: fCreatives, geoTabs: tabs, assetsByType: byType, creativesByFormat: byFormat };
  }, [assets, creatives, activeGeo]);

  // Derived from modal state
  const selectedAsset = activeModal?.type === 'asset-detail' || activeModal?.type === 'asset-edit'
    ? activeModal.asset : null;
  const selectedCreative = activeModal?.type === 'creative-detail' || activeModal?.type === 'creative-edit'
    ? activeModal.creative : null;

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

        <MessageHeaderCard
          message={currentMessage}
          saveStatus={saveStatus}
          onFieldChange={handleFieldChange}
          onStatusChange={(newStatus) => updateMessageStatus(currentMessage.id, newStatus)}
        />

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
                onClick={() => setActiveModal(activeTab === 'assets' ? { type: 'asset-create' } : { type: 'creative-create' })}
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
                        <div key={asset.id} className={styles.assetItem} onClick={() => setActiveModal({ type: 'asset-detail', asset })}>
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
                      <div key={creative.id} className={styles.assetItem} onClick={() => setActiveModal({ type: 'creative-detail', creative })}>
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
        open={activeModal?.type === 'asset-create'}
        onClose={closeModal}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
      />

      {/* Creative Create Modal */}
      <CreativeModal
        open={activeModal?.type === 'creative-create'}
        onClose={closeModal}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
      />

      {/* Asset Edit Modal */}
      <AssetModal
        open={activeModal?.type === 'asset-edit'}
        onClose={closeModal}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
        asset={selectedAsset}
      />

      {/* Creative Edit Modal */}
      <CreativeModal
        open={activeModal?.type === 'creative-edit'}
        onClose={closeModal}
        onSuccess={handleCreateSuccess}
        messageId={messageId}
        creative={selectedCreative}
      />

      <AssetDetailModal
        asset={selectedAsset}
        open={activeModal?.type === 'asset-detail'}
        onClose={closeModal}
        onEdit={() => activeModal?.type === 'asset-detail' && setActiveModal({ type: 'asset-edit', asset: activeModal.asset })}
        onDelete={(id: string) => handleDelete('asset', id)}
        formatDate={formatDate}
        modal={modal}
      />

      <CreativeDetailModal
        creative={selectedCreative}
        open={activeModal?.type === 'creative-detail'}
        onClose={closeModal}
        onEdit={() => activeModal?.type === 'creative-detail' && setActiveModal({ type: 'creative-edit', creative: activeModal.creative })}
        onDelete={(id: string) => handleDelete('creative', id)}
        formatDate={formatDate}
        modal={modal}
      />
    </>
  );
}
