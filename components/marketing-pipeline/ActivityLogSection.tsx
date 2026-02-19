import type { HistoryEntry } from '@/stores/pipelineStore';
import { formatTimeAgo, formatHistoryEntry, diffCopyVariations } from '@/lib/utils/displayFormatters';
import type { CopyVariationChange } from '@/lib/utils/displayFormatters';
import styles from './ActivityLogSection.module.css';

interface ActivityLogSectionProps {
  messageHistory: HistoryEntry[];
}

/** Group consecutive entries that belong to the same logical action:
 *  - copyVariations edits within 2s by same user → merge
 *  - Multiple 'created' fields for same entity → collapse to single "X added" */
function groupEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const result: HistoryEntry[] = [];
  const seenCreated = new Set<string>();

  for (const entry of entries) {
    // Collapse multi-field 'created' entries into a single summary per entity
    if (entry.action === 'created') {
      const key = `${entry.entityType}:${entry.entityId}`;
      if (seenCreated.has(key)) continue;
      seenCreated.add(key);
      // Use the most descriptive field: 'geo' for geos, 'channel' for campaigns
      const best = entries.find(e =>
        e.action === 'created' && e.entityType === entry.entityType && e.entityId === entry.entityId &&
        (e.fieldName === 'geo' || e.fieldName === 'channel' || e.fieldName === 'name'),
      );
      result.push(best ?? entry);
      continue;
    }

    // Group consecutive copyVariations by same user within 2s
    if (entry.fieldName === 'copyVariations') {
      const prev = result[result.length - 1];
      if (
        prev?.fieldName === 'copyVariations' &&
        prev.changedBy === entry.changedBy &&
        Math.abs(new Date(prev.changedAt).getTime() - new Date(entry.changedAt).getTime()) < 2000
      ) {
        result[result.length - 1] = { ...prev, oldValue: entry.oldValue };
        continue;
      }
    }

    result.push(entry);
  }
  return result;
}

function truncate(text: string, max: number = 50): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

const ACTION_CONFIG: Record<CopyVariationChange['type'], { label: string; className: string }> = {
  added: { label: 'Added', className: styles.actBadgeAdded },
  deleted: { label: 'Deleted', className: styles.actBadgeDeleted },
  text_changed: { label: 'Updated', className: styles.actBadgeUpdated },
};

function SnapshotDetail({ snapshot }: { snapshot: Record<string, string> }): React.ReactNode {
  const entries = Object.entries(snapshot);
  if (entries.length === 0) return <span className={styles.actSnapEmpty}>(empty)</span>;

  return (
    <details className={styles.actSnapDetails}>
      <summary className={styles.actSnapSummary}>Show content</summary>
      <div className={styles.actSnapContent}>
        {entries.map(([label, text]) => (
          <div key={label} className={styles.actSnapRow}>
            <span className={styles.actSnapLabel}>{label}</span>
            <span className={styles.actSnapText}>{text}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function renderCopyChanges(entry: HistoryEntry): React.ReactNode {
  const changes = diffCopyVariations(entry.oldValue, entry.newValue);
  if (changes.length === 0) return <span>Copy variations changed</span>;

  return (
    <div className={styles.actCopyChanges}>
      {changes.map((c, i) => {
        const cfg = ACTION_CONFIG[c.type];
        return (
          <div key={i} className={styles.actCopyChange}>
            <div className={styles.actCopyChangeHeader}>
              <span className={`${styles.actBadge} ${cfg.className}`}>{cfg.label}</span>
              {(c.type === 'added' || c.type === 'deleted') && (
                <span>Variation #{c.variationNum}</span>
              )}
              {c.type === 'text_changed' && (
                <span className={styles.actTextChange}>
                  <span className={styles.actCellLabel}>V{c.variationNum} {c.cellLabel}</span>
                  {c.oldText && c.newText ? (
                    <>
                      <span className={styles.actOldText}>{truncate(c.oldText)}</span>
                      <span className={styles.actArrow}>&rarr;</span>
                      <span className={styles.actNewText}>{truncate(c.newText)}</span>
                    </>
                  ) : c.oldText ? (
                    <>
                      <span className={styles.actOldText}>{truncate(c.oldText)}</span>
                      <span className={styles.actRemoved}>removed</span>
                    </>
                  ) : c.newText ? (
                    <span className={styles.actNewText}>{truncate(c.newText)}</span>
                  ) : null}
                </span>
              )}
            </div>
            {c.snapshot && Object.keys(c.snapshot).length > 0 && (
              <SnapshotDetail snapshot={c.snapshot} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ActivityLogSection({ messageHistory }: ActivityLogSectionProps): React.ReactNode {
  const grouped = groupEntries(messageHistory);

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Activity</div>
      <div className={styles.activityList}>
        {grouped.length === 0 && (
          <div className={styles.activityItem} style={{ color: 'var(--color-gray-400)' }}>No activity yet</div>
        )}
        {grouped.map(entry => (
          <div key={entry.id} className={styles.activityItem}>
            <div className={styles.actHeader}>
              <span className={styles.actTime}>{formatTimeAgo(entry.changedAt)}</span>
              {entry.changedByName && <span className={styles.actUser}>{entry.changedByName}</span>}
            </div>
            {entry.fieldName === 'copyVariations'
              ? renderCopyChanges(entry)
              : <span>{formatHistoryEntry(entry)}</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}
