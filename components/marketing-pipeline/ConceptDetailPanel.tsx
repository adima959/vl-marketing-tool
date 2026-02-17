'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQueryState, parseAsString } from 'nuqs';
import { App, Button, Input, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { CloseOutlined, DeleteOutlined, CalendarOutlined, SwapOutlined, MoreOutlined, StopOutlined, ArrowLeftOutlined, LeftOutlined, RightOutlined, HistoryOutlined, AimOutlined } from '@ant-design/icons';
import { FolderOpen } from 'lucide-react';
import { PIPELINE_STAGES_ORDER, PIPELINE_STAGE_CONFIG } from '@/types';
import { formatLocalDate } from '@/lib/types/api';
import type { MessageDetail, Campaign, PipelineStage } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { EditableField } from '@/components/ui/EditableField';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { PipelineStageBadge } from './PipelineStageBadge';
import { CpaTargetsModal } from './CpaTargetsModal';
import { StrategyCopyTab } from './StrategyCopyTab';
import { ActivityLogSection } from './ActivityLogSection';
import { CampaignDetailContent } from './CampaignDetailContent';
import styles from './ConceptDetailPanel.module.css';

const { TextArea } = Input;

type DetailTab = 'strategy' | 'activity';

interface ConceptDetailPanelProps {
  open: boolean;
  message: MessageDetail | null;
  onClose: () => void;
}

export function ConceptDetailPanel({ open, message, onClose }: ConceptDetailPanelProps) {
  const { modal } = App.useApp();
  const {
    moveMessage, updateMessageField, selectMessage, deleteMessage,
    addCampaign, deleteCampaign,
    addGeo, updateGeoStage, removeGeo,
    messageHistory, angles,
    detailTab: activeTab, setDetailTab: setActiveTab,
    campaignPerformance, campaignPerformanceLoading, fetchCampaignPerformance,
    loadPipeline,
  } = usePipelineStore();
  const [iterateReason, setIterateReason] = useState('');
  const [showIterateForm, setShowIterateForm] = useState(false);
  const [campaignView, setCampaignView] = useState<Campaign | null>(null);
  const [showCpaTargets, setShowCpaTargets] = useState(false);
  const [perfDateRange, setPerfDateRange] = useState<{ start: Date; end: Date }>(() => {
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    return { start, end };
  });
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  // URL state for campaign view
  const [urlCampaignId, setUrlCampaignId] = useQueryState('campaignId', parseAsString.withOptions({
    history: 'replace',
    shallow: true,
  }));

  // Version navigation stack — stores {id, name} of messages we navigated away from
  // IMPORTANT: Only update versionStackRef inside handlers — never overwrite it during render,
  // because Zustand re-renders can fire before React state updates are flushed.
  const [versionStack, setVersionStack] = useState<{ id: string; name: string }[]>([]);
  const versionStackRef = useRef<{ id: string; name: string }[]>([]);
  const isVersionNav = useRef(false);

  // Dismiss = campaign view → version stack → close panel
  const handleDismiss = useCallback(() => {
    if (campaignView) {
      setCampaignView(null);
      requestAnimationFrame(() => bodyRef.current?.scrollTo(0, 0));
      return;
    }
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
  }, [campaignView, onClose, selectMessage]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, handleDismiss]);

  // Update page title based on current view
  useEffect(() => {
    if (!open || !message) return;
    const base = 'Marketing Pipeline';
    const prev = document.title;
    if (campaignView) {
      const campName = campaignPerformance[campaignView.id]?.campaignName || campaignView.name || campaignView.externalId || 'Campaign';
      document.title = `${campName} — ${message.name} | ${base}`;
    } else {
      document.title = `${message.name} | ${base}`;
    }
    return () => { document.title = prev; };
  }, [open, message?.name, message?.id, campaignView, campaignPerformance]);

  // Sync campaignView to URL
  useEffect(() => {
    setUrlCampaignId(campaignView?.id ?? null);
  }, [campaignView, setUrlCampaignId]);

  // Reset tab when opening a fresh message (not via version navigation)
  const prevMessageId = useRef<string | null>(null);
  const prevCampaignId = useRef<string | null>(null);

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

      // Set campaign view from URL or clear
      if (urlCampaignId && message?.campaigns) {
        const campaign = message.campaigns.find(c => c.id === urlCampaignId);
        setCampaignView(campaign ?? null);
        prevCampaignId.current = urlCampaignId;
      } else {
        setCampaignView(null);
        prevCampaignId.current = null;
      }
    }
    // Also handle case where URL campaignId changes without message changing
    else if (open && message && urlCampaignId !== prevCampaignId.current) {
      if (urlCampaignId && message.campaigns) {
        const campaign = message.campaigns.find(c => c.id === urlCampaignId);
        setCampaignView(campaign ?? null);
        prevCampaignId.current = urlCampaignId;
      } else if (!urlCampaignId) {
        setCampaignView(null);
        prevCampaignId.current = null;
      }
    }
  }, [open, message?.id, message?.campaigns, urlCampaignId, message]);

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

  const handleCampaignClick = useCallback((campaign: Campaign) => {
    setCampaignView(campaign);
    requestAnimationFrame(() => bodyRef.current?.scrollTo(0, 0));
  }, []);

  const handlePerfDateRangeChange = useCallback((range: { start: Date; end: Date }) => {
    setPerfDateRange(range);
    if (message) {
      fetchCampaignPerformance(message.id, {
        start: formatLocalDate(range.start),
        end: formatLocalDate(range.end),
      });
    }
  }, [message, fetchCampaignPerformance]);

  // Fetch campaign performance when message loads/changes
  useEffect(() => {
    if (message?.id && message.campaigns.length > 0) {
      fetchCampaignPerformance(message.id, {
        start: formatLocalDate(perfDateRange.start),
        end: formatLocalDate(perfDateRange.end),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, message?.campaigns.length, fetchCampaignPerformance]);


  if (!open) return null;

  // Loading state — skeleton mimicking the panel layout
  if (!message) {
    return createPortal(
      <div className={styles.overlay}>
        <div className={styles.backdrop} onClick={handleDismiss} />
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.headerInner}>
              {/* Skeleton Row 1: Meta + Controls */}
              <div className={styles.headerMeta}>
                <div className={styles.skeletonBar} style={{ width: 80, height: 20, borderRadius: 4 }} />
                <div className={styles.skeletonBar} style={{ width: 60, height: 14 }} />
                <div className={styles.skeletonBar} style={{ width: 1, height: 14 }} />
                <div className={styles.skeletonBar} style={{ width: 22, height: 22, borderRadius: '50%' }} />
                <div className={styles.skeletonBar} style={{ width: 90, height: 14 }} />
                <div className={styles.skeletonBar} style={{ width: 1, height: 14 }} />
                <div className={styles.skeletonBar} style={{ width: 70, height: 14 }} />
                <div className={styles.headerControls}>
                  <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6 }} />
                  <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6 }} />
                  <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6 }} />
                </div>
              </div>
              {/* Skeleton Row 2: Stage + Title */}
              <div className={styles.headerTitle}>
                <div className={styles.skeletonBar} style={{ width: 80, height: 24, borderRadius: 12 }} />
                <div className={styles.skeletonBar} style={{ width: '45%', height: 28 }} />
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
  const currentStageIdx = PIPELINE_STAGES_ORDER.indexOf(message.pipelineStage || 'backlog');
  const prevStage = currentStageIdx > 0 ? PIPELINE_STAGES_ORDER[currentStageIdx - 1] : null;
  const nextStage = currentStageIdx < PIPELINE_STAGES_ORDER.length - 1 ? PIPELINE_STAGES_ORDER[currentStageIdx + 1] : null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={handleDismiss} />
      <div className={styles.panel}>
        {/* ── Header ── */}
        <div className={campaignView ? styles.headerCampaignView : styles.header}>
          <div className={styles.headerInner}>
            {campaignView ? (
              <button type="button" className={styles.campaignBackBanner} onClick={() => setCampaignView(null)}>
                <ArrowLeftOutlined />
                <span>Back to {message.name}</span>
              </button>
            ) : versionStack.length > 0 ? (
              <button type="button" className={styles.versionBackBanner} onClick={handleVersionBack}>
                <ArrowLeftOutlined />
                <span>Back to {versionStack[versionStack.length - 1].name}</span>
              </button>
            ) : null}

            {!campaignView && (
              <>
                {/* Row 1 — Meta + Controls */}
                <div className={styles.headerMeta}>
                  {product && (
                    <Tooltip title="Product" mouseEnterDelay={0.15}>
                      <span
                        className={styles.metaTagProduct}
                        style={product.color ? {
                          color: product.color,
                          background: `color-mix(in srgb, ${product.color} 12%, transparent)`,
                        } : undefined}
                      >
                        {product.name}
                      </span>
                    </Tooltip>
                  )}
                  {product && (
                    <>
                      <span className={styles.breadcrumbSep}>/</span>
                      <Tooltip title="Angle" mouseEnterDelay={0.15}>
                        <span>
                          <EditableSelect
                            value={message.angleId}
                            options={angles.filter(a => a.productId === product.id).map(a => ({ value: a.id, label: a.name }))}
                            onChange={(value) => updateMessageField(message.id, 'angleId', value)}
                            displayLabel={message.angle?.name || 'Select angle'}
                            className={styles.angleSelect}
                          />
                        </span>
                      </Tooltip>
                    </>
                  )}
                  {message.owner && (
                    <>
                      <span className={styles.metaDivider} />
                      <Tooltip title="Owner" mouseEnterDelay={0.15}>
                        <span className={styles.ownerMeta}>
                          <span className={styles.ownerAvatar}>
                            {message.owner.name.charAt(0).toUpperCase()}
                          </span>
                          {message.owner.name}
                        </span>
                      </Tooltip>
                    </>
                  )}
                  {message.createdAt && (
                    <>
                      <span className={styles.metaDivider} />
                      <Tooltip title="Created date" mouseEnterDelay={0.15}>
                        <span className={styles.dateMeta}>
                          <CalendarOutlined />
                          {message.createdAt.slice(0, 10)}
                        </span>
                      </Tooltip>
                    </>
                  )}
                  {message.driveFolderId && (
                    <>
                      <span className={styles.metaDivider} />
                      <Tooltip title="Google Drive folder" mouseEnterDelay={0.15}>
                        <a
                          href={`https://drive.google.com/drive/folders/${message.driveFolderId}`}
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
                    <button type="button" className={styles.controlBtn} onClick={handleDismiss} title="Close">
                      <CloseOutlined />
                    </button>
                  </div>
                </div>

                {/* Row 2 — Stage + Title */}
                <div className={styles.headerTitle}>
                  <div className={styles.stageGroup}>
                    <Tooltip title="Pipeline stage" mouseEnterDelay={0.15}>
                      <span>
                        <PipelineStageBadge
                          stage={message.pipelineStage || 'backlog'}
                          editable
                          onChange={handleStageChange}
                          variant="dot"
                        />
                      </span>
                    </Tooltip>
                    {(prevStage || nextStage) && (
                      <>
                        <span className={styles.stageGroupDivider} />
                        {prevStage ? (
                          <Tooltip title={`Move to ${PIPELINE_STAGE_CONFIG[prevStage].label}`} mouseEnterDelay={0.15}>
                            <button
                              type="button"
                              className={styles.stageArrow}
                              onClick={() => handleStageChange(prevStage)}
                            >
                              <LeftOutlined />
                            </button>
                          </Tooltip>
                        ) : (
                          <span className={styles.stageArrowPlaceholder} />
                        )}
                        {nextStage ? (
                          <Tooltip title={`Move to ${PIPELINE_STAGE_CONFIG[nextStage].label}`} mouseEnterDelay={0.15}>
                            <button
                              type="button"
                              className={styles.stageArrow}
                              onClick={() => handleStageChange(nextStage)}
                            >
                              <RightOutlined />
                            </button>
                          </Tooltip>
                        ) : (
                          <span className={styles.stageArrowPlaceholder} />
                        )}
                      </>
                    )}
                  </div>
                  <div className={styles.titleText} title="Message name">
                    <EditableField
                      value={message.name}
                      onChange={(val) => handleFieldChange('name', val)}
                      placeholder="Message name..."
                    />
                  </div>
                  {message.version && message.version > 1 && (
                    <span className={styles.versionBadge} title="Version">v{message.version}</span>
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
                  <div className={styles.titleActions}>
                    <Tooltip title="CPA Targets" mouseEnterDelay={0.15}>
                      <button
                        type="button"
                        className={styles.controlBtn}
                        onClick={() => setShowCpaTargets(true)}
                      >
                        <AimOutlined />
                      </button>
                    </Tooltip>
                    <button
                      type="button"
                      className={`${styles.controlBtn} ${activeTab === 'activity' ? styles.controlBtnActive : ''}`}
                      onClick={() => setActiveTab(activeTab === 'activity' ? 'strategy' : 'activity')}
                      title="Activity log"
                    >
                      <HistoryOutlined />
                    </button>
                    <Dropdown
                      menu={{
                        items: [
                          ...(!isRetired ? [
                            {
                              key: 'iterate',
                              label: 'Iterate Angle',
                              icon: <SwapOutlined />,
                              onClick: () => setShowIterateForm(true),
                            },
                            {
                              key: 'kill',
                              label: 'Kill Message',
                              icon: <StopOutlined />,
                              danger: true,
                              onClick: () => {
                                modal.confirm({
                                  title: 'Kill this message?',
                                  content: 'Retires the message and stops all campaigns.',
                                  okText: 'Kill',
                                  okButtonProps: { danger: true },
                                  onOk: handleKill,
                                });
                              },
                            },
                            { type: 'divider' as const, key: 'div' },
                          ] : []),
                          {
                            key: 'delete',
                            label: 'Delete Message',
                            icon: <DeleteOutlined />,
                            danger: true,
                            onClick: () => {
                              modal.confirm({
                                title: 'Delete this message?',
                                content: 'This action cannot be undone.',
                                okText: 'Delete',
                                okButtonProps: { danger: true },
                                onOk: () => deleteMessage(message.id),
                              });
                            },
                          },
                        ] as MenuProps['items'],
                      }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <button type="button" className={styles.controlBtn} title="Actions">
                        <MoreOutlined />
                      </button>
                    </Dropdown>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div ref={bodyRef} className={styles.body}>
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

            {campaignView ? (
              <CampaignDetailContent
                campaign={campaignView}
                performance={campaignPerformance[campaignView.id] ?? null}
                performanceLoading={campaignPerformanceLoading}
                product={message.product}
                dateRange={perfDateRange}
                onDateRangeChange={handlePerfDateRangeChange}
              />
            ) : (
              <>
                {activeTab === 'strategy' && (
                  <StrategyCopyTab
                    message={message}
                    performanceData={campaignPerformance}
                    performanceLoading={campaignPerformanceLoading}
                    dateRange={perfDateRange}
                    onDateRangeChange={handlePerfDateRangeChange}
                    onFieldChange={handleFieldChange}
                    onAddGeo={addGeo}
                    onUpdateGeoStage={updateGeoStage}
                    onRemoveGeo={removeGeo}
                    onDeleteCampaign={deleteCampaign}
                    onAddCampaign={addCampaign}
                    onCampaignClick={handleCampaignClick}
                  />
                )}

                {activeTab === 'activity' && (
                  <ActivityLogSection messageHistory={messageHistory} />
                )}
              </>
            )}
          </div>
        </div>

        {message.product && (
          <CpaTargetsModal
            open={showCpaTargets}
            product={message.product}
            onClose={() => setShowCpaTargets(false)}
            onSave={loadPipeline}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
