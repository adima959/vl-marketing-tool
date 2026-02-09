'use client';

import { Spin, Tooltip } from 'antd';
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

export function PipelineBoard() {
  const stages = usePipelineStore(s => s.stages);
  const isLoading = usePipelineStore(s => s.isLoading);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Spin size="large" />
      </div>
    );
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
