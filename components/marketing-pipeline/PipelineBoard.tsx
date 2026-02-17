'use client';

import { Tooltip } from 'antd';
import { PIPELINE_STAGES_ORDER, PIPELINE_STAGE_CONFIG, type PipelineStage } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { PipelineCard } from './PipelineCard';
import styles from './PipelineBoard.module.css';

function getColumnHeaderClass(stage: PipelineStage): string {
  switch (stage) {
    case 'scaling': return `${styles.columnHeader} ${styles.columnHeaderScaling}`;
    case 'retired': return `${styles.columnHeader} ${styles.columnHeaderRetired}`;
    default: return `${styles.columnHeader} ${styles.columnHeaderDefault}`;
  }
}

function getColumnClass(stage: PipelineStage): string {
  const stageClass = styles[`column${stage.charAt(0).toUpperCase()}${stage.slice(1)}`] as string | undefined;
  return stageClass ? `${styles.column} ${stageClass}` : styles.column;
}

/** Ghost card counts per column to mimic a realistic board */
const SKELETON_COUNTS: Record<PipelineStage, number> = {
  backlog: 3, production: 2, testing: 1, scaling: 1, retired: 2,
};

function SkeletonCard(): React.JSX.Element {
  return (
    <div className={styles.skeletonCard}>
      <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
      <div className={styles.skeletonTags}>
        <div className={`${styles.skeletonLine} ${styles.skeletonTag}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonTag}`} style={{ width: 80 }} />
      </div>
      <div className={`${styles.skeletonLine} ${styles.skeletonMeta}`} />
    </div>
  );
}

function SkeletonBoard(): React.JSX.Element {
  return (
    <div className={styles.boardContainer}>
      <div className={styles.board}>
        {PIPELINE_STAGES_ORDER.map(stage => {
          const config = PIPELINE_STAGE_CONFIG[stage];
          return (
            <div key={stage} className={getColumnClass(stage)}>
              <div className={getColumnHeaderClass(stage)}>
                <span className={styles.columnAccent} style={{ backgroundColor: config.color }} />
                <span className={styles.columnName}>{config.label}</span>
              </div>
              <div className={styles.cardList}>
                {Array.from({ length: SKELETON_COUNTS[stage] }, (_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PipelineBoard() {
  const stages = usePipelineStore(s => s.stages);
  const isLoading = usePipelineStore(s => s.isLoading);

  if (isLoading) {
    return <SkeletonBoard />;
  }

  return (
    <div className={styles.boardContainer}>
      <div className={styles.board}>
        {PIPELINE_STAGES_ORDER.map(stage => {
          const config = PIPELINE_STAGE_CONFIG[stage];
          const cards = stages[stage] || [];

          return (
            <div key={stage} className={getColumnClass(stage)}>
              <div className={getColumnHeaderClass(stage)}>
                <span
                  className={styles.columnAccent}
                  style={{ backgroundColor: config.color }}
                />
                <Tooltip title={config.description} placement="bottom">
                  <span className={styles.columnName}>{config.label}</span>
                </Tooltip>
                <span className={styles.columnCount}>{cards.length}</span>
              </div>

              <div className={styles.cardList}>
                {cards.length === 0 ? (
                  <div className={styles.emptyColumn}>No messages</div>
                ) : (
                  cards.map(card => (
                    <PipelineCard key={card.id} card={card} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
