'use client';

import type { PipelineCard as PipelineCardType, PipelineStage, Channel, Geography } from '@/types';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth, type CpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { usePipelineStore } from '@/stores/pipelineStore';
import { PipelineStageBadge } from './PipelineStageBadge';
import styles from './PipelineCard.module.css';

interface PipelineCardProps {
  card: PipelineCardType;
}

function formatSpend(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount}`;
}

/** Convert hex color to rgba with given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const STAGE_CLASS_MAP: Record<PipelineStage, string> = {
  backlog: styles.cardBacklog,
  production: styles.cardProduction,
  testing: styles.cardTesting,
  verdict: styles.cardVerdict,
  winner: styles.cardWinner,
  retired: styles.cardRetired,
};

const CPA_COLOR_MAP: Record<CpaHealth, string> = {
  green: styles.cpaGreen,
  yellow: styles.cpaYellow,
  red: styles.cpaRed,
  none: styles.cpaNone,
};

function CpaDot({ health }: { health: CpaHealth }) {
  if (health === 'none') return null;
  return <span className={`${styles.cpaDot} ${styles[health]}`} />;
}

function buildMatrix(card: PipelineCardType) {
  const channels: Channel[] = [];
  const geos: Geography[] = [];
  const matrix: Record<string, CpaHealth> = {};

  const products = usePipelineStore.getState().products;
  const product = products.find(p => p.id === card.productId);

  for (const campaign of card.campaigns) {
    if (!channels.includes(campaign.channel)) channels.push(campaign.channel);
    if (!geos.includes(campaign.geo)) geos.push(campaign.geo);

    const target = product ? getCpaTarget(product, campaign.geo) : undefined;
    const health = getCpaHealth(campaign.cpa, target);
    matrix[`${campaign.channel}-${campaign.geo}`] = health;
  }

  return { channels, geos, matrix };
}

export function PipelineCard({ card }: PipelineCardProps) {
  const { selectMessage, moveMessage, products } = usePipelineStore();
  const product = products.find(p => p.id === card.productId);

  let overallHealth: CpaHealth = 'none';
  if (card.blendedCpa != null && product) {
    const activeGeos = [...new Set(card.campaigns.filter(c => c.status === 'active').map(c => c.geo))];
    const targets = activeGeos.map(g => getCpaTarget(product, g)).filter((t): t is number => t != null);
    if (targets.length > 0) {
      const avgTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
      overallHealth = getCpaHealth(card.blendedCpa, avgTarget);
    }
  }

  const handleCardClick = () => selectMessage(card.id);
  const handleStageChange = (newStage: PipelineStage) => moveMessage(card.id, newStage);

  const { channels, geos, matrix } = buildMatrix(card);
  const hasMatrix = channels.length > 0 && geos.length > 0;
  const stageClass = STAGE_CLASS_MAP[card.pipelineStage] || '';

  return (
    <div className={`${styles.card} ${stageClass}`} onClick={handleCardClick}>
      <div className={styles.conceptName}>{card.name}</div>

      <div className={styles.tags}>
        {card.productName && (
          <span
            className={styles.productTag}
            style={card.productColor ? {
              color: card.productColor,
              background: hexToRgba(card.productColor, 0.12),
            } : undefined}
          >
            {card.productName}
          </span>
        )}
        {card.angleName && <span className={styles.angleTag}>{card.angleName}</span>}
      </div>

      {card.totalSpend > 0 && (
        <div className={styles.metrics}>
          <span className={styles.spend}>{formatSpend(card.totalSpend)}</span>
          {card.blendedCpa != null && (
            <>
              <span className={styles.separator}>&middot;</span>
              <span className={`${styles.cpa} ${CPA_COLOR_MAP[overallHealth]}`}>
                CPA: ${Math.round(card.blendedCpa)}
              </span>
              <CpaDot health={overallHealth} />
            </>
          )}
        </div>
      )}

      <div className={styles.bottomRow}>
        <span className={styles.campaignCount}>
          {card.activeCampaignCount > 0
            ? `${card.activeCampaignCount} campaign${card.activeCampaignCount !== 1 ? 's' : ''}`
            : ''
          }
        </span>
        {card.version > 1 && (
          <span className={styles.versionBadge}>v{card.version}</span>
        )}
      </div>

      {card.pipelineStage === 'verdict' && (
        <div className={styles.verdictBanner}>Decide</div>
      )}

      {hasMatrix && (
        <div className={styles.hoverContent}>
          <div
            className={styles.matrix}
            style={{ gridTemplateColumns: `24px ${geos.map(() => '24px').join(' ')}` }}
          >
            <span />
            {geos.map(geo => (
              <span key={geo} className={styles.matrixHeader}>
                {GEO_CONFIG[geo].flag}
              </span>
            ))}
            {channels.map(channel => (
              <span key={`row-${channel}`} style={{ display: 'contents' }}>
                <span className={styles.matrixLabel}>
                  {CHANNEL_CONFIG[channel].shortLabel}
                </span>
                {geos.map(geo => {
                  const health = matrix[`${channel}-${geo}`];
                  return (
                    <span key={`${channel}-${geo}`} className={styles.matrixCell}>
                      {health && health !== 'none'
                        ? <span className={`${styles.matrixDot} ${styles[health]}`} />
                        : <span className={styles.matrixEmpty}>–</span>
                      }
                    </span>
                  );
                })}
              </span>
            ))}
          </div>

          <div className={styles.stageAction} onClick={e => e.stopPropagation()}>
            <PipelineStageBadge
              stage={card.pipelineStage}
              editable
              onChange={handleStageChange}
              size="small"
            />
          </div>
        </div>
      )}
    </div>
  );
}
