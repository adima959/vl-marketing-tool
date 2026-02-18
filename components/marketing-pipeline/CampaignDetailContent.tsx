'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToggleSet } from '@/hooks/useToggleSet';
import { fmtNumber, fmtPct, fmtTime } from '@/lib/marketing-pipeline/formatters';
import { Tooltip } from 'antd';
import {
  ExportOutlined,
  BarChartOutlined, GlobalOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import type { Campaign, CampaignPerformanceData, Product, Geography, CampaignHierarchyData } from '@/types';
import { CHANNEL_CONFIG, GEO_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth, CPA_HEALTH_CONFIG, getExternalCampaignUrl, formatNok } from '@/lib/marketing-pipeline/cpaUtils';
import { fetchApi } from '@/lib/api/errorHandler';
import { fetchCRMSales } from '@/lib/api/crmClient';
import { formatLocalDate } from '@/lib/types/api';
import type { SaleRow } from '@/types/sales';
import type { MetricClickContext } from '@/types/table';
import { SaleDetailModal } from '@/components/dashboard/SaleDetailModal';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import { CpaHealthTooltip } from './CpaHealthTooltip';
import { V2HierarchySection } from './CampaignHierarchySection';
import baseStyles from './PipelinePanel.module.css';
import styles from './CampaignDetailContent.module.css';

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

// Local aliases for brevity in JSX
const fmt = fmtNumber;
const pct = fmtPct;
const formatTime = fmtTime;

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
  const [expandedAdsets, toggleAdset] = useToggleSet();
  const [expandedAds, toggleAd] = useToggleSet();

  const perf = performance;
  const target = product ? getCpaTarget(product.cpaTargets, campaign.geo, campaign.channel) : undefined;
  const cpa = perf?.trueCpa ?? campaign.cpa ?? undefined;
  const health = getCpaHealth(cpa, target);
  const healthCfg = CPA_HEALTH_CONFIG[health];
  const derivedStatus = perf?.campaignStatus || 'stopped';
  const statusCfg = CAMPAIGN_STATUS_CONFIG[derivedStatus];
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
        {/* Row 1: Meta + Date Picker */}
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
          <div className={styles.cdHeaderControls}>
            <DateRangePicker dateRange={dateRange} setDateRange={onDateRangeChange} />
          </div>
        </div>

        {/* Row 2: Campaign Name */}
        <div className={styles.cdHeaderTitle}>
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
        </div>
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
          <div className={`${styles.cdSection} ${styles.cdSectionBlue}`}>
            <div className={styles.cdSectionTitle}>
              <span className={styles.cdSectionIcon}>
                <BarChartOutlined />
              </span>
              <span>Ad Performance</span>
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
              <CpaHealthTooltip>
                <span className={styles.cdMetricValue} style={{ color: healthCfg.color, cursor: 'default' }}>
                  <span className={styles.cdHealthDot} style={{ background: healthCfg.color }} />
                  {healthCfg.label}
                </span>
              </CpaHealthTooltip>
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

          <div className={`${styles.cdSection} ${styles.cdSectionAmber}`}>
            <div className={styles.cdSectionTitle}>
              <span className={styles.cdSectionIcon}>
                <GlobalOutlined />
              </span>
              <span>On-Page</span>
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

          <div className={`${styles.cdSection} ${styles.cdSectionGreen}`}>
            <div className={styles.cdSectionTitle}>
              <span className={styles.cdSectionIcon}>
                <ShoppingCartOutlined />
              </span>
              <span>CRM / Sales</span>
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
  return <div className={baseStyles.skeletonBar} style={{ width, height, borderRadius: 4 }} />;
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

