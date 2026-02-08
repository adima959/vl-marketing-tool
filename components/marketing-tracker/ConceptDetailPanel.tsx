'use client';

import { useState, useCallback, useRef } from 'react';
import { Drawer, Table, Button, Input, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MessageDetail, Campaign, Geography, PipelineStage } from '@/types';
import { GEO_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { usePipelineStore } from '@/stores/pipelineStore';
import { EditableField } from '@/components/ui/EditableField';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { EditableTags } from '@/components/ui/EditableTags';
import { PipelineStageBadge } from './PipelineStageBadge';
import { CampaignModal } from './CampaignModal';
import { AssetModal } from './AssetModal';
import { CreativeModal } from './CreativeModal';
import styles from './ConceptDetailPanel.module.css';

const { TextArea } = Input;

interface ConceptDetailPanelProps {
  open: boolean;
  message: MessageDetail | null;
  onClose: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatHistoryEntry(entry: { action: string; fieldName: string; oldValue: unknown; newValue: unknown }): string {
  if (entry.action === 'create') return 'Message created';
  if (entry.action === 'delete') return 'Message deleted';
  const field = entry.fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, s => s.toUpperCase());
  if (entry.fieldName === 'pipelineStage') return `Stage changed to ${entry.newValue}`;
  const oldStr = entry.oldValue != null ? String(entry.oldValue) : '—';
  const newStr = entry.newValue != null ? String(entry.newValue) : '—';
  if (oldStr === '—') return `${field} set to "${newStr}"`;
  return `${field} changed`;
}

export function ConceptDetailPanel({ open, message, onClose }: ConceptDetailPanelProps) {
  const { moveMessage, updateMessageField, selectMessage, deleteMessage, deleteCampaign, deleteAsset, deleteCreative, messageHistory, angles } = usePipelineStore();
  const [iterateReason, setIterateReason] = useState('');
  const [showIterateForm, setShowIterateForm] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
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

  const handleVerdict = useCallback((type: 'scale' | 'expand' | 'kill') => {
    if (!message) return;
    const targetStage = type === 'kill' ? 'retired' : 'winner';
    moveMessage(message.id, targetStage, type);
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

  if (!message) return null;

  const product = message.product;
  const totalSpend = message.campaigns.reduce((sum, c) => sum + c.spend, 0);

  // Campaign table columns
  const campaignColumns: ColumnsType<Campaign> = [
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      render: (channel: string) => channel.charAt(0).toUpperCase() + channel.slice(1),
    },
    {
      title: 'GEO',
      dataIndex: 'geo',
      key: 'geo',
      width: 50,
      render: (geo: Geography) => GEO_CONFIG[geo]?.flag || geo,
    },
    {
      title: 'CPA',
      dataIndex: 'cpa',
      key: 'cpa',
      width: 80,
      render: (cpa: number | undefined, record: Campaign) => {
        if (cpa == null) return '—';
        const target = product ? getCpaTarget(product, record.geo) : undefined;
        const health = getCpaHealth(cpa, target);
        const colorClass = health === 'green' ? styles.cpaGreen
          : health === 'yellow' ? styles.cpaYellow
          : health === 'red' ? styles.cpaRed
          : '';
        return (
          <span className={`${styles.cpaBadge} ${colorClass}`}>
            ${cpa}
            {health !== 'none' && <span className={`${styles.cpaDot} ${styles[health]}`} />}
          </span>
        );
      },
    },
    {
      title: 'Target',
      key: 'target',
      width: 60,
      render: (_: unknown, record: Campaign) => {
        const target = product ? getCpaTarget(product, record.geo) : undefined;
        return target != null ? `$${target}` : '—';
      },
    },
    {
      title: 'Spend',
      dataIndex: 'spend',
      key: 'spend',
      width: 70,
      render: (spend: number) => `$${spend}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      render: (status: string) => {
        const config = CAMPAIGN_STATUS_CONFIG[status as keyof typeof CAMPAIGN_STATUS_CONFIG];
        return config ? (
          <span style={{ color: config.color, fontSize: '11px', fontWeight: 500 }}>
            {config.label}
          </span>
        ) : status;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: Campaign) => (
        <span style={{ display: 'flex', gap: 8 }}>
          <EditOutlined
            style={{ fontSize: 12, color: 'var(--color-gray-400)', cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); setEditingCampaign(record); setCampaignModalOpen(true); }}
          />
          <Popconfirm title="Delete this campaign?" onConfirm={() => deleteCampaign(record.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <DeleteOutlined style={{ fontSize: 12, color: 'var(--color-gray-400)', cursor: 'pointer' }} />
          </Popconfirm>
        </span>
      ),
    },
  ];

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
      {/* Header zone — sticky, tinted background */}
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
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
            />
          </Popconfirm>
        </div>

        <div className={styles.panelMeta}>
          {product && <span className={`${styles.metaTag} ${styles.metaTagProduct}`}>{product.name}</span>}
          {product && (
            <EditableSelect
              value={message.angleId}
              options={angles.filter(a => a.productId === product.id).map(a => ({ value: a.id, label: a.name }))}
              onChange={(value) => {
                updateMessageField(message.id, 'angleId', value);
              }}
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
      </div>

      <div className={styles.panelBody}>

      {/* Verdict banner (only for verdict stage) */}
      {message.pipelineStage === 'verdict' && (
        <div className={styles.verdictBanner}>
          <div className={styles.verdictTitle}>
            VERDICT REQUIRED — ${totalSpend} spent, threshold: ${message.spendThreshold || 300}
          </div>
          <div className={styles.verdictButtons}>
            <button className={`${styles.verdictBtn} ${styles.verdictBtnScale}`} onClick={() => handleVerdict('scale')}>
              Scale
            </button>
            <button
              className={`${styles.verdictBtn} ${styles.verdictBtnIterate}`}
              onClick={() => setShowIterateForm(true)}
            >
              Iterate
            </button>
            <button className={`${styles.verdictBtn} ${styles.verdictBtnExpand}`} onClick={() => handleVerdict('expand')}>
              Expand
            </button>
            <button className={`${styles.verdictBtn} ${styles.verdictBtnKill}`} onClick={() => handleVerdict('kill')}>
              Kill
            </button>
          </div>

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
        </div>
      )}

      {/* Hypothesis */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Hypothesis</div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>Pain Point</div>
          <EditableField
            value={message.specificPainPoint || ''}
            onChange={(val) => handleFieldChange('specificPainPoint', val)}
            placeholder="What specific pain does the customer feel?"
            quoted
            multiline
          />
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>Core Promise</div>
          <EditableField
            value={message.corePromise || ''}
            onChange={(val) => handleFieldChange('corePromise', val)}
            placeholder="What do we promise to solve?"
            quoted
            multiline
          />
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>Key Idea</div>
          <EditableField
            value={message.keyIdea || ''}
            onChange={(val) => handleFieldChange('keyIdea', val)}
            placeholder="The insight that connects pain to solution"
            multiline
          />
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>Hook Direction</div>
          <EditableField
            value={message.primaryHookDirection || ''}
            onChange={(val) => handleFieldChange('primaryHookDirection', val)}
            placeholder="Creative direction for the hook"
            multiline
          />
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>Headlines</div>
          <EditableTags
            tags={message.headlines || []}
            onChange={(tags) => handleFieldChange('headlines', tags)}
            placeholder="New headline..."
            addLabel="Add headline"
          />
        </div>
      </div>

      {/* Campaigns */}
      <div className={styles.section}>
          <div className={styles.sectionTitle}>Campaigns</div>
          <Table
            columns={campaignColumns}
            dataSource={message.campaigns.map(c => ({ ...c, key: c.id }))}
            pagination={false}
            size="small"
            className={styles.campaignsTable}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <strong style={{ fontSize: '11px' }}>Total</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <strong style={{ fontSize: '11px' }}>${totalSpend}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            )}
          />
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => { setEditingCampaign(null); setCampaignModalOpen(true); }}
            style={{ marginTop: 8 }}
          >
            Add Campaign
          </Button>
        </div>

      {/* Assets */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Assets</div>
        <div className={styles.assetList}>
          {message.assets?.map(asset => (
            <span key={asset.id} className={styles.assetItem}>
              <span className={styles.assetIcon}>
                {asset.type === 'landing_page' ? '🔗' : asset.type === 'text_ad' ? '📝' : '📎'}
              </span>
              {asset.name}
              <Popconfirm title="Delete this asset?" onConfirm={() => deleteAsset(asset.id)} okText="Delete" okButtonProps={{ danger: true }}>
                <DeleteOutlined className={styles.assetDelete} />
              </Popconfirm>
            </span>
          ))}
        </div>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setAssetModalOpen(true)} style={{ marginTop: 8 }}>
          Add Asset
        </Button>
      </div>

      {/* Creatives */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Creatives</div>
        <div className={styles.assetList}>
          {message.creatives?.map(creative => (
            <span key={creative.id} className={styles.assetItem}>
              <span className={styles.assetIcon}>
                {creative.format === 'ugc_video' ? '🎬' : creative.format === 'static_image' ? '🖼' : '🎥'}
              </span>
              {creative.name}
              <Popconfirm title="Delete this creative?" onConfirm={() => deleteCreative(creative.id)} okText="Delete" okButtonProps={{ danger: true }}>
                <DeleteOutlined className={styles.assetDelete} />
              </Popconfirm>
            </span>
          ))}
        </div>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setCreativeModalOpen(true)} style={{ marginTop: 8 }}>
          Add Creative
        </Button>
      </div>

      {/* Strategy Notes */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Strategy Notes</div>
        <EditableField
          value={message.notes || ''}
          onChange={(val) => handleFieldChange('notes', val)}
          placeholder="Add strategy notes..."
          multiline
        />
      </div>

      {/* Version History */}
      {(message.parentMessageId || message.verdictType === 'iterate') && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Version History</div>
          {message.parentMessageId && (
            <div className={styles.activityItem}>
              Iterated from:{' '}
              <span
                className={styles.versionLink}
                onClick={() => handleVersionClick(message.parentMessageId!)}
              >
                v{(message.version || 1) - 1}
              </span>
              {message.verdictNotes && (
                <span style={{ display: 'block', marginTop: 4, color: 'var(--color-gray-500)', fontSize: '11px' }}>
                  Reason: {message.verdictNotes}
                </span>
              )}
            </div>
          )}
          {message.verdictType === 'iterate' && !message.parentMessageId && (
            <div className={styles.activityItem}>
              This message was iterated. Check the board for v{(message.version || 1) + 1}.
            </div>
          )}
        </div>
      )}

      {/* Activity */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Activity</div>
        <div className={styles.activityList}>
          {messageHistory.length === 0 && (
            <div className={styles.activityItem} style={{ color: 'var(--color-gray-400)' }}>No activity yet</div>
          )}
          {messageHistory.map(entry => (
            <div key={entry.id} className={styles.activityItem}>
              {formatTimeAgo(entry.changedAt)}
              {entry.changedByName ? ` — ${entry.changedByName}` : ''}
              {' — '}
              {formatHistoryEntry(entry)}
            </div>
          ))}
        </div>
      </div>

      </div>{/* end panelBody */}

      <CampaignModal
        open={campaignModalOpen}
        onClose={() => { setCampaignModalOpen(false); setEditingCampaign(null); }}
        messageId={message.id}
        campaign={editingCampaign}
      />
      <AssetModal
        open={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        messageId={message.id}
      />
      <CreativeModal
        open={creativeModalOpen}
        onClose={() => setCreativeModalOpen(false)}
        messageId={message.id}
      />
    </Drawer>
  );
}
