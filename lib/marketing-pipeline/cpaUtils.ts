// Marketing Pipeline — CPA utilities and board helpers
// Pure functions used by frontend components for CPA color coding and board grouping

import type { Product, Geography, Channel, CpaTarget, PipelineCard, PipelineStage, PipelineSummary } from '@/types';

// ── CPA Target Lookup ──────────────────────────────────────────────────

export function getCpaTarget(
  cpaTargets: CpaTarget[] | undefined,
  geo: Geography,
  channel: Channel,
): number | undefined {
  if (!cpaTargets) return undefined;
  return cpaTargets.find(t => t.geo === geo && t.channel === channel)?.target;
}

// ── CPA Health Color ───────────────────────────────────────────────────

export type CpaHealth = 'green' | 'yellow' | 'red' | 'none';

export function getCpaHealth(cpa: number | undefined, target: number | undefined): CpaHealth {
  if (cpa == null || target == null) return 'none';
  if (cpa <= target * 1.05) return 'green';
  if (cpa <= target * 1.25) return 'yellow';
  return 'red';
}

// ── CPA Health UI Config ──────────────────────────────────────────────

export const CPA_HEALTH_CONFIG: Record<CpaHealth, { color: string; label: string; className: string }> = {
  green:  { color: 'var(--color-status-green-dark)', label: 'Good',        className: 'healthGreen' },
  yellow: { color: 'var(--color-status-amber)',      label: 'Warning',     className: 'healthYellow' },
  red:    { color: 'var(--color-status-red)',         label: 'Over target', className: 'healthRed' },
  none:   { color: 'var(--color-gray-300)',           label: 'No data',     className: 'healthNone' },
};

// ── External Campaign URL ─────────────────────────────────────────────

const META_ACT = '952160084840450';
const META_BIZ = '947628245293634';

export function getExternalCampaignUrl(campaign: { externalUrl?: string | null; externalId?: string | null; channel: string }): string | undefined {
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

// ── Formatting ────────────────────────────────────────────────────────

export function formatNok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k NOK`;
  return `${Math.round(n)} NOK`;
}

// ── Group Cards by Stage ───────────────────────────────────────────────

export function groupByStage(cards: PipelineCard[]): Record<PipelineStage, PipelineCard[]> {
  const stages: PipelineStage[] = ['backlog', 'production', 'testing', 'scaling', 'retired'];
  const grouped = {} as Record<PipelineStage, PipelineCard[]>;
  for (const stage of stages) {
    grouped[stage] = cards.filter(c => c.pipelineStage === stage);
  }
  return grouped;
}

// ── Compute Summary ────────────────────────────────────────────────────

export function computeSummary(cards: PipelineCard[]): PipelineSummary {
  return {
    totalSpend: cards.reduce((sum, c) => sum + c.totalSpend, 0),
    scalingCount: cards.filter(c => c.pipelineStage === 'scaling').length,
    totalMessages: cards.length,
  };
}
