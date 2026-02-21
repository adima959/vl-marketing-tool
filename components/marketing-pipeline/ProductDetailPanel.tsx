'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import { CloseOutlined, RightOutlined, DownOutlined, FileTextOutlined } from '@ant-design/icons';
import { FolderOpen, Target, FlaskConical, Swords, MessageSquareQuote, Loader2, Check, AlertCircle } from 'lucide-react';
import { NotionEditor } from '@/components/ui/NotionEditor';
import type { SaveStatus } from '@/components/ui/NotionEditor';
import { ProductAssetsTab } from '@/components/marketing-pipeline/ProductAssetsTab';
import { InlineCpaTargetsGrid } from '@/components/marketing-pipeline/InlineCpaTargetsGrid';
import { ProductAnglesTab } from '@/components/marketing-pipeline/ProductAnglesTab';
import { usePipelineStore } from '@/stores/pipelineStore';
import type { Product } from '@/types';
import styles from './ConceptDetailPanel.module.css';

type PanelTab = 'research' | 'assets' | 'angles';

interface ProductDetailPanelProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}

// ── Status indicator for accordion header ─────────────────

function StatusIndicator({ status }: { status: SaveStatus }): React.ReactNode {
  if (status === 'idle') return null;
  return (
    <span
      className={`${styles.accordionStatus} ${
        status === 'saving' ? styles.accordionStatusSaving :
        status === 'saved' ? styles.accordionStatusSaved :
        styles.accordionStatusError
      }`}
    >
      {status === 'saving' && <><Loader2 size={11} className={styles.accordionStatusSpinner} /> Saving</>}
      {status === 'saved' && <><Check size={11} /> Saved</>}
      {status === 'error' && <><AlertCircle size={11} /> Error</>}
    </span>
  );
}

// ── Accordion helper ────────────────────────────────────

interface AccordionSectionProps {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  saveStatus?: SaveStatus;
  children: React.ReactNode;
}

function AccordionSection({ id, label, description, icon, isOpen, onToggle, saveStatus, children }: AccordionSectionProps): React.ReactNode {
  return (
    <div className={styles.accordionSection}>
      <button type="button" className={styles.accordionHeader} onClick={onToggle} aria-expanded={isOpen} aria-controls={`accordion-${id}`}>
        <span className={styles.accordionChevron}>
          {isOpen ? <DownOutlined /> : <RightOutlined />}
        </span>
        <span className={styles.accordionIcon}>{icon}</span>
        <span className={styles.accordionLabel}>{label}</span>
        {saveStatus && <StatusIndicator status={saveStatus} />}
      </button>
      {isOpen && (
        <div className={styles.accordionContent} id={`accordion-${id}`}>
          {description && <p className={styles.accordionDescription}>{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────

export function ProductDetailPanel({ open, product, onClose }: ProductDetailPanelProps): React.ReactNode {
  const [activeTab, setActiveTab] = useState<PanelTab>('research');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sectionStatus, setSectionStatus] = useState<Record<string, SaveStatus>>({});
  const updateProductField = usePipelineStore(s => s.updateProductField);
  const angles = usePipelineStore(s => s.angles);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Reset state when product changes
  useEffect(() => {
    setActiveTab('research');
    setExpanded(new Set());
    setSectionStatus({});
  }, [product?.id]);

  const toggleSection = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Save handler factory — one per field
  const handleSave = useCallback((field: string) => {
    return async (value: string): Promise<void> => {
      if (!product) return;
      await updateProductField(product.id, field, value);
    };
  }, [product, updateProductField]);

  // Status change handler factory — one per section
  const handleStatusChange = useCallback((sectionId: string) => {
    return (status: SaveStatus) => {
      setSectionStatus(prev => ({ ...prev, [sectionId]: status }));
    };
  }, []);

  const angleCount = useMemo(
    () => angles.filter(a => a.productId === product?.id).length,
    [angles, product?.id],
  );

  if (!open || !product) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panelNarrow}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInner}>
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

        {/* Tab Bar */}
        <div className={styles.productTabBar}>
          <button
            type="button"
            className={`${styles.productTab} ${activeTab === 'research' ? styles.productTabActive : ''}`}
            onClick={() => setActiveTab('research')}
          >
            Research
          </button>
          <button
            type="button"
            className={`${styles.productTab} ${activeTab === 'assets' ? styles.productTabActive : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            Assets
          </button>
          <button
            type="button"
            className={`${styles.productTab} ${activeTab === 'angles' ? styles.productTabActive : ''}`}
            onClick={() => setActiveTab('angles')}
          >
            Angles
            {angleCount > 0 && <span className={styles.productTabBadge}>{angleCount}</span>}
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.bodyContent}>
            {activeTab === 'research' && (
              <div className={styles.contentCard}>
                <p className={styles.researchPreamble}>
                  Research this product once — every campaign and angle will reference it. Without it, copywriters fall back on vague claims instead of real proof points.
                </p>
                <AccordionSection
                  id="cpa-targets"
                  label="CPA Targets"
                  description="The highest cost-per-acquisition where this product stays profitable. Used to decide whether to scale or stop an ad."
                  icon={<Target size={14} />}
                  isOpen={expanded.has('cpa-targets')}
                  onToggle={() => toggleSection('cpa-targets')}
                  saveStatus={sectionStatus['cpa-targets']}
                >
                  <InlineCpaTargetsGrid
                    product={product}
                    onStatusChange={handleStatusChange('cpa-targets')}
                  />
                </AccordionSection>

                <AccordionSection
                  id="ingredient-claims"
                  label="Ingredient Claims"
                  description="List each active ingredient with its approved health claim and how it can be framed. This is the factual base for all ad copy."
                  icon={<FlaskConical size={14} />}
                  isOpen={expanded.has('ingredient-claims')}
                  onToggle={() => toggleSection('ingredient-claims')}
                  saveStatus={sectionStatus['ingredient-claims']}
                >
                  <div className={styles.notesWrapperConstrained}>
                    <NotionEditor
                      value={product.ingredientClaims || ''}
                      onSave={handleSave('ingredientClaims')}
                      onStatusChange={handleStatusChange('ingredient-claims')}
                      hideStatusIndicator
                      placeholder="Add ingredient claims..."
                    />
                  </div>
                </AccordionSection>

                <AccordionSection
                  id="competitive-positioning"
                  label="Competitive Positioning"
                  description="Your top competitors and what makes you different from each. Helps copywriters position the product clearly against alternatives."
                  icon={<Swords size={14} />}
                  isOpen={expanded.has('competitive-positioning')}
                  onToggle={() => toggleSection('competitive-positioning')}
                  saveStatus={sectionStatus['competitive-positioning']}
                >
                  <div className={styles.notesWrapperConstrained}>
                    <NotionEditor
                      value={product.competitivePositioning || ''}
                      onSave={handleSave('competitivePositioning')}
                      onStatusChange={handleStatusChange('competitive-positioning')}
                      hideStatusIndicator
                      placeholder="Add competitive positioning..."
                    />
                  </div>
                </AccordionSection>

                <AccordionSection
                  id="customer-language"
                  label="Customer Language Bank"
                  description="Real quotes from customer reviews and comments. Positive quotes work as testimonial hooks in ads. Negative quotes reveal objections you can address."
                  icon={<MessageSquareQuote size={14} />}
                  isOpen={expanded.has('customer-language')}
                  onToggle={() => toggleSection('customer-language')}
                  saveStatus={sectionStatus['customer-language']}
                >
                  <div className={styles.notesWrapperConstrained}>
                    <NotionEditor
                      value={product.customerLanguageBank || ''}
                      onSave={handleSave('customerLanguageBank')}
                      onStatusChange={handleStatusChange('customer-language')}
                      hideStatusIndicator
                      placeholder="Add customer quotes and language insights..."
                    />
                  </div>
                </AccordionSection>

                <AccordionSection
                  id="notes"
                  label="Notes"
                  description="Any other useful context: brand guidelines, target audience, regulatory rules, or things to avoid in copy."
                  icon={<FileTextOutlined style={{ fontSize: 14 }} />}
                  isOpen={expanded.has('notes')}
                  onToggle={() => toggleSection('notes')}
                  saveStatus={sectionStatus['notes']}
                >
                  <div className={styles.notesWrapperConstrained}>
                    <NotionEditor
                      value={product.notes || ''}
                      onSave={handleSave('notes')}
                      onStatusChange={handleStatusChange('notes')}
                      hideStatusIndicator
                      placeholder="Add product notes, brand guidelines, target audience info..."
                    />
                  </div>
                </AccordionSection>
              </div>
            )}

            {activeTab === 'assets' && (
              <ProductAssetsTab
                productId={product.id}
                driveFolderId={product.driveFolderId}
                assetsFolderId={product.assetsFolderId}
              />
            )}

            {activeTab === 'angles' && (
              <div className={styles.contentCard}>
                <ProductAnglesTab product={product} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
