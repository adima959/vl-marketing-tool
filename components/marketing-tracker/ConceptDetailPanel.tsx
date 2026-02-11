'use client';

import { useState, useCallback, useRef } from 'react';
import { Drawer, Table, Button, Input, Popconfirm, Dropdown, type MenuProps } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MessageDetail, Campaign, Geography, PipelineStage, Asset, Creative } from '@/types';
import { GEO_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { usePipelineStore } from '@/stores/pipelineStore';
import { EditableField } from '@/components/ui/EditableField';
import { EditableSelect } from '@/components/ui/EditableSelect';
import { EditableTags } from '@/components/ui/EditableTags';
import { PipelineStageBadge } from './PipelineStageBadge';
import { GeoStageBadge } from './GeoStageBadge';
import { CampaignModal } from './CampaignModal';
import { AssetModal } from './AssetModal';
import { CreativeModal } from './CreativeModal';
import { formatTimeAgo, formatHistoryEntry } from '@/lib/utils/displayFormatters';
import stickyStyles from '@/styles/tables/sticky.module.css';
import styles from './ConceptDetailPanel.module.css';

const { TextArea } = Input;

interface ConceptDetailPanelProps {
  open: boolean;
  message: MessageDetail | null;
  onClose: () => void;
}

function AssetList({ assets, onDelete }: { assets: Asset[]; onDelete: (id: string) => void }): React.ReactNode {
  return (
    <div className={styles.assetList}>
      {assets.map(asset => (
        <span key={asset.id} className={styles.assetItem}>
          <span className={styles.assetIcon}>
            {asset.type === 'landing_page' ? '🔗' : asset.type === 'text_ad' ? '📝' : '📎'}
          </span>
          {asset.name}
          <Popconfirm title="Delete?" onConfirm={() => onDelete(asset.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <DeleteOutlined className={styles.assetDelete} />
          </Popconfirm>
        </span>
      ))}
    </div>
  );
}

function CreativeList({ creatives, onDelete }: { creatives: Creative[]; onDelete: (id: string) => void }): React.ReactNode {
  return (
    <div className={styles.assetList}>
      {creatives.map(creative => (
        <span key={creative.id} className={styles.assetItem}>
          <span className={styles.assetIcon}>
            {creative.format === 'ugc_video' ? '🎬' : creative.format === 'static_image' ? '🖼' : '🎥'}
          </span>
          {creative.name}
          <Popconfirm title="Delete?" onConfirm={() => onDelete(creative.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <DeleteOutlined className={styles.assetDelete} />
          </Popconfirm>
        </span>
      ))}
    </div>
  );
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
  const [collapsedGeos, setCollapsedGeos] = useState<Set<string>>(new Set());
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

  const toggleGeo = useCallback((geoId: string) => {
    setCollapsedGeos(prev => {
      const next = new Set(prev);
      if (next.has(geoId)) next.delete(geoId);
      else next.add(geoId);
      return next;
    });
  }, []);

  if (!message) return null;

  const product = message.product;
  const isRetired = message.pipelineStage === 'retired';
  const geos = message.geos || [];
  const hasGeos = geos.length > 0;

  // Available geos for "Add Geo" dropdown
  const existingGeoSet = new Set(geos.map(g => g.geo));
  const availableGeos = (Object.keys(GEO_CONFIG) as Geography[]).filter(g => !existingGeoSet.has(g));
  const addGeoMenuItems: MenuProps['items'] = availableGeos.map(geo => ({
    key: geo,
    label: `${GEO_CONFIG[geo].flag} ${GEO_CONFIG[geo].label}`,
  }));

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
            onClick={(e) => {
              e.stopPropagation();
              setEditingCampaign(record);
              setModalGeo(record.geo);
              setCampaignModalOpen(true);
            }}
          />
          <Popconfirm title="Delete this campaign?" onConfirm={() => deleteCampaign(record.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <DeleteOutlined style={{ fontSize: 12, color: 'var(--color-gray-400)', cursor: 'pointer' }} />
          </Popconfirm>
        </span>
      ),
    },
  ];

  // Items grouped by geo track
  const unassignedCampaigns = message.campaigns.filter(c => !existingGeoSet.has(c.geo));
  const unassignedAssets = (message.assets || []).filter(a => !existingGeoSet.has(a.geo));
  const unassignedCreatives = (message.creatives || []).filter(c => !existingGeoSet.has(c.geo));
  const hasUnassigned = unassignedCampaigns.length > 0 || unassignedAssets.length > 0 || unassignedCreatives.length > 0;

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

        {/* Kill / Iterate actions — available on any non-retired stage */}
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
        {/* Iterate form — appears when iterate button clicked */}
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

        {/* Geo Tracks */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Geo Tracks</span>
            <Dropdown
              menu={{
                items: addGeoMenuItems,
                onClick: ({ key }) => addGeo(message.id, { geo: key as Geography }),
              }}
              trigger={['click']}
              disabled={availableGeos.length === 0}
            >
              <Button size="small" icon={<PlusOutlined />} disabled={availableGeos.length === 0}>
                Add Geo
              </Button>
            </Dropdown>
          </div>

          {!hasGeos && (
            <div className={styles.geoEmpty}>
              No geos added yet. Add a geography to start tracking.
            </div>
          )}

          {geos.map(geo => {
            const isExpanded = !collapsedGeos.has(geo.id);
            const geoCampaigns = message.campaigns.filter(c => c.geo === geo.geo);
            const geoAssets = (message.assets || []).filter(a => a.geo === geo.geo);
            const geoCreatives = (message.creatives || []).filter(c => c.geo === geo.geo);
            const geoConfig = GEO_CONFIG[geo.geo];
            const geoSpend = geoCampaigns.reduce((sum, c) => sum + c.spend, 0);

            return (
              <div key={geo.id} className={styles.geoTrack}>
                <div className={styles.geoTrackHeader} onClick={() => toggleGeo(geo.id)}>
                  <span className={styles.geoExpandIcon}>
                    {isExpanded ? <DownOutlined /> : <RightOutlined />}
                  </span>
                  <span className={styles.geoTrackFlag}>{geoConfig.flag}</span>
                  <span className={styles.geoTrackName}>{geoConfig.label}</span>
                  <span onClick={e => e.stopPropagation()}>
                    <GeoStageBadge
                      stage={geo.stage}
                      editable
                      onChange={(stage) => updateGeoStage(geo.id, { stage })}
                      size="small"
                    />
                  </span>
                  {geo.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                  <span className={styles.geoTrackMeta}>
                    {geoCampaigns.length} campaign{geoCampaigns.length !== 1 ? 's' : ''}
                    {geoSpend > 0 ? ` · $${geoSpend}` : ''}
                  </span>
                  <Popconfirm
                    title={`Remove ${geoConfig.label}?`}
                    onConfirm={() => removeGeo(geo.id)}
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                  >
                    <DeleteOutlined
                      className={styles.geoTrackDelete}
                      onClick={e => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>

                {isExpanded && (
                  <div className={styles.geoTrackContent}>
                    {geoCampaigns.length > 0 && (
                      <div className={stickyStyles.stickyTable}>
                        <Table
                          columns={campaignColumns}
                          dataSource={geoCampaigns.map(c => ({ ...c, key: c.id }))}
                          pagination={false}
                          size="small"
                          className={styles.campaignsTable}
                          sticky={{ offsetHeader: 0 }}
                        />
                      </div>
                    )}

                    {geoAssets.length > 0 && (
                      <div className={styles.geoSubSection}>
                        <div className={styles.geoSubLabel}>Assets</div>
                        <AssetList assets={geoAssets} onDelete={deleteAsset} />
                      </div>
                    )}

                    {geoCreatives.length > 0 && (
                      <div className={styles.geoSubSection}>
                        <div className={styles.geoSubLabel}>Creatives</div>
                        <CreativeList creatives={geoCreatives} onDelete={deleteCreative} />
                      </div>
                    )}

                    <div className={styles.geoAddButtons}>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => { setModalGeo(geo.geo); setEditingCampaign(null); setCampaignModalOpen(true); }}>
                        Campaign
                      </Button>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => { setModalGeo(geo.geo); setAssetModalOpen(true); }}>
                        Asset
                      </Button>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => { setModalGeo(geo.geo); setCreativeModalOpen(true); }}>
                        Creative
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned items — campaigns/assets/creatives with geos not tracked */}
          {hasGeos && hasUnassigned && (
            <div className={styles.geoTrack} style={{ marginTop: 8 }}>
              <div className={styles.geoTrackHeader} style={{ cursor: 'default' }}>
                <span className={styles.geoTrackName} style={{ color: 'var(--color-gray-500)' }}>Untracked</span>
                <span className={styles.geoTrackMeta}>
                  {unassignedCampaigns.length + unassignedAssets.length + unassignedCreatives.length} item{(unassignedCampaigns.length + unassignedAssets.length + unassignedCreatives.length) !== 1 ? 's' : ''}
                </span>
              </div>
              <div className={styles.geoTrackContent}>
                {unassignedCampaigns.length > 0 && (
                  <div className={stickyStyles.stickyTable}>
                    <Table
                      columns={campaignColumns}
                      dataSource={unassignedCampaigns.map(c => ({ ...c, key: c.id }))}
                      pagination={false}
                      size="small"
                      className={styles.campaignsTable}
                      sticky={{ offsetHeader: 0 }}
                    />
                  </div>
                )}
                {unassignedAssets.length > 0 && (
                  <div className={styles.geoSubSection}>
                    <div className={styles.geoSubLabel}>Assets</div>
                    <AssetList assets={unassignedAssets} onDelete={deleteAsset} />
                  </div>
                )}
                {unassignedCreatives.length > 0 && (
                  <div className={styles.geoSubSection}>
                    <div className={styles.geoSubLabel}>Creatives</div>
                    <CreativeList creatives={unassignedCreatives} onDelete={deleteCreative} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fallback flat sections when no geos exist */}
          {!hasGeos && (
            <>
              {message.campaigns.length > 0 && (
                <>
                  <div className={styles.geoSubLabel} style={{ marginTop: 12 }}>Campaigns</div>
                  <div className={stickyStyles.stickyTable}>
                    <Table
                      columns={campaignColumns}
                      dataSource={message.campaigns.map(c => ({ ...c, key: c.id }))}
                      pagination={false}
                      size="small"
                      className={styles.campaignsTable}
                      sticky={{ offsetHeader: 0 }}
                    />
                  </div>
                </>
              )}
              {(message.assets || []).length > 0 && (
                <div className={styles.geoSubSection}>
                  <div className={styles.geoSubLabel}>Assets</div>
                  <AssetList assets={message.assets || []} onDelete={deleteAsset} />
                </div>
              )}
              {(message.creatives || []).length > 0 && (
                <div className={styles.geoSubSection}>
                  <div className={styles.geoSubLabel}>Creatives</div>
                  <CreativeList creatives={message.creatives || []} onDelete={deleteCreative} />
                </div>
              )}
              <div className={styles.geoAddButtons} style={{ marginTop: 8 }}>
                <Button size="small" icon={<PlusOutlined />} onClick={() => { setModalGeo(undefined); setEditingCampaign(null); setCampaignModalOpen(true); }}>
                  Campaign
                </Button>
                <Button size="small" icon={<PlusOutlined />} onClick={() => { setModalGeo(undefined); setAssetModalOpen(true); }}>
                  Asset
                </Button>
                <Button size="small" icon={<PlusOutlined />} onClick={() => { setModalGeo(undefined); setCreativeModalOpen(true); }}>
                  Creative
                </Button>
              </div>
            </>
          )}
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
