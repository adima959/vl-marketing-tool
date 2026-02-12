'use client';

import type { MessageDetail } from '@/types';
import styles from './ConceptDetailPanel.module.css';

interface VersionHistorySectionProps {
  message: MessageDetail;
  onVersionClick: (messageId: string) => void;
}

export function VersionHistorySection({ message, onVersionClick }: VersionHistorySectionProps): React.ReactNode {
  const showSection = message.parentMessageId || message.verdictType === 'iterate';
  if (!showSection) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Version History</div>
      {message.parentMessageId && (
        <div className={styles.activityItem}>
          Iterated from:{' '}
          <span
            className={styles.versionLink}
            onClick={() => onVersionClick(message.parentMessageId!)}
          >
            v{(message.version || 1) - 1}
          </span>
          {message.verdictNotes && (
            <span style={{ display: 'block', marginTop: 4, color: 'var(--color-gray-500)', fontSize: '11px' }}>
              Reason: {message.verdictNotes}
            </span>
          )}
        </div>
      )}
      {message.verdictType === 'iterate' && !message.parentMessageId && (
        <div className={styles.activityItem}>
          This message was iterated. Check the board for v{(message.version || 1) + 1}.
        </div>
      )}
    </div>
  );
}
