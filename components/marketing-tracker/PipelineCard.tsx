'use client';

import type { PipelineCard as PipelineCardType, PipelineStage, Channel, Geography } from '@/types';
import { CHANNEL_CONFIG, GEO_CONFIG, GEO_STAGE_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth, type CpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { usePipelineStore } from '@/stores/pipelineStore';
import { PipelineStageBadge } from './PipelineStageBadge';
import styles from './PipelineCard.module.css';

interface PipelineCardProps {
  card: PipelineCardType;
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
  scaling: styles.cardScaling,
  retired: styles.cardRetired,
};

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
  const { selectMessage, moveMessage } = usePipelineStore();

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

      {/* Geo flags with stage indicators */}
      {card.geos.length > 0 && (
        <div className={styles.geoFlags}>
          {card.geos.map(g => {
            const geoConfig = GEO_CONFIG[g.geo];
            const stageConfig = GEO_STAGE_CONFIG[g.stage];
            return (
              <span key={g.id} className={styles.geoFlag} title={`${geoConfig.label}: ${stageConfig.label}`}>
                <span className={styles.geoFlagEmoji}>{geoConfig.flag}</span>
                <span
                  className={styles.geoStageIndicator}
                  style={{ backgroundColor: stageConfig.color }}
                />
              </span>
            );
          })}
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

      {hasMatrix && (
        <div className={styles.hoverContent}>
          <div className={styles.matrixWrapper}>
            <div className={styles.matrixTitle}>Coverage</div>
            <div
              className={styles.matrix}
              style={{ gridTemplateColumns: `28px ${geos.map(() => '28px').join(' ')}` }}
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
                    const cellClass = health && health !== 'none'
                      ? `${styles.matrixCell} ${styles[`matrixCell${health.charAt(0).toUpperCase()}${health.slice(1)}`]}`
                      : styles.matrixCell;
                    return (
                      <span key={`${channel}-${geo}`} className={cellClass}>
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
          </div>

          <div className={styles.stageAction} onClick={e => e.stopPropagation()}>
            <span className={styles.stageActionLabel}>Move to</span>
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
