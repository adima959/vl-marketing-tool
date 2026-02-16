'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Popconfirm } from 'antd';
import { CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import type { MessageDetail, Campaign, Geography, PipelineStage } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { EditableField } from '@/components/ui/EditableField';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { PipelineStageBadge } from './PipelineStageBadge';
import { CampaignModal } from './CampaignModal';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { StrategyCopyTab } from './StrategyCopyTab';
import { MarketExecutionTab } from './MarketExecutionTab';
import { ActivityLogSection } from './ActivityLogSection';
import styles from './ConceptDetailPanel.module.css';

const { TextArea } = Input;

type DetailTab = 'strategy' | 'execution' | 'activity';

interface ConceptDetailPanelProps {
  open: boolean;
  message: MessageDetail | null;
  onClose: () => void;
}

export function ConceptDetailPanel({ open, message, onClose }: ConceptDetailPanelProps) {
  const {
    moveMessage, updateMessageField, selectMessage, deleteMessage,
    deleteCampaign,
    addGeo, updateGeoStage, removeGeo,
    messageHistory, angles,
    detailTab: activeTab, setDetailTab: setActiveTab,
  } = usePipelineStore();
  const [iterateReason, setIterateReason] = useState('');
  const [showIterateForm, setShowIterateForm] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [modalGeo, setModalGeo] = useState<Geography | undefined>(undefined);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Version navigation stack — stores {id, name} of messages we navigated away from
  // IMPORTANT: Only update versionStackRef inside handlers — never overwrite it during render,
  // because Zustand re-renders can fire before React state updates are flushed.
  const [versionStack, setVersionStack] = useState<{ id: string; name: string }[]>([]);
  const versionStackRef = useRef<{ id: string; name: string }[]>([]);
  const isVersionNav = useRef(false);

  // Dismiss = go back one version level, or close panel if at root
  const handleDismiss = useCallback(() => {
    const stack = versionStackRef.current;
    if (stack.length > 0) {
      const prev = stack[stack.length - 1];
      const next = stack.slice(0, -1);
      isVersionNav.current = true;
      versionStackRef.current = next;
      setVersionStack(next);
      selectMessage(prev.id);
    } else {
      onClose();
    }
  }, [onClose, selectMessage]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, handleDismiss]);

  // Reset tab when opening a fresh message (not via version navigation)
  const prevMessageId = useRef<string | null>(null);
  useEffect(() => {
    if (open && message?.id !== prevMessageId.current) {
      if (!isVersionNav.current) {
        // Opening from the board — clear version stack
        versionStackRef.current = [];
        setVersionStack([]);
      }
      // Only clear the flag once the message has fully loaded (not during null loading state)
      if (message?.id) {
        isVersionNav.current = false;
      }
      setActiveTab('strategy');
      setShowIterateForm(false);
      setIterateReason('');
      prevMessageId.current = message?.id ?? null;
    }
  }, [open, message?.id]);

  const handleFieldChange = useCallback((field: string, value: string | string[] | unknown[]) => {
    if (!message) return;
    if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field]);
    debounceTimers.current[field] = setTimeout(() => {
      updateMessageField(message.id, field, value);
    }, 600);
  }, [message, updateMessageField]);

  const handleStageChange = useCallback((newStage: PipelineStage) => {
    if (!message) return;
    moveMessage(message.id, newStage);
  }, [message, moveMessage]);

  const handleKill = useCallback(() => {
    if (!message) return;
    moveMessage(message.id, 'retired', 'kill');
  }, [message, moveMessage]);

  const handleIterate = useCallback(() => {
    if (!message || !iterateReason.trim()) return;
    moveMessage(message.id, 'retired', 'iterate', iterateReason.trim());
    setIterateReason('');
    setShowIterateForm(false);
  }, [message, moveMessage, iterateReason]);

  const handleVersionClick = useCallback((targetMessageId: string) => {
    if (!message) return;
    const next = [...versionStackRef.current, { id: message.id, name: message.name }];
    isVersionNav.current = true;
    versionStackRef.current = next;
    setVersionStack(next);
    selectMessage(targetMessageId);
  }, [message, selectMessage]);

  const handleVersionBack = useCallback(() => {
    const stack = versionStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    isVersionNav.current = true;
    versionStackRef.current = next;
    setVersionStack(next);
    selectMessage(prev.id);
  }, [selectMessage]);

  const handleOpenCampaignModal = useCallback((geo: Geography | undefined, campaign: Campaign | null) => {
    setModalGeo(geo);
    setEditingCampaign(campaign);
    setCampaignModalOpen(true);
  }, []);


  if (!open) return null;

  // Loading state — skeleton mimicking the panel layout
  if (!message) {
    return createPortal(
      <div className={styles.overlay}>
        <div className={styles.backdrop} onClick={handleDismiss} />
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.headerInner}>
              <div className={styles.headerTop}>
                <div className={styles.skeletonBar} style={{ width: '35%', height: 24 }} />
                <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6, marginLeft: 'auto' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
                <div className={styles.skeletonBar} style={{ width: 80, height: 24, borderRadius: 12 }} />
                <div className={styles.skeletonBar} style={{ width: 1, height: 14 }} />
                <div className={styles.skeletonBar} style={{ width: 70, height: 22 }} />
                <div className={styles.skeletonBar} style={{ width: 100, height: 22 }} />
                <div className={styles.skeletonBar} style={{ width: 1, height: 14 }} />
                <div className={styles.skeletonBar} style={{ width: 90, height: 22 }} />
                <div className={styles.skeletonBar} style={{ width: 70, height: 26, borderRadius: 6, marginLeft: 'auto' }} />
                <div className={styles.skeletonBar} style={{ width: 50, height: 26, borderRadius: 6 }} />
              </div>
              <div className={styles.tabBar}>
                <span style={{ padding: '10px 16px' }}><span className={styles.skeletonBar} style={{ display: 'block', width: 110, height: 14 }} /></span>
                <span style={{ padding: '10px 16px' }}><span className={styles.skeletonBar} style={{ display: 'block', width: 120, height: 14 }} /></span>
              </div>
            </div>
          </div>
          <div className={styles.body}>
            <div className={styles.bodyContent}>
              <div className={styles.hypothesisGrid}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={styles.hypothesisCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div className={styles.skeletonBar} style={{ width: 22, height: 22, borderRadius: '50%' }} />
                      <div className={styles.skeletonBar} style={{ width: '50%', height: 11 }} />
                    </div>
                    <div className={styles.skeletonBar} style={{ width: '90%', height: 14, marginBottom: 6 }} />
                    <div className={styles.skeletonBar} style={{ width: '65%', height: 14 }} />
                  </div>
                ))}
              </div>
              <div className={styles.copyVariationsSection}>
                <div className={styles.copyVariationsHeader}>
                  <div className={styles.skeletonBar} style={{ width: 120, height: 16 }} />
                  <div className={styles.skeletonBar} style={{ width: 55, height: 18, borderRadius: 10 }} />
                </div>
                <div className={styles.copyTableWrap}>
                  <div style={{ display: 'flex', padding: '6px 10px', gap: 0, background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' }}>
                    <div style={{ width: 32 }} />
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 560, padding: '0 10px' }}>
                        <div className={styles.skeletonBar} style={{ width: 80, height: 12 }} />
                      </div>
                    ))}
                  </div>
                  {[0, 1].map(i => (
                    <div key={i} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--color-gray-100)' }}>
                      <div style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                        <div className={styles.skeletonBar} style={{ width: 12, height: 12 }} />
                      </div>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(j => (
                        <div key={j} style={{ width: 140, padding: '0 8px' }}>
                          <div className={styles.skeletonBar} style={{ width: '80%', height: 14 }} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const product = message.product;
  const isRetired = message.pipelineStage === 'retired';

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={handleDismiss} />
      <div className={styles.panel}>
        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerInner}>
            {versionStack.length > 0 && (
              <button type="button" className={styles.versionBackBanner} onClick={handleVersionBack}>
                <ArrowLeftOutlined />
                <span>Back to {versionStack[versionStack.length - 1].name}</span>
              </button>
            )}
            <div className={styles.headerTop}>
              <div className={styles.panelTitle}>
                <EditableField
                  value={message.name}
                  onChange={(val) => handleFieldChange('name', val)}
                  placeholder="Message name..."
                />
              </div>
              <button type="button" className={styles.closeBtn} onClick={handleDismiss}>
                <CloseOutlined />
              </button>
            </div>

            <div className={styles.headerMeta}>
              <PipelineStageBadge
                stage={message.pipelineStage || 'backlog'}
                editable
                onChange={handleStageChange}
              />
              {message.version && message.version > 1 && (
                <span className={styles.versionBadge}>v{message.version}</span>
              )}
              {message.parentMessageId && (
                <button
                  type="button"
                  className={styles.versionOriginLink}
                  onClick={() => handleVersionClick(message.parentMessageId!)}
                >
                  from v{(message.version || 1) - 1}
                </button>
              )}
              <span className={styles.metaDivider} />
              {product && (
                <span
                  className={`${styles.metaTag} ${styles.metaTagProduct}`}
                  style={product.color ? {
                    color: product.color,
                    background: `color-mix(in srgb, ${product.color} 12%, transparent)`,
                  } : undefined}
                >
                  {product.name}
                </span>
              )}
              {product && (
                <EditableSelect
                  value={message.angleId}
                  options={angles.filter(a => a.productId === product.id).map(a => ({ value: a.id, label: a.name }))}
                  onChange={(value) => updateMessageField(message.id, 'angleId', value)}
                  displayLabel={message.angle?.name || 'Select angle'}
                  className={styles.angleSelect}
                />
              )}
              {message.owner && (
                <>
                  <span className={styles.metaDivider} />
                  <span className={styles.metaDetail}>
                    <span className={styles.metaDetailLabel}>Owner</span> {message.owner.name}
                  </span>
                </>
              )}
              <div className={styles.headerActions}>
                {!isRetired && (
                  <>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnIterate}`}
                      onClick={() => setShowIterateForm(true)}
                    >
                      Iterate
                    </button>
                    <Popconfirm
                      title="Kill this message?"
                      description="Retires the message and stops all campaigns."
                      onConfirm={handleKill}
                      okText="Kill"
                      okButtonProps={{ danger: true }}
                    >
                      <button type="button" className={`${styles.actionBtn} ${styles.actionBtnKill}`}>
                        Kill
                      </button>
                    </Popconfirm>
                  </>
                )}
                <Popconfirm
                  title="Delete this message?"
                  description="This action cannot be undone."
                  onConfirm={() => deleteMessage(message.id)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </div>
            </div>

            {/* Tab bar */}
            <div className={styles.tabBar}>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'strategy' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('strategy')}
              >
                Strategy & Copy
              </button>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === 'execution' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('execution')}
              >
                Market Execution
              </button>
              <div className={styles.tabSpacer} />
              <button
                type="button"
                className={`${styles.tab} ${styles.tabMuted} ${activeTab === 'activity' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('activity')}
              >
                Activity
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>
          <div className={styles.bodyContent}>
            {showIterateForm && (
              <div className={styles.iterateForm}>
                <div className={styles.iterateLabel}>Why are you iterating? (required)</div>
                <TextArea
                  value={iterateReason}
                  onChange={(e) => setIterateReason(e.target.value)}
                  placeholder="CPA too high on Meta NO ($38 vs $28 target). Pivot hook to morning routine angle instead."
                  rows={3}
                />
                <div className={styles.iterateActions}>
                  <Button size="small" onClick={() => { setShowIterateForm(false); setIterateReason(''); }}>
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!iterateReason.trim()}
                    onClick={handleIterate}
                  >
                    Create v{(message.version || 1) + 1}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'strategy' && (
              <StrategyCopyTab
                message={message}
                onFieldChange={handleFieldChange}
              />
            )}

            {activeTab === 'activity' && (
              <ActivityLogSection messageHistory={messageHistory} />
            )}

            {activeTab === 'execution' && (
              <MarketExecutionTab
                message={message}
                onAddGeo={addGeo}
                onUpdateGeoStage={updateGeoStage}
                onRemoveGeo={removeGeo}
                onDeleteCampaign={deleteCampaign}
                onOpenCampaignModal={handleOpenCampaignModal}
              />
            )}
          </div>
        </div>

        {/* Modals */}
        <CampaignModal
          open={campaignModalOpen}
          onClose={() => { setCampaignModalOpen(false); setEditingCampaign(null); setModalGeo(undefined); }}
          messageId={message.id}
          campaign={editingCampaign}
          defaultGeo={modalGeo}
        />
      </div>
    </div>,
    document.body,
  );
}
