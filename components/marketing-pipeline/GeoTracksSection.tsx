'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Select, Button, Popconfirm, Dropdown, Spin, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, DeleteOutlined, DownOutlined, RightOutlined, GlobalOutlined, ExportOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import type { MessageDetail, Campaign, CampaignPerformanceData, Geography, Product, GeoStage, Channel } from '@/types';
import { GEO_CONFIG, CHANNEL_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import type { CpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { GeoStageBadge } from './GeoStageBadge';
import styles from './ConceptDetailPanel.module.css';


interface AdCampaignOption {
  campaignId: string;
  campaignName: string;
  network: string;
  totalSpend: number;
  totalClicks: number;
}

/** Map ad network name to pipeline Channel type */
function networkToChannel(network: string): Channel {
  const n = network.toLowerCase();
  if (n === 'facebook' || n === 'meta') return 'meta';
  if (n.includes('google')) return 'google';
  if (n.includes('taboola')) return 'taboola';
  return 'other';
}

interface GeoTracksSectionProps {
  message: MessageDetail;
  performanceData: Record<string, CampaignPerformanceData>;
  performanceLoading: boolean;
  perfDays: number;
  onPerfDaysChange: (days: number) => void;
  onAddGeo: (messageId: string, data: { geo: Geography }) => void;
  onUpdateGeoStage: (geoId: string, data: { stage: GeoStage }) => void;
  onRemoveGeo: (geoId: string) => void;
  onDeleteCampaign: (id: string) => void;
  onAddCampaign: (messageId: string, data: { name?: string; channel: Channel; geo: Geography; externalId?: string }) => void;
  onCampaignClick: (campaign: Campaign) => void;
}

export function GeoTracksSection({
  message,
  performanceData,
  performanceLoading,
  perfDays,
  onPerfDaysChange,
  onAddGeo,
  onUpdateGeoStage,
  onRemoveGeo,
  onDeleteCampaign,
  onAddCampaign,
  onCampaignClick,
}: GeoTracksSectionProps): React.ReactNode {
  const [collapsedGeos, setCollapsedGeos] = useState<Set<string>>(new Set());
  const [addingForGeo, setAddingForGeo] = useState<Geography | null>(null);

  const handleDateRangeChange = useCallback(({ key }: { key: string }) => {
    const days = parseInt(key, 10);
    onPerfDaysChange(days);
  }, [onPerfDaysChange]);

  const dateRangeLabel = DATE_RANGE_OPTIONS.find(o => o.days === perfDays)?.label ?? `Last ${perfDays} days`;

  const toggleGeo = useCallback((geoId: string) => {
    setCollapsedGeos(prev => {
      const next = new Set(prev);
      if (next.has(geoId)) next.delete(geoId);
      else next.add(geoId);
      return next;
    });
  }, []);

  const product = message.product;
  const geos = message.geos || [];
  const hasGeos = geos.length > 0;

  const existingGeoSet = new Set(geos.map(g => g.geo));
  const availableGeos = (Object.keys(GEO_CONFIG) as Geography[]).filter(g => !existingGeoSet.has(g));
  const addGeoMenuItems: MenuProps['items'] = availableGeos.map(geo => ({
    key: geo,
    label: `${GEO_CONFIG[geo].flag} ${GEO_CONFIG[geo].label}`,
  }));

  const handleCampaignSelected = useCallback((
    geo: Geography,
    option: AdCampaignOption,
  ): void => {
    onAddCampaign(message.id, {
      name: option.campaignName,
      channel: networkToChannel(option.network),
      geo,
      externalId: option.campaignId,
    });
    setAddingForGeo(null);
  }, [message.id, onAddCampaign]);

  /** Sum live spend across campaigns in a list, falling back to manual spend */
  function sumSpend(campaigns: Campaign[]): number {
    return campaigns.reduce((sum, c) => {
      const perf = performanceData[c.id];
      return sum + (perf ? perf.spend : c.spend);
    }, 0);
  }

  return (
    <div className={styles.geoTracksSection}>
      <div className={styles.geoTracksHeader}>
        <span className={styles.strategySectionIcon} style={{ background: '#f0fdf4' }}>
          <GlobalOutlined style={{ color: '#16a34a' }} />
        </span>
        <span className={styles.strategySectionTitle}>Geo Tracks</span>
        <div className={styles.geoTracksActions}>
          <Dropdown
            menu={{
              items: DATE_RANGE_OPTIONS.map(o => ({
                key: String(o.days),
                label: o.label,
              })),
              onClick: handleDateRangeChange,
              selectedKeys: [String(perfDays)],
            }}
            trigger={['click']}
          >
            <button type="button" className={styles.dateRangeBtn}>
              {dateRangeLabel}
              <DownOutlined style={{ fontSize: 9 }} />
            </button>
          </Dropdown>
          <Dropdown
            menu={{
              items: addGeoMenuItems,
              onClick: ({ key }) => onAddGeo(message.id, { geo: key as Geography }),
            }}
            trigger={['click']}
            disabled={availableGeos.length === 0}
          >
            <Tooltip title="Add a new geography to track" mouseEnterDelay={0.15}>
              <Button size="small" type="primary" icon={<PlusOutlined />} disabled={availableGeos.length === 0}>
                Add Geo
              </Button>
            </Tooltip>
          </Dropdown>
        </div>
      </div>

      <div className={styles.geoTracksBody}>
        {!hasGeos && (
          <div className={styles.geoEmpty}>
            No geos added yet. Add a geography to start tracking.
          </div>
        )}

        {geos.map(geo => {
          const isExpanded = !collapsedGeos.has(geo.id);
          const geoCampaigns = message.campaigns.filter(c => c.geo === geo.geo);
          const geoConfig = GEO_CONFIG[geo.geo];
          const geoSpend = sumSpend(geoCampaigns);

          return (
            <div key={geo.id} className={styles.geoTrack}>
              <div className={styles.geoTrackHeader} onClick={() => toggleGeo(geo.id)}>
                <span className={styles.geoExpandIcon}>
                  {isExpanded ? <DownOutlined /> : <RightOutlined />}
                </span>
                <span className={styles.geoTrackFlag}>{geoConfig.flag}</span>
                <span className={styles.geoTrackName}>{geoConfig.label}</span>
                {geo.driveFolderId && (
                  <Tooltip title="Open Drive folder" mouseEnterDelay={0.15}>
                    <a
                      href={`https://drive.google.com/drive/folders/${geo.driveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.geoDriveLink}
                      onClick={e => e.stopPropagation()}
                    >
                      <FolderOpenOutlined />
                    </a>
                  </Tooltip>
                )}
                {geo.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                <div className={styles.geoTrackRight}>
                  <Tooltip title="Click to change stage" mouseEnterDelay={0.15}>
                    <span onClick={e => e.stopPropagation()}>
                      <GeoStageBadge
                        stage={geo.stage}
                        editable
                        onChange={(stage) => onUpdateGeoStage(geo.id, { stage })}
                        size="small"
                      />
                    </span>
                  </Tooltip>
                  {performanceLoading ? (
                    <span className={styles.skeletonBar} style={{ width: 64, height: 14 }} />
                  ) : (
                    <Tooltip title="Total spend across all campaigns in this geo" mouseEnterDelay={0.15}>
                      <span className={styles.geoTrackMeta}>
                        {geoSpend > 0 ? formatNok(geoSpend) : ''}
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title="Add campaign" mouseEnterDelay={0.15}>
                    <span onClick={e => e.stopPropagation()}>
                      <Button
                        size="small"
                        type="link"
                        icon={<PlusOutlined />}
                        style={{ color: '#16a34a' }}
                        onClick={() => setAddingForGeo(geo.geo)}
                      />
                    </span>
                  </Tooltip>
                  <Popconfirm
                    title={`Remove ${geoConfig.label}?`}
                    onConfirm={() => onRemoveGeo(geo.id)}
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title={`Remove ${geoConfig.label}`} mouseEnterDelay={0.15}>
                      <DeleteOutlined
                        className={styles.geoTrackDelete}
                        onClick={e => e.stopPropagation()}
                      />
                    </Tooltip>
                  </Popconfirm>
                </div>
              </div>

              {isExpanded && (
                <div className={styles.geoTrackContent}>
                  {addingForGeo === geo.geo && (
                    <InlineCampaignSelect
                      productId={product?.id}
                      geo={geo.geo}
                      excludeExternalIds={new Set(message.campaigns.map(c => c.externalId).filter(Boolean) as string[])}
                      onSelect={(option) => handleCampaignSelected(geo.geo, option)}
                      onCancel={() => setAddingForGeo(null)}
                    />
                  )}
                  {geoCampaigns.length > 0 && (
                    <CampaignRows
                      campaigns={geoCampaigns}
                      product={product}
                      performanceData={performanceData}
                      performanceLoading={performanceLoading}
                      onCampaignClick={onCampaignClick}
                      onDeleteCampaign={onDeleteCampaign}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline Campaign Select ───────────────────────────────────────────

interface InlineCampaignSelectProps {
  productId?: string;
  geo: Geography;
  excludeExternalIds?: Set<string>;
  onSelect: (option: AdCampaignOption) => void;
  onCancel: () => void;
}

function InlineCampaignSelect({ productId, geo, excludeExternalIds, onSelect, onCancel }: InlineCampaignSelectProps): React.ReactNode {
  const [options, setOptions] = useState<AdCampaignOption[]>([]);
  const [loading, setLoading] = useState(false);
  const didFetch = useRef(false);

  useEffect(() => {
    if (!productId || didFetch.current) return;
    didFetch.current = true;
    setLoading(true);
    const params = new URLSearchParams({ productId, geo });
    fetch('/api/marketing-pipeline/campaigns/search?' + params.toString())
      .then(r => r.json())
      .then(json => {
        if (json.success) setOptions(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, geo]);

  const filteredOptions = excludeExternalIds?.size
    ? options.filter(o => !excludeExternalIds.has(o.campaignId))
    : options;

  return (
    <div className={styles.inlineCampaignSelect}>
      <Select
        showSearch
        autoFocus
        open
        placeholder={loading ? 'Loading campaigns...' : 'Search campaigns...'}
        loading={loading}
        disabled={loading}
        style={{ width: '100%' }}
        notFoundContent={loading ? <Spin size="small" /> : 'No campaigns found for this product + geo'}
        filterOption={(input, option) => {
          if (!option) return false;
          const search = (option as { searchText?: string }).searchText ?? '';
          return search.toLowerCase().includes(input.toLowerCase());
        }}
        onSelect={(value: string) => {
          const match = filteredOptions.find(o => o.campaignId === value);
          if (match) onSelect(match);
        }}
        onBlur={onCancel}
        optionLabelProp="label"
        options={filteredOptions.map(c => ({
          value: c.campaignId,
          label: c.campaignName,
          searchText: c.campaignName + ' ' + c.campaignId,
          title: c.campaignId,
        }))}
        optionRender={(option) => {
          const match = filteredOptions.find(o => o.campaignId === option.value);
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {match?.campaignName ?? option.value}
              </span>
              {match && match.totalSpend > 0 && (
                <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--color-gray-500)' }}>
                  {formatNok(match.totalSpend)}
                </span>
              )}
            </div>
          );
        }}
        virtual={false}
      />
    </div>
  );
}

// ── Campaign Rows ────────────────────────────────────────────────────

interface CampaignRowsProps {
  campaigns: Campaign[];
  product: Product | undefined;
  performanceData: Record<string, CampaignPerformanceData>;
  performanceLoading: boolean;
  onCampaignClick: (campaign: Campaign) => void;
  onDeleteCampaign: (id: string) => void;
}

const HEALTH_CONFIG: Record<CpaHealth, { color: string; label: string; className: string }> = {
  green: { color: '#16a34a', label: 'Good', className: 'healthGreen' },
  yellow: { color: '#d97706', label: 'Warning', className: 'healthYellow' },
  red: { color: '#dc2626', label: 'Over target', className: 'healthRed' },
  none: { color: '#d1d5db', label: 'No data', className: 'healthNone' },
};

function CampaignRows({
  campaigns,
  product,
  performanceData,
  performanceLoading,
  onCampaignClick,
  onDeleteCampaign,
}: CampaignRowsProps): React.ReactNode {
  return (
    <>
      {campaigns.map(c => {
        const perf = performanceData[c.id];
        const spend = perf ? perf.spend : c.spend;
        const cpa = perf ? perf.trueCpa : c.cpa;
        const target = product ? getCpaTarget(product.cpaTargets, c.geo, c.channel) : undefined;
        const health = getCpaHealth(cpa ?? undefined, target);
        const healthCfg = HEALTH_CONFIG[health];
        const channelCfg = CHANNEL_CONFIG[c.channel];
        const displayName = c.name || perf?.campaignName || c.externalId || channelCfg.label;
        const statusCfg = CAMPAIGN_STATUS_CONFIG[c.status];
        const externalUrl = getExternalCampaignUrl(c);

        const loading = performanceLoading;

        return (
          <div
            key={c.id}
            className={styles.campaignRow}
            style={{ '--health-color': loading ? '#d1d5db' : healthCfg.color } as React.CSSProperties}
            onClick={() => onCampaignClick(c)}
          >
            {/* Line 1: Name + Status + Spend + Delete */}
            <div className={styles.campaignRowTop}>
              {externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.campaignName}
                  onClick={e => e.stopPropagation()}
                  title={`Open in ${channelCfg.label}`}
                >
                  {displayName}
                  <ExportOutlined className={styles.campaignExternalLink} />
                </a>
              ) : (
                <span className={styles.campaignNamePlain}>{displayName}</span>
              )}
              <Tooltip title={`Campaign status: ${statusCfg.label}`} mouseEnterDelay={0.15}>
                <span
                  className={styles.campaignStatus}
                  style={{ color: statusCfg.color, background: statusCfg.bgColor }}
                >
                  {statusCfg.label}
                </span>
              </Tooltip>
              {loading ? (
                <span className={styles.skeletonBar} style={{ width: 72, height: 16 }} />
              ) : (
                <Tooltip title="Total ad spend" mouseEnterDelay={0.15}>
                  <span className={styles.campaignSpend}>
                    {spend === 0 && !perf ? '' : formatNok(spend)}
                  </span>
                </Tooltip>
              )}
              <Popconfirm
                title="Delete this campaign?"
                onConfirm={(e) => { e?.stopPropagation(); onDeleteCampaign(c.id); }}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Delete campaign" mouseEnterDelay={0.15}>
                  <DeleteOutlined
                    className={styles.campaignDeleteBtn}
                    onClick={e => e.stopPropagation()}
                  />
                </Tooltip>
              </Popconfirm>
            </div>
            {/* Line 2: Channel · CPA · Target · CRM · Health */}
            <div className={styles.campaignRowBottom}>
              <Tooltip title="Ad network" mouseEnterDelay={0.15}>
                <span className={styles.channelTag}>{channelCfg.label}</span>
              </Tooltip>
              {loading ? (
                <>
                  <span className={styles.campaignChipSep}>&middot;</span>
                  <span className={styles.skeletonBar} style={{ width: 56, height: 13 }} />
                  <span className={styles.campaignChipSep}>&middot;</span>
                  <span className={styles.skeletonBar} style={{ width: 48, height: 13 }} />
                  <span className={styles.campaignChipSep}>&middot;</span>
                  <span className={styles.skeletonBar} style={{ width: 40, height: 13 }} />
                </>
              ) : (
                <>
                  <span className={styles.campaignChipSep}>&middot;</span>
                  <Tooltip title="Cost per acquisition (spend / approved trials)" mouseEnterDelay={0.15}>
                    <span className={styles.campaignChip}>
                      CPA {cpa != null ? formatNok(Math.round(cpa)) : '—'}
                    </span>
                  </Tooltip>
                  {target != null && (
                    <>
                      <span className={styles.campaignChipSep}>&middot;</span>
                      <Tooltip title="CPA target for this product + geo" mouseEnterDelay={0.15}>
                        <span className={styles.campaignChip}>
                          Target {formatNok(target)}
                        </span>
                      </Tooltip>
                    </>
                  )}
                  {perf && perf.subscriptions > 0 && (
                    <>
                      <span className={styles.campaignChipSep}>&middot;</span>
                      <Tooltip title="Total subscriptions from CRM" mouseEnterDelay={0.15}>
                        <span className={styles.campaignChip}>
                          {perf.subscriptions} subs
                        </span>
                      </Tooltip>
                      <span className={styles.campaignChipSep}>&middot;</span>
                      <Tooltip title="Approved trials and approval rate" mouseEnterDelay={0.15}>
                        <span className={styles.campaignChip}>
                          {perf.trialsApproved} appv ({Math.round(perf.approvalRate * 100)}%)
                        </span>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip
                    title={
                      <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                        {target != null && <div style={{ marginBottom: 4 }}>Target: {formatNok(target)}</div>}
                        <div><span style={{ color: '#4ade80' }}>●</span> Good — within 5% of target</div>
                        <div><span style={{ color: '#fbbf24' }}>●</span> Warning — 5–25% over target</div>
                        <div><span style={{ color: '#f87171' }}>●</span> Over target — more than 25% over</div>
                      </div>
                    }
                    mouseEnterDelay={0.15}
                  >
                    <span className={styles.healthTag + ' ' + styles[healthCfg.className]}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: healthCfg.color }} />
                      {healthCfg.label}
                    </span>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a direct link to the campaign on the ad platform */
const META_ACT = '952160084840450';
const META_BIZ = '947628245293634';

function getExternalCampaignUrl(campaign: Campaign): string | undefined {
  if (campaign.externalUrl) return campaign.externalUrl;
  if (!campaign.externalId) return undefined;
  switch (campaign.channel) {
    case 'google':
      return `https://ads.google.com/aw/campaigns?campaignId=${campaign.externalId}`;
    case 'meta':
      return `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${META_ACT}&business_id=${META_BIZ}&selected_campaign_ids=${campaign.externalId}`;
    default:
      return undefined;
  }
}

function formatNok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k NOK`;
  return `${Math.round(n)} NOK`;
}

