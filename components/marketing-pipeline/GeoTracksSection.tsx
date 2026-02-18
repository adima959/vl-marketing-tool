'use client';

import { useState, useCallback } from 'react';
import { useToggleSet } from '@/hooks/useToggleSet';
import { Button, Popconfirm, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, DeleteOutlined, DownOutlined, RightOutlined, GlobalOutlined, ExportOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import type { MessageDetail, Campaign, CampaignPerformanceData, Geography, Product, GeoStage, Channel } from '@/types';
import { GEO_CONFIG, CHANNEL_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth, CPA_HEALTH_CONFIG, getExternalCampaignUrl, formatNok } from '@/lib/marketing-pipeline/cpaUtils';
import { GeoStageBadge } from './GeoStageBadge';
import { CpaHealthTooltip } from './CpaHealthTooltip';
import { InlineCampaignSelect } from './InlineCampaignSelect';
import type { AdCampaignOption } from './InlineCampaignSelect';
import baseStyles from './PipelinePanel.module.css';
import styles from './GeoTracksSection.module.css';

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
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
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
  dateRange,
  onDateRangeChange,
  onAddGeo,
  onUpdateGeoStage,
  onRemoveGeo,
  onDeleteCampaign,
  onAddCampaign,
  onCampaignClick,
}: GeoTracksSectionProps): React.ReactNode {
  const [collapsedGeos, toggleGeo] = useToggleSet();
  const [addingForGeo, setAddingForGeo] = useState<Geography | null>(null);

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
        <GlobalOutlined className={styles.geoTracksSectionIcon} />
        <span className={styles.geoTracksSectionTitle}>Geo Tracks</span>
        <div className={styles.geoTracksActions}>
          <DateRangePicker dateRange={dateRange} setDateRange={onDateRangeChange} size="small" />
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
                      Drive
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
                    <span className={baseStyles.skeletonBar} style={{ width: 64, height: 14 }} />
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
                        style={{ color: 'var(--color-status-green-dark)' }}
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

// ── Campaign Rows ────────────────────────────────────────────────────

interface CampaignRowsProps {
  campaigns: Campaign[];
  product: Product | undefined;
  performanceData: Record<string, CampaignPerformanceData>;
  performanceLoading: boolean;
  onCampaignClick: (campaign: Campaign) => void;
  onDeleteCampaign: (id: string) => void;
}


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
        const healthCfg = CPA_HEALTH_CONFIG[health];
        const channelCfg = CHANNEL_CONFIG[c.channel];
        const displayName = c.name || perf?.campaignName || c.externalId || channelCfg.label;
        const derivedStatus = perf?.campaignStatus || 'stopped';
        const statusCfg = CAMPAIGN_STATUS_CONFIG[derivedStatus];
        const externalUrl = getExternalCampaignUrl(c);

        const loading = performanceLoading;

        const isNoData = health === 'none';
        const lastActivity = perf?.lastActivityDate ? formatLastActivity(perf.lastActivityDate) : null;

        return (
          <div
            key={c.id}
            className={`${styles.campaignRow} ${isNoData ? styles.campaignRowNoData : ''}`}
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
              <Tooltip
                title={
                  derivedStatus === 'active' ? 'Active in last 3 days' :
                  derivedStatus === 'paused' ? 'Last active 4-30 days ago' :
                  'No activity in 30+ days'
                }
                mouseEnterDelay={0.15}
              >
                <span
                  className={styles.campaignStatus}
                  style={{ color: statusCfg.color, background: statusCfg.bgColor }}
                >
                  {statusCfg.label}
                </span>
              </Tooltip>
              {loading ? (
                <span className={baseStyles.skeletonBar} style={{ width: 72, height: 16 }} />
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
                  <span className={baseStyles.skeletonBar} style={{ width: 56, height: 13 }} />
                  <span className={styles.campaignChipSep}>&middot;</span>
                  <span className={baseStyles.skeletonBar} style={{ width: 48, height: 13 }} />
                  <span className={styles.campaignChipSep}>&middot;</span>
                  <span className={baseStyles.skeletonBar} style={{ width: 40, height: 13 }} />
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
                  <CpaHealthTooltip target={target} lastActivity={lastActivity} formatTarget={formatNok}>
                    <span className={styles.healthTag + ' ' + styles[healthCfg.className]}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: healthCfg.color }} />
                      {healthCfg.label}
                    </span>
                  </CpaHealthTooltip>
                  {isNoData && lastActivity && (
                    <span className={styles.campaignChip} style={{ fontSize: '11px', color: 'var(--color-gray-400)' }}>
                      Last activity {lastActivity}
                    </span>
                  )}
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


/** Format date as relative time (e.g. "2 days ago") or absolute date if old */
function formatLastActivity(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  // For very old dates, show the actual date
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

