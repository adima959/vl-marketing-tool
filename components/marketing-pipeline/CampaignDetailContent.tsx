'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'antd';
import {
  DownOutlined, RightOutlined, ExportOutlined,
  BarChartOutlined, GlobalOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import type {
  Campaign, CampaignPerformanceData, Product, Geography,
  CampaignHierarchyData, AdsetPerformance, AdPerformance, AdLandingPage,
} from '@/types';
import { CHANNEL_CONFIG, GEO_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import type { CpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { fetchApi } from '@/lib/api/errorHandler';
import { fetchCRMSales } from '@/lib/api/crmClient';
import { formatLocalDate } from '@/lib/types/api';
import type { SaleRow } from '@/types/sales';
import type { MetricClickContext } from '@/types/table';
import { SaleDetailModal } from '@/components/dashboard/SaleDetailModal';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import styles from './ConceptDetailPanel.module.css';

function FunnelFluxIcon(): React.ReactNode {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 163.65 142" width="14" height="12" aria-hidden>
      <path d="M160.37 36.75a14.3 14.3 0 0 0 3.28-8.67V.37L112.14 19c-17.95 6.52-25.85 17.47-25.85 47.61l-.62 74.84c7.72-24.24 19.75-46.89 35.52-66.86" fill="#fff" />
      <path d="M3.28 36.39A14.3 14.3 0 0 1 0 27.72V0l51.51 18.64c17.94 6.52 25.8 17.47 25.8 47.61.2 24.95.42 49.9.63 74.85-7.72-24.24-19.75-46.89-35.52-66.86" fill="#fff" />
    </svg>
  );
}


interface CampaignDetailContentProps {
  campaign: Campaign;
  performance: CampaignPerformanceData | null;
  performanceLoading: boolean;
  product: Product | undefined;
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
}

const HEALTH_LABELS: Record<CpaHealth, { label: string; color: string; className: string }> = {
  green: { label: 'Good', color: '#16a34a', className: 'healthGreen' },
  yellow: { label: 'Warning', color: '#d97706', className: 'healthYellow' },
  red: { label: 'Over target', color: '#dc2626', className: 'healthRed' },
  none: { label: 'No data', color: '#d1d5db', className: 'healthNone' },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatNok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k NOK`;
  return `${Math.round(n)} NOK`;
}

function formatTime(seconds: number | null): string {
  if (seconds == null || seconds === 0) return '\u2014';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

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

export function CampaignDetailContent({
  campaign,
  performance,
  performanceLoading,
  product,
  dateRange,
  onDateRangeChange,
}: CampaignDetailContentProps): React.ReactNode {
  const [hierarchy, setHierarchy] = useState<CampaignHierarchyData | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());
  const [expandedAds, setExpandedAds] = useState<Set<string>>(new Set());

  const perf = performance;
  const target = product ? getCpaTarget(product.cpaTargets, campaign.geo, campaign.channel) : undefined;
  const cpa = perf?.trueCpa ?? campaign.cpa ?? undefined;
  const health = getCpaHealth(cpa, target);
  const healthCfg = HEALTH_LABELS[health];
  const statusCfg = CAMPAIGN_STATUS_CONFIG[campaign.status];
  const channelLabel = CHANNEL_CONFIG[campaign.channel]?.label ?? campaign.channel;
  const geoLabel = GEO_CONFIG[campaign.geo as Geography]?.flag ?? campaign.geo;

  const hasData = perf != null;

  // Fetch hierarchy on mount / dateRange change
  const startStr = formatLocalDate(dateRange.start);
  const endStr = formatLocalDate(dateRange.end);
  useEffect(() => {
    if (!campaign.externalId) return;
    setHierarchyLoading(true);
    fetchApi<CampaignHierarchyData>(
      `/api/marketing-pipeline/campaigns/hierarchy?externalId=${encodeURIComponent(campaign.externalId)}&start=${startStr}&end=${endStr}`,
    )
      .then(data => setHierarchy(data))
      .catch(() => setHierarchy(null))
      .finally(() => setHierarchyLoading(false));
  }, [campaign.externalId, startStr, endStr]);

  const toggleAdset = useCallback((adsetId: string) => {
    setExpandedAdsets(prev => {
      const next = new Set(prev);
      if (next.has(adsetId)) next.delete(adsetId);
      else next.add(adsetId);
      return next;
    });
  }, []);

  const toggleAd = useCallback((adId: string) => {
    setExpandedAds(prev => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else next.add(adId);
      return next;
    });
  }, []);

  // CRM sale detail modal
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleRows, setSaleRows] = useState<SaleRow[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);

  const handleViewSubscriptions = useCallback(async () => {
    if (!campaign.externalId) return;
    setSaleModalOpen(true);
    setSaleLoading(true);
    try {
      const all = await fetchCRMSales({
        dateRange: { start: startStr, end: endStr },
        includeCancelInfo: true,
      });
      // Filter by tracking_id_4 (utm_campaign = campaign external ID)
      setSaleRows(all.filter(r => r.tracking_id_4 === campaign.externalId));
    } catch {
      setSaleRows([]);
    } finally {
      setSaleLoading(false);
    }
  }, [campaign.externalId, startStr, endStr]);

  const saleModalContext: MetricClickContext | null = campaign.externalId ? {
    metricId: 'subscriptions',
    metricLabel: 'Subscriptions',
    value: perf?.subscriptions ?? 0,
    filters: {
      dateRange: { start: dateRange.start, end: dateRange.end },
      dimensionFilters: { campaign: campaign.externalId },
    },
  } : null;

  // On-page analysis link with campaign filter
  const onPageUrl = campaign.externalId
    ? `/on-page-analysis?filters=${encodeURIComponent(JSON.stringify([{ id: 'f-camp', field: 'entryCampaign', operator: 'equals', value: campaign.externalId }]))}`
    : undefined;

  const externalUrl = getExternalCampaignUrl(campaign);
  const displayName = perf?.campaignName || campaign.name || channelLabel;

  return (
    <div className={styles.campaignDetailContent}>
      {/* Campaign header bar */}
      <div className={styles.cdHeader}>
        <div className={styles.cdHeaderLeft}>
          {externalUrl ? (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={styles.cdCampaignName} title={`Open in ${channelLabel}`}>
              {displayName}
              <ExportOutlined className={styles.cdNameLinkIcon} />
            </a>
          ) : (
            <span className={styles.cdCampaignName}>
              {displayName}
            </span>
          )}
          <div className={styles.cdHeaderMeta}>
            <span className={styles.cdMetaChannel}>{channelLabel}</span>
            <span className={styles.cdMetaSep}>&middot;</span>
            <span>{geoLabel} {GEO_CONFIG[campaign.geo as Geography]?.label}</span>
            {statusCfg && (
              <span
                className={styles.cdMetaStatus}
                style={{ color: statusCfg.color, background: statusCfg.bgColor }}
              >
                {statusCfg.label}
              </span>
            )}
            {hierarchy?.funnelFluxIds.map(id => (
              <Tooltip key={id} title={`Open in FunnelFlux (${id})`} mouseEnterDelay={0.15}>
                <a
                  href={`https://ui.funnelflux.pro/funnels/editor/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.cdFunnelFluxLink}
                >
                  <FunnelFluxIcon />
                </a>
              </Tooltip>
            ))}
          </div>
        </div>
        <DateRangePicker dateRange={dateRange} setDateRange={onDateRangeChange} />
      </div>

      {performanceLoading ? (
        <MetricsSkeleton />
      ) : !hasData && !campaign.externalId ? (
        <div className={styles.cdEmpty}>
          No performance data available. Add an External ID to link with your ad platform.
        </div>
      ) : !hasData ? (
        <div className={styles.cdEmpty}>
          No data found for External ID: {campaign.externalId}. Data may not be available for the selected date range.
        </div>
      ) : (
        <div className={styles.cdSections}>
          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>
              <span className={styles.cdSectionIcon} style={{ background: '#eff6ff', color: '#3b82f6' }}>
                <BarChartOutlined />
              </span>
              <span style={{ color: '#3b82f6' }}>Ad Performance</span>
            </div>
            <div className={styles.cdMetricRow}>
              <span className={styles.cdMetricLabel}>Spend</span>
              <span className={styles.cdMetricPrimary}>{formatNok(perf.spend)}</span>
            </div>
            <div className={styles.cdMetricRow}>
              <span className={styles.cdMetricLabel}>True CPA</span>
              <span className={styles.cdMetricValue} style={{ color: healthCfg.color }}>
                {perf.trueCpa != null ? formatNok(Math.round(perf.trueCpa)) : '\u2014'}
                {target != null && (
                  <span className={styles.cdMetricSub}> / {formatNok(target)}</span>
                )}
              </span>
            </div>
            <div className={styles.cdMetricRow}>
              <span className={styles.cdMetricLabel}>Health</span>
              <Tooltip
                title={
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <div><span style={{ color: '#4ade80' }}>●</span> Good — within 5% of target</div>
                    <div><span style={{ color: '#fbbf24' }}>●</span> Warning — 5–25% over target</div>
                    <div><span style={{ color: '#f87171' }}>●</span> Over target — more than 25% over</div>
                  </div>
                }
                mouseEnterDelay={0.15}
              >
                <span className={styles.cdMetricValue} style={{ color: healthCfg.color, cursor: 'default' }}>
                  <span className={styles.cdHealthDot} style={{ background: healthCfg.color }} />
                  {healthCfg.label}
                </span>
              </Tooltip>
            </div>
            <MetricRow label="Impressions" value={fmt(perf.impressions)} />
            <MetricRow label="Clicks" value={fmt(perf.clicks)} />
            <MetricRow label="CTR" value={pct(perf.ctr)} />
            <MetricRow label="CPC" value={formatNok(perf.cpc)} />
            <MetricRow label="Conversions" value={String(perf.conversions)} />
            {externalUrl && (
              <div className={styles.cdSectionLinkWrap}>
                <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={styles.cdSectionLink}>
                  View in {channelLabel} <ExportOutlined />
                </a>
              </div>
            )}
          </div>

          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>
              <span className={styles.cdSectionIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                <GlobalOutlined />
              </span>
              <span style={{ color: '#d97706' }}>On-Page</span>
            </div>
            <MetricRow label="Page Views" value={fmt(perf.pageViews)} />
            <MetricRow label="Unique Visitors" value={fmt(perf.uniqueVisitors)} />
            <MetricRow label="Scroll Past Hero" value={perf.pageViews > 0 && perf.scrollPastHero != null ? `${fmt(perf.scrollPastHero)} (${pct(perf.scrollPastHero / perf.pageViews)})` : String(perf.scrollPastHero ?? 0)} />
            <MetricRow label="Avg. Time on Page" value={formatTime(perf.avgTimeOnPage ?? null)} />
            <MetricRow label="Form Views" value={String(perf.formViews)} />
            <div className={styles.cdMetricRow}>
              <span className={styles.cdMetricLabel}>Form Starters</span>
              <span className={`${styles.cdMetricValue} ${perf.formStarters > 0 ? styles.cdMetricGood : ''}`}>
                {perf.formViews > 0 && perf.formStarters > 0
                  ? `${perf.formStarters} (${pct(perf.formStarters / perf.formViews)})`
                  : String(perf.formStarters)}
              </span>
            </div>
            <MetricRow label="Bounce Rate" value={pct(perf.bounceRate)} />
            {onPageUrl && (
              <div className={styles.cdSectionLinkWrap}>
                <a href={onPageUrl} target="_blank" rel="noopener noreferrer" className={styles.cdSectionLink}>
                  Analyze in On-Page <ExportOutlined />
                </a>
              </div>
            )}
          </div>

          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>
              <span className={styles.cdSectionIcon} style={{ background: '#ecfdf5', color: '#059669' }}>
                <ShoppingCartOutlined />
              </span>
              <span style={{ color: '#059669' }}>CRM / Sales</span>
            </div>
            <MetricRow label="Subscriptions" value={String(perf.subscriptions)} />
            <MetricRow label="Trials" value={String(perf.trials)} />
            <MetricRow label="Approved" value={String(perf.trialsApproved)} />
            <div className={styles.cdMetricRow}>
              <span className={styles.cdMetricLabel}>Appr. %</span>
              <span className={`${styles.cdMetricValue} ${perf.approvalRate > 0 ? styles.cdMetricGood : ''}`}>
                {pct(perf.approvalRate)}
              </span>
            </div>
            <MetricRow label="Upsells" value={String(perf.upsells)} />
            <MetricRow label="OTS" value={String(perf.ots)} />
            {campaign.externalId && (
              <div className={styles.cdSectionLinkWrap}>
                <button type="button" className={styles.cdSectionLink} onClick={handleViewSubscriptions}>
                  View Subscriptions <ExportOutlined />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ad Sets hierarchy */}
      <V2HierarchySection
        hierarchy={hierarchy}
        hierarchyLoading={hierarchyLoading || performanceLoading}
        hasExternalId={!!campaign.externalId}
        expandedAdsets={expandedAdsets}
        expandedAds={expandedAds}
        onToggleAdset={toggleAdset}
        onToggleAd={toggleAd}
      />

      <SaleDetailModal
        open={saleModalOpen}
        onClose={() => setSaleModalOpen(false)}
        context={saleModalContext}
        salesData={saleLoading ? undefined : saleRows}
      />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function SkeletonBar({ width, height = 14 }: { width: number | string; height?: number }): React.ReactNode {
  return <div className={styles.skeletonBar} style={{ width, height, borderRadius: 4 }} />;
}

function MetricsSkeleton(): React.ReactNode {
  return (
    <div className={styles.cdSections}>
      <div className={styles.cdSection}>
        <SkeletonBar width={100} height={13} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} className={styles.cdMetricRow}>
            <SkeletonBar width={80} height={13} />
            <SkeletonBar width={50} height={13} />
          </div>
        ))}
      </div>
      <div className={styles.cdSection}>
        <SkeletonBar width={60} height={13} />
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className={styles.cdMetricRow}>
            <SkeletonBar width={85} height={13} />
            <SkeletonBar width={40} height={13} />
          </div>
        ))}
      </div>
      <div className={styles.cdSection}>
        <SkeletonBar width={80} height={13} />
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className={styles.cdMetricRow}>
            <SkeletonBar width={90} height={13} />
            <SkeletonBar width={45} height={13} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className={styles.cdMetricRow}>
      <span className={styles.cdMetricLabel}>{label}</span>
      <span className={styles.cdMetricValue}>{value}</span>
    </div>
  );
}

// ── Ad Sets Hierarchy — tabular A/B comparison layout ────────────────────

function V2HierarchySection({
  hierarchy,
  hierarchyLoading,
  hasExternalId,
  expandedAdsets,
  expandedAds,
  onToggleAdset,
  onToggleAd,
}: {
  hierarchy: CampaignHierarchyData | null;
  hierarchyLoading: boolean;
  hasExternalId: boolean;
  expandedAdsets: Set<string>;
  expandedAds: Set<string>;
  onToggleAdset: (id: string) => void;
  onToggleAd: (id: string) => void;
}): React.ReactNode {
  const totalSpend = hierarchy?.adsets.reduce((s, a) => s + a.spend, 0) ?? 0;

  return (
    <div className={styles.v2Hierarchy}>
      {/* Column headers */}
      <div className={styles.v2ColHeader}>
        <span className={styles.v2ColLabel}>Ad Set / Ad</span>
        <span className={styles.v2ColLabel}>Spend</span>
        <span className={styles.v2ColLabel}>Clicks</span>
        <span className={styles.v2ColLabel}>CTR</span>
        <span className={styles.v2ColLabel}>Conv</span>
      </div>

      {hierarchyLoading ? (
        <div className={styles.v2Empty}>Loading...</div>
      ) : !hierarchy || hierarchy.adsets.length === 0 ? (
        <div className={styles.v2Empty}>
          {!hasExternalId ? 'No External ID linked' : 'No adset data for this period'}
        </div>
      ) : (
        hierarchy.adsets.map(adset => {
          const ads = hierarchy.ads.filter(a => a.adsetId === adset.adsetId);
          const expanded = expandedAdsets.has(adset.adsetId);
          const spendPct = totalSpend > 0 ? (adset.spend / totalSpend) * 100 : 0;

          return (
            <div key={adset.adsetId}>
              {/* Adset row */}
              <div className={styles.v2AdsetRow} onClick={() => onToggleAdset(adset.adsetId)}>
                <div className={styles.v2AdsetNameCell}>
                  {ads.length > 0 && (
                    <span className={`${styles.v2Expand} ${expanded ? styles.v2ExpandOpen : ''}`}>
                      <RightOutlined />
                    </span>
                  )}
                  <span className={styles.v2AdsetName}>{adset.adsetName}</span>
                </div>
                <div className={styles.v2SpendCell}>
                  <span className={styles.v2MetricCell}>{formatNok(adset.spend)}</span>
                  <div className={styles.v2SpendBar}>
                    <div className={styles.v2SpendBarFill} style={{ width: `${spendPct}%` }} />
                  </div>
                </div>
                <span className={styles.v2MetricCell}>{fmt(adset.clicks)}</span>
                <span className={styles.v2MetricCell}>{pct(adset.ctr)}</span>
                <span className={styles.v2MetricCell}>{fmt(adset.conversions)}</span>
              </div>

              {/* Expanded ads */}
              {expanded && ads.length > 0 && (
                <div className={styles.v2AdsContainer}>
                  {ads.map(ad => {
                    const landingPages = hierarchy.adLandingPages[ad.adId] ?? [];
                    const hasPages = landingPages.length > 0;
                    const adExpanded = expandedAds.has(ad.adId);

                    return (
                      <div key={ad.adId}>
                        <div
                          className={styles.v2AdRow}
                          onClick={hasPages ? () => onToggleAd(ad.adId) : undefined}
                          style={{ cursor: hasPages ? 'pointer' : 'default' }}
                        >
                          <div className={styles.v2AdNameCell}>
                            {hasPages && (
                              <span className={`${styles.v2Expand} ${adExpanded ? styles.v2ExpandOpen : ''}`}>
                                <RightOutlined />
                              </span>
                            )}
                            <span className={styles.v2AdName}>{ad.adName}</span>
                          </div>
                          <span className={styles.v2AdMetric}>{formatNok(ad.spend)}</span>
                          <span className={styles.v2AdMetric}>{fmt(ad.clicks)}</span>
                          <span className={styles.v2AdMetric}>{pct(ad.ctr)}</span>
                          <span className={styles.v2AdMetric}>{fmt(ad.conversions)}</span>
                        </div>

                        {/* Landing pages — tabular with entry/thank-you grouping */}
                        {adExpanded && hasPages && (
                          <V2LandingPageTable landingPages={landingPages} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── V2 Landing Page Table — groups entry pages with their thank-you pages ──

function isThankYouPage(urlPath: string): boolean {
  const lower = urlPath.toLowerCase();
  return lower.includes('thank-you') || lower.includes('thankyou') || lower.includes('tack') || lower.includes('tak');
}

interface LpGroup {
  entry: AdLandingPage;
  children: AdLandingPage[];
}

function groupLandingPages(pages: AdLandingPage[]): LpGroup[] {
  const entries = pages.filter(p => !isThankYouPage(p.urlPath));
  const thankYous = pages.filter(p => isThankYouPage(p.urlPath));

  // If no entry pages, treat all as entries
  if (entries.length === 0) return pages.map(p => ({ entry: p, children: [] }));

  // If only one entry, all thank-you pages belong to it
  if (entries.length === 1) return [{ entry: entries[0], children: thankYous }];

  // Multiple entries: distribute thank-you pages evenly (they're typically shared)
  return entries.map((entry, i) => ({
    entry,
    children: i === 0 ? thankYous : [],
  }));
}

function V2LpRow({ lp }: { lp: AdLandingPage }): React.ReactNode {
  return (
    <>
      <span className={styles.v2LpMetricCell}>{fmt(lp.pageViews)}</span>
      <span className={styles.v2LpMetricCell}>{fmt(lp.uniqueVisitors)}</span>
      <span className={lp.scrollRate >= 0.5 ? styles.v2LpHighlight : styles.v2LpMetricCell}>
        {pct(lp.scrollRate)}
      </span>
      <span className={lp.formStartRate >= 0.1 ? styles.v2LpHighlight : styles.v2LpMetricCell}>
        {pct(lp.formStartRate)}
      </span>
      <span className={lp.bounceRate >= 0.5 ? styles.v2LpWarn : styles.v2LpMetricCell}>
        {pct(lp.bounceRate)}
      </span>
      <span className={styles.v2LpMetricCell}>{formatTime(lp.avgTimeOnPage)}</span>
    </>
  );
}

function V2LandingPageTable({ landingPages }: { landingPages: AdLandingPage[] }): React.ReactNode {
  const groups = groupLandingPages(landingPages);

  return (
    <div className={styles.v2LpContainer}>
      <div className={styles.v2LpHeader}>
        <span className={styles.v2LpColLabel}>Landing Page</span>
        <span className={styles.v2LpColLabel}>Views</span>
        <span className={styles.v2LpColLabel}>Unique</span>
        <span className={styles.v2LpColLabel}>Scroll</span>
        <span className={styles.v2LpColLabel}>Form</span>
        <span className={styles.v2LpColLabel}>Bounce</span>
        <span className={styles.v2LpColLabel}>Time</span>
      </div>
      {groups.map(group => (
        <div key={group.entry.urlPath} className={styles.v2LpGroup}>
          {/* Entry page row */}
          <div className={styles.v2LpRow}>
            <a href={group.entry.urlPath} target="_blank" rel="noopener noreferrer" className={styles.v2LpUrl} title={group.entry.urlPath}>
              {group.entry.urlPath}
              <ExportOutlined className={styles.v2LpLinkIcon} />
            </a>
            <V2LpRow lp={group.entry} />
          </div>
          {/* Thank-you / child pages */}
          {group.children.map(child => (
            <div key={child.urlPath} className={styles.v2LpChildRow}>
              <a href={child.urlPath} target="_blank" rel="noopener noreferrer" className={styles.v2LpChildUrl} title={child.urlPath}>
                <span className={styles.v2LpChildArrow}>&rarr;</span>
                {child.urlPath}
                <ExportOutlined className={styles.v2LpLinkIcon} />
              </a>
              <V2LpRow lp={child} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
