// Marketing Pipeline — CPA utilities and board helpers
// Pure functions used by frontend components for CPA color coding and board grouping

import type { Product, Geography, PipelineCard, PipelineStage, PipelineSummary } from '@/types';

// ── CPA Target Lookup ──────────────────────────────────────────────────

export function getCpaTarget(product: Product, geo: Geography): number | undefined {
  switch (geo) {
    case 'NO': return product.cpaTargetNo;
    case 'SE': return product.cpaTargetSe;
    case 'DK': return product.cpaTargetDk;
  }
}

// ── CPA Health Color ───────────────────────────────────────────────────

export type CpaHealth = 'green' | 'yellow' | 'red' | 'none';

export function getCpaHealth(cpa: number | undefined, target: number | undefined): CpaHealth {
  if (cpa == null || target == null) return 'none';
  if (cpa <= target) return 'green';
  if (cpa <= target * 1.2) return 'yellow';
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
