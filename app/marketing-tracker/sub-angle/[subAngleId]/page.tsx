'use client';

import { useEffect, useState } from 'react';
import { Spin, Empty, Button, Modal, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, ExportOutlined, LinkOutlined } from '@ant-design/icons';
import { Target, ChevronRight, Globe, FileText, ExternalLink, Calendar } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, AssetTypeIcon } from '@/components/marketing-tracker';
import { useMarketingTrackerStore } from '@/stores/marketingTrackerStore';
import { GEO_CONFIG, ASSET_TYPE_CONFIG, type Geography, type Asset, type AssetType } from '@/types';
import styles from './page.module.css';

export default function SubAnglePage() {
  const {
    currentProduct,
    currentMainAngle,
    currentSubAngle,
    assets,
    isLoading,
    loadSubAngle,
    updateSubAngleStatus,
  } = useMarketingTrackerStore();

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [activeGeo, setActiveGeo] = useState<string>('all');

  const subAngleId = typeof window !== 'undefined'
    ? window.location.pathname.split('/').pop()
    : '';

  useEffect(() => {
    if (subAngleId) {
      loadSubAngle(subAngleId);
    }
  }, [subAngleId, loadSubAngle]);

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

  // Filter assets by geo
  const filteredAssets = activeGeo === 'all'
    ? assets
    : assets.filter(a => a.geo === activeGeo);

  // Group assets by geo for sidebar
  const assetsByGeo = assets.reduce((acc, asset) => {
    if (!acc[asset.geo]) acc[asset.geo] = [];
    acc[asset.geo].push(asset);
    return acc;
  }, {} as Record<Geography, Asset[]>);

  // Group filtered assets by type
  const assetsByType = filteredAssets.reduce((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = [];
    acc[asset.type].push(asset);
    return acc;
  }, {} as Record<AssetType, Asset[]>);

  // Get geo tabs with counts
  const geoTabs = [
    { key: 'all', label: 'All', flag: null as string | null, count: assets.length },
    ...Object.entries(assetsByGeo).map(([geo, items]) => ({
      key: geo,
      label: GEO_CONFIG[geo as Geography].label,
      flag: GEO_CONFIG[geo as Geography].flag as string | null,
      count: items.length,
    })),
  ];

  if (isLoading && !currentSubAngle) {
    return (
      <>
        <PageHeader title="Loading..." icon={<Target className="h-5 w-5" />} />
        <div className={styles.loadingContainer}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (!currentSubAngle) {
    return (
      <>
        <PageHeader title="Sub-Angle Not Found" icon={<Target className="h-5 w-5" />} />
        <div className={styles.container}>
          <Empty description="Sub-angle not found" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={currentSubAngle.name}
        icon={<Target className="h-5 w-5" />}
      />
      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/marketing-tracker" className={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <ChevronRight size={14} />
          {currentProduct && (
            <>
              <Link
                href={`/marketing-tracker/product/${currentProduct.id}`}
                className={styles.breadcrumbLink}
              >
                {currentProduct.name}
              </Link>
              <ChevronRight size={14} />
            </>
          )}
          {currentMainAngle && (
            <>
              <Link
                href={`/marketing-tracker/angle/${currentMainAngle.id}`}
                className={styles.breadcrumbLink}
              >
                {currentMainAngle.name}
              </Link>
              <ChevronRight size={14} />
            </>
          )}
          <span className={styles.breadcrumbCurrent}>{currentSubAngle.name}</span>
        </div>

        {/* Sub-Angle Header Card */}
        <div className={styles.headerCard}>
          <div className={styles.headerTop}>
            <span className={styles.headerLabel}>SUB-ANGLE STRATEGY</span>
            <div className={styles.headerActions}>
              <StatusBadge
                status={currentSubAngle.status}
                variant="dot"
                editable
                onChange={(newStatus) => updateSubAngleStatus(currentSubAngle.id, newStatus)}
              />
              <Button icon={<EditOutlined />}>Edit</Button>
            </div>
          </div>
          <h1 className={styles.headerTitle}>{currentSubAngle.name}</h1>

          <div className={styles.headerGrid}>
            {/* Hook section */}
            <div className={styles.hookSection}>
              <span className={styles.sectionLabel}>
                <Target size={14} /> EXECUTION HOOK
              </span>
              <p className={styles.hookText}>
                {currentSubAngle.hook ? `"${currentSubAngle.hook}"` : '-'}
              </p>
            </div>

            {/* Strategy notes section */}
            <div className={styles.strategySection}>
              <span className={styles.sectionLabel}>
                <FileText size={14} /> STRATEGY NOTES
              </span>
              {currentSubAngle.description ? (
                <div
                  className={styles.strategyText}
                  dangerouslySetInnerHTML={{ __html: currentSubAngle.description }}
                />
              ) : (
                <p className={styles.strategyText}>-</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs navigation */}
        <div className={styles.tabsContainer}>
          <Tabs
            defaultActiveKey="assets"
            items={[
              { key: 'assets', label: 'Creative Assets' },
              { key: 'log', label: 'Launch Log & Results' },
            ]}
          />
        </div>

        {/* Assets Section with Geo Sidebar */}
        <div className={styles.assetsGrid}>
          {/* Geo Sidebar */}
          <div className={styles.geoSidebar}>
            <h3 className={styles.sidebarTitle}>Asset Library</h3>
            <div className={styles.geoList}>
              {geoTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`${styles.geoItem} ${activeGeo === tab.key ? styles.geoItemActive : ''}`}
                  onClick={() => setActiveGeo(tab.key)}
                >
                  <span className={styles.geoFlag}>
                    {tab.key === 'all' ? <Globe size={16} /> : tab.flag}
                  </span>
                  <span className={styles.geoName}>{tab.label}</span>
                  <span className={styles.geoCount}>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Assets List grouped by type */}
          <div className={styles.assetsList}>
            <div className={styles.assetsHeader}>
              <Button type="primary" icon={<PlusOutlined />}>
                Add Asset
              </Button>
            </div>

            {filteredAssets.length === 0 ? (
              <Empty description="No assets for this geography" />
            ) : (
              Object.entries(assetsByType).map(([type, typeAssets]) => (
                <div key={type} className={styles.assetTypeGroup}>
                  <div className={styles.assetTypeHeader}>
                    <AssetTypeIcon type={type as AssetType} />
                    <span className={styles.assetTypeName}>
                      {ASSET_TYPE_CONFIG[type as AssetType].label}S
                    </span>
                    <span className={styles.assetTypeCount}>{typeAssets.length}</span>
                  </div>
                  <div className={styles.assetTypeItems}>
                    {typeAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className={styles.assetItem}
                        onClick={() => openAssetModal(asset)}
                      >
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
                          {asset.notes && (
                            <span className={styles.assetNotes}>{asset.notes}</span>
                          )}
                        </div>
                        <span className={styles.assetDate}>{formatDate(asset.createdAt)}</span>
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
            <Button
              key="open"
              type="primary"
              icon={<ExportOutlined />}
              href={selectedAsset.url}
              target="_blank"
            >
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
                <a
                  href={selectedAsset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.modalUrl}
                >
                  {selectedAsset.url}
                </a>
              </div>
            )}

            {selectedAsset.content && (
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Content</h4>
                <div
                  className={styles.modalContentText}
                  dangerouslySetInnerHTML={{ __html: selectedAsset.content }}
                />
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
    </>
  );
}
