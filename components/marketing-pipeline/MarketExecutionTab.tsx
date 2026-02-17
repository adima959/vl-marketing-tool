'use client';

import { useMemo } from 'react';
import type { MessageDetail, Campaign, CampaignPerformanceData, Geography, GeoStage, Channel } from '@/types';
import { GeoTracksSection } from './GeoTracksSection';
import styles from './ConceptDetailPanel.module.css';

interface MarketExecutionTabProps {
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

export function MarketExecutionTab({
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
}: MarketExecutionTabProps): React.ReactNode {
  const stats = useMemo(() => {
    const campaigns = message.campaigns || [];
    const geoCount = message.geos?.length || 0;
    const campaignCount = campaigns.length;
    const totalSpend = campaigns.reduce((sum, c) => {
      const perf = performanceData[c.id];
      return sum + (perf ? perf.spend : c.spend || 0);
    }, 0);
    const cpas = campaigns
      .map(c => performanceData[c.id]?.trueCpa ?? c.cpa)
      .filter((v): v is number => v != null);
    const avgCpa = cpas.length > 0 ? Math.round(cpas.reduce((s, v) => s + v, 0) / cpas.length) : null;
    return { geoCount, campaignCount, totalSpend, avgCpa };
  }, [message.campaigns, message.geos, performanceData]);

  return (
    <>
      {/* Stats overview */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.geoCount}</div>
          <div className={styles.statLabel}>Geographies</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.campaignCount}</div>
          <div className={styles.statLabel}>Campaigns</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>${stats.totalSpend.toLocaleString()}</div>
          <div className={styles.statLabel}>Total Spend</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.avgCpa != null ? `$${stats.avgCpa}` : '—'}</div>
          <div className={styles.statLabel}>Avg CPA</div>
        </div>
      </div>

      {/* Geo tracks with campaigns */}
      <GeoTracksSection
        message={message}
        performanceData={performanceData}
        performanceLoading={performanceLoading}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onAddGeo={onAddGeo}
        onUpdateGeoStage={onUpdateGeoStage}
        onRemoveGeo={onRemoveGeo}
        onDeleteCampaign={onDeleteCampaign}
        onAddCampaign={onAddCampaign}
        onCampaignClick={onCampaignClick}
      />
    </>
  );
}
