import type { HistoryEntry } from '@/stores/pipelineStore';
import { formatTimeAgo, formatHistoryEntry } from '@/lib/utils/displayFormatters';
import styles from './ConceptDetailPanel.module.css';

interface ActivityLogSectionProps {
  messageHistory: HistoryEntry[];
}

export function ActivityLogSection({ messageHistory }: ActivityLogSectionProps): React.ReactNode {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Activity</div>
      <div className={styles.activityList}>
        {messageHistory.length === 0 && (
          <div className={styles.activityItem} style={{ color: 'var(--color-gray-400)' }}>No activity yet</div>
        )}
        {messageHistory.map(entry => (
          <div key={entry.id} className={styles.activityItem}>
            {formatTimeAgo(entry.changedAt)}
            {entry.changedByName ? ` — ${entry.changedByName}` : ''}
            {' — '}
            {formatHistoryEntry(entry)}
          </div>
        ))}
      </div>
    </div>
  );
}
