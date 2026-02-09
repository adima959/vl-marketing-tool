'use client';

import { memo } from 'react';
import type { PipelineCard as PipelineCardType, PipelineStage } from '@/types';
import { GEO_CONFIG, GEO_STAGE_CONFIG, PIPELINE_STAGES_ORDER, PIPELINE_STAGE_CONFIG } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
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

export const PipelineCard = memo(function PipelineCard({ card }: PipelineCardProps) {
  const selectMessage = usePipelineStore(s => s.selectMessage);
  const moveMessage = usePipelineStore(s => s.moveMessage);

  const handleCardClick = (): void => selectMessage(card.id);
  const stageClass = STAGE_CLASS_MAP[card.pipelineStage] || '';

  const stageIdx = PIPELINE_STAGES_ORDER.indexOf(card.pipelineStage);
  const prevStage = stageIdx > 0 ? PIPELINE_STAGES_ORDER[stageIdx - 1] : null;
  const nextStage = stageIdx < PIPELINE_STAGES_ORDER.length - 1 ? PIPELINE_STAGES_ORDER[stageIdx + 1] : null;

  const handleMove = (e: React.MouseEvent, stage: PipelineStage): void => {
    e.stopPropagation();
    moveMessage(card.id, stage);
  };

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

      {/* Geo flags with stage labels */}
      {card.geos.length > 0 && (
        <div className={styles.geoFlags}>
          {card.geos.map(g => {
            const geoConfig = GEO_CONFIG[g.geo];
            const stageConfig = GEO_STAGE_CONFIG[g.stage];
            return (
              <span key={g.id} className={styles.geoFlag}>
                <span className={styles.geoFlagEmoji}>{geoConfig.flag}</span>
                <span
                  className={styles.geoStageLabel}
                  style={{ color: stageConfig.color }}
                >
                  {stageConfig.label}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <div className={styles.bottomRow}>
        <span className={styles.cardMeta}>
          {[
            card.ownerName,
            card.activeCampaignCount > 0
              ? `${card.activeCampaignCount} campaign${card.activeCampaignCount !== 1 ? 's' : ''}`
              : null,
          ].filter(Boolean).join(' · ')}
        </span>
        {card.version > 1 && (
          <span className={styles.versionBadge}>v{card.version}</span>
        )}
      </div>

      {/* Stage navigation — hover-reveal arrows */}
      {(prevStage || nextStage) && (
        <div className={styles.stageNav} aria-hidden="true">
          {prevStage && (
            <button
              type="button"
              className={`${styles.stageArrow} ${styles.stageArrowLeft}`}
              onClick={(e) => handleMove(e, prevStage)}
              aria-label={`Move to ${PIPELINE_STAGE_CONFIG[prevStage].label}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 2L3.5 5l3 3" />
              </svg>
            </button>
          )}
          {nextStage && (
            <button
              type="button"
              className={`${styles.stageArrow} ${styles.stageArrowRight}`}
              onClick={(e) => handleMove(e, nextStage)}
              aria-label={`Move to ${PIPELINE_STAGE_CONFIG[nextStage].label}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 2L6.5 5l-3 3" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
