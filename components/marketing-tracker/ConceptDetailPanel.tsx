'use client';

import { useState, useCallback, useRef } from 'react';
import { Drawer, Button, Input, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { MessageDetail, Campaign, Geography, PipelineStage } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { EditableField } from '@/components/ui/EditableField';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { PipelineStageBadge } from './PipelineStageBadge';
import { CampaignModal } from './CampaignModal';
import { AssetModal } from './AssetModal';
import { CreativeModal } from './CreativeModal';
import { HypothesisSection } from './HypothesisSection';
import { GeoTracksSection } from './GeoTracksSection';
import { VersionHistorySection } from './VersionHistorySection';
import { ActivityLogSection } from './ActivityLogSection';
import styles from './ConceptDetailPanel.module.css';

const { TextArea } = Input;

interface ConceptDetailPanelProps {
  open: boolean;
  message: MessageDetail | null;
  onClose: () => void;
}

export function ConceptDetailPanel({ open, message, onClose }: ConceptDetailPanelProps) {
  const {
    moveMessage, updateMessageField, selectMessage, deleteMessage,
    deleteCampaign, deleteAsset, deleteCreative,
    addGeo, updateGeoStage, removeGeo,
    messageHistory, angles,
  } = usePipelineStore();

  const [iterateReason, setIterateReason] = useState('');
  const [showIterateForm, setShowIterateForm] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
  const [modalGeo, setModalGeo] = useState<Geography | undefined>(undefined);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const handleFieldChange = useCallback((field: string, value: string | string[]) => {
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

  const handleVersionClick = useCallback((messageId: string) => {
    selectMessage(messageId);
  }, [selectMessage]);

  const handleOpenCampaignModal = useCallback((geo: Geography | undefined, campaign: Campaign | null) => {
    setModalGeo(geo);
    setEditingCampaign(campaign);
    setCampaignModalOpen(true);
  }, []);

  const handleOpenAssetModal = useCallback((geo: Geography | undefined) => {
    setModalGeo(geo);
    setAssetModalOpen(true);
  }, []);

  const handleOpenCreativeModal = useCallback((geo: Geography | undefined) => {
    setModalGeo(geo);
    setCreativeModalOpen(true);
  }, []);

  if (!message) return null;

  const product = message.product;
  const isRetired = message.pipelineStage === 'retired';

  return (
    <Drawer
      title={null}
      placement="right"
      size="large"
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 0 } }}
      className={styles.drawer}
    >
      {/* Header zone */}
      <div className={styles.headerZone}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <EditableField
              value={message.name}
              onChange={(val) => handleFieldChange('name', val)}
              placeholder="Message name..."
            />
          </div>
          <PipelineStageBadge
            stage={message.pipelineStage || 'backlog'}
            editable
            onChange={handleStageChange}
          />
          {message.version && message.version > 1 && (
            <span className={styles.versionBadge}>v{message.version}</span>
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

        <div className={styles.panelMeta}>
          {product && <span className={`${styles.metaTag} ${styles.metaTagProduct}`}>{product.name}</span>}
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
            <div className={styles.metaRight}>
              <span className={styles.metaDivider} />
              <span className={styles.metaDetail}><span className={styles.metaDetailLabel}>Owner</span> {message.owner.name}</span>
            </div>
          )}
        </div>

        {!isRetired && (
          <div className={styles.headerActions}>
            <button
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
              <button className={`${styles.actionBtn} ${styles.actionBtnKill}`}>
                Kill
              </button>
            </Popconfirm>
          </div>
        )}
      </div>

      <div className={styles.panelBody}>
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

        <HypothesisSection message={message} onFieldChange={handleFieldChange} />

        <GeoTracksSection
          message={message}
          onAddGeo={addGeo}
          onUpdateGeoStage={updateGeoStage}
          onRemoveGeo={removeGeo}
          onDeleteCampaign={deleteCampaign}
          onDeleteAsset={deleteAsset}
          onDeleteCreative={deleteCreative}
          onOpenCampaignModal={handleOpenCampaignModal}
          onOpenAssetModal={handleOpenAssetModal}
          onOpenCreativeModal={handleOpenCreativeModal}
        />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Strategy Notes</div>
          <EditableField
            value={message.notes || ''}
            onChange={(val) => handleFieldChange('notes', val)}
            placeholder="Add strategy notes..."
            multiline
          />
        </div>

        <VersionHistorySection message={message} onVersionClick={handleVersionClick} />

        <ActivityLogSection messageHistory={messageHistory} />

      </div>

      <CampaignModal
        open={campaignModalOpen}
        onClose={() => { setCampaignModalOpen(false); setEditingCampaign(null); setModalGeo(undefined); }}
        messageId={message.id}
        campaign={editingCampaign}
        defaultGeo={modalGeo}
      />
      <AssetModal
        open={assetModalOpen}
        onClose={() => { setAssetModalOpen(false); setModalGeo(undefined); }}
        messageId={message.id}
        defaultGeo={modalGeo}
      />
      <CreativeModal
        open={creativeModalOpen}
        onClose={() => { setCreativeModalOpen(false); setModalGeo(undefined); }}
        messageId={message.id}
        defaultGeo={modalGeo}
      />
    </Drawer>
  );
}
