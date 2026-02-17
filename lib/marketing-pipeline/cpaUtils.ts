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
