'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import { CloseOutlined, FileTextOutlined, PictureOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { FolderOpen } from 'lucide-react';
import { NotionEditor } from '@/components/ui/NotionEditor';
import { ProductAssetsTab } from '@/components/marketing-pipeline/ProductAssetsTab';
import { usePipelineStore } from '@/stores/pipelineStore';
import type { Product } from '@/types';
import styles from './ConceptDetailPanel.module.css';

type ProductTab = 'notes' | 'assets' | null;

interface ProductDetailPanelProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}

export function ProductDetailPanel({ open, product, onClose }: ProductDetailPanelProps): React.ReactNode {
  const [activeTab, setActiveTab] = useState<ProductTab>('notes');
  const updateProductField = usePipelineStore(s => s.updateProductField);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Reset tab when product changes
  useEffect(() => {
    setActiveTab('notes');
  }, [product?.id]);

  const toggleTab = useCallback((tab: ProductTab) => {
    setActiveTab(prev => prev === tab ? null : tab);
  }, []);

  // Notes — saved directly via store (NotionEditor handles debounce + indicator)
  const handleNotesSave = useCallback(async (value: string): Promise<void> => {
    if (!product) return;
    await updateProductField(product.id, 'notes', value);
  }, [product, updateProductField]);

  if (!open || !product) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panelNarrow}>
        {/* Header — matches message panel pattern */}
        <div className={styles.header}>
          <div className={styles.headerInner}>
            {/* Row 1: Meta */}
            <div className={styles.headerMeta}>
              {product.owner && (
                <Tooltip title="Product owner" mouseEnterDelay={0.15}>
                  <span className={styles.ownerMeta}>
                    <span className={styles.ownerAvatar}>
                      {product.owner.name.charAt(0).toUpperCase()}
                    </span>
                    {product.owner.name}
                  </span>
                </Tooltip>
              )}
              {product.sku && (
                <>
                  <span className={styles.metaDivider} />
                  <Tooltip title="Product SKU" mouseEnterDelay={0.15}>
                    <span className={styles.dateMeta}>SKU: {product.sku}</span>
                  </Tooltip>
                </>
              )}
              {(product.assetsFolderId || product.driveFolderId) && (
                <>
                  <span className={styles.metaDivider} />
                  <Tooltip title="Assets folder in Google Drive" mouseEnterDelay={0.15}>
                    <a
                      href={`https://drive.google.com/drive/folders/${product.assetsFolderId || product.driveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.driveHeaderLink}
                    >
                      <FolderOpen size={13} />
                      Drive
                    </a>
                  </Tooltip>
                </>
              )}
              <div className={styles.headerControls}>
                <button type="button" className={styles.controlBtn} onClick={onClose} title="Close">
                  <CloseOutlined />
                </button>
              </div>
            </div>

            {/* Row 2: Product color dot + Name */}
            <div className={styles.headerTitle}>
              {product.color && (
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: product.color,
                    flexShrink: 0,
                  }}
                />
              )}
              <div className={styles.titleText}>
                {product.name}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.bodyContent}>
            {/* Tab Section — same pattern as StrategyCopyTab */}
            <div className={styles.strategySection}>
              <div className={styles.strategyContainer}>
                {/* Tab Navigation */}
                <div className={styles.strategyTabBar}>
                  <button
                    type="button"
                    className={`${styles.strategyTab} ${activeTab === 'notes' ? styles.strategyTabActive : ''}`}
                    onClick={() => toggleTab('notes')}
                  >
                    <span className={styles.strategyTabChevron}>
                      {activeTab === 'notes' ? <DownOutlined /> : <RightOutlined />}
                    </span>
                    <FileTextOutlined className={styles.strategyTabIcon} />
                    <span>Notes</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.strategyTab} ${activeTab === 'assets' ? styles.strategyTabActive : ''}`}
                    onClick={() => toggleTab('assets')}
                  >
                    <span className={styles.strategyTabChevron}>
                      {activeTab === 'assets' ? <DownOutlined /> : <RightOutlined />}
                    </span>
                    <PictureOutlined className={styles.strategyTabIcon} />
                    <span>Assets</span>
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab && (
                  <div className={styles.strategyTabContent}>
                    {activeTab === 'notes' && (
                      <div className={styles.notesWrapperConstrained}>
                        <NotionEditor
                          value={product.notes || ''}
                          onSave={handleNotesSave}
                          placeholder="Add product notes, brand guidelines, target audience info..."
                        />
                      </div>
                    )}

                    {activeTab === 'assets' && (
                      <ProductAssetsTab
                        productId={product.id}
                        driveFolderId={product.driveFolderId}
                        assetsFolderId={product.assetsFolderId}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
