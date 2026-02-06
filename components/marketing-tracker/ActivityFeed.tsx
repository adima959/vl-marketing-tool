'use client';

import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { Clock, ChevronDown } from 'lucide-react';
import type { ActivityRecord } from '@/stores/marketingTrackerStore';
import styles from './ActivityFeed.module.css';

const ENTITY_LABELS: Record<string, string> = {
  product: 'product',
  angle: 'angle',
  message: 'message',
  creative: 'creative',
  asset: 'asset',
};

// Human-readable field names (camelCase key → display label)
const FIELD_LABELS: Record<string, string> = {
  ownerId: 'owner',
  name: 'name',
  description: 'description',
  notes: 'notes',
  status: 'status',
  specificPainPoint: 'pain point',
  corePromise: 'core promise',
  productId: 'product',
  angleId: 'angle',
  messageId: 'message',
  geo: 'geography',
  url: 'URL',
  thumbnailUrl: 'thumbnail',
  keyMessage: 'key message',
  hookText: 'hook text',
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatFieldName(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // Fallback: convert camelCase to words
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

/** Format a history value for display (truncate long strings, handle null) */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    // Strip HTML tags for display
    const plain = value.replace(/<[^>]*>/g, '').trim();
    if (!plain) return null;
    return plain.length > 40 ? plain.slice(0, 40) + '...' : plain;
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  // Objects/arrays — skip display
  return null;
}

function getSummaryText(activity: ActivityRecord[]): string {
  if (activity.length === 0) return 'No recent activity';

  const now = new Date();
  const todayCount = activity.filter((item) => {
    const date = new Date(item.changedAt);
    return date.toDateString() === now.toDateString();
  }).length;

  if (todayCount > 0) {
    return `${todayCount} update${todayCount === 1 ? '' : 's'} today`;
  }

  return `${activity.length} recent updates`;
}

interface ActivityFeedProps {
  /** Increment to trigger a re-fetch (e.g. after mutations on the page) */
  refreshKey?: number;
}

export function ActivityFeed({ refreshKey = 0 }: ActivityFeedProps) {
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const response = await fetch('/api/marketing-tracker/history?limit=15');
        const data = await response.json();
        if (data.success) {
          setActivity(data.data);
        }
      } catch {
        // Silently fail — activity feed is non-critical
      } finally {
        setIsLoading(false);
      }
    }
    fetchActivity();
  }, [refreshKey]);

  return (
    <div className={`${styles.container} ${isOpen ? styles.containerOpen : ''}`}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className={styles.triggerLeft}>
          <Clock size={14} className={styles.triggerIcon} />
          <span className={styles.triggerLabel}>Activity</span>
          {!isLoading && activity.length > 0 && (
            <span className={styles.triggerSummary}>{getSummaryText(activity)}</span>
          )}
          {isLoading && <Spin size="small" />}
        </div>
        <ChevronDown
          size={14}
          className={`${styles.triggerChevron} ${isOpen ? styles.triggerChevronOpen : ''}`}
        />
      </button>

      <div
        className={styles.panel}
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className={styles.panelInner}>
          {isLoading ? (
            <div className={styles.loading}><Spin size="small" /></div>
          ) : activity.length === 0 ? (
            <p className={styles.empty}>No recent activity</p>
          ) : (
            <div className={styles.list}>
              {activity.map((item) => {
                const entityType = ENTITY_LABELS[item.entityType] || item.entityType;
                const displayName = item.entityName || entityType;
                const field = item.fieldName === '_deleted' ? '' : formatFieldName(item.fieldName);

                // Build description based on action type
                const byLine = item.changedByName ? ` by ${item.changedByName}` : '';
                let description: React.ReactNode;
                if (item.action === 'deleted') {
                  description = <><strong>{displayName}</strong> ({entityType}) deleted{byLine}</>;
                } else if (item.action === 'created') {
                  description = <><strong>{displayName}</strong> ({entityType}) created{byLine}</>;
                } else {
                  // Updated — prefer resolved display names over raw values
                  const oldDisplay = item.oldValueDisplay || formatValue(item.oldValue);
                  const newDisplay = item.newValueDisplay || formatValue(item.newValue);
                  const hasTransition = oldDisplay || newDisplay;

                  description = hasTransition ? (
                    <>
                      <strong>{displayName}</strong>{' '}
                      <span className={styles.field}>{field}</span>{' '}
                      {oldDisplay && newDisplay
                        ? <>{oldDisplay} &rarr; {newDisplay}</>
                        : oldDisplay
                          ? <>removed {oldDisplay}</>
                          : <>set to {newDisplay}</>
                      }
                      {byLine}
                    </>
                  ) : (
                    <>
                      <strong>{displayName}</strong>{' '}
                      <span className={styles.field}>{field}</span> updated{byLine}
                    </>
                  );
                }

                return (
                  <div key={item.id} className={styles.item}>
                    <div className={`${styles.dot} ${styles[`dot_${item.action}`]}`} />
                    <div className={styles.content}>
                      <span className={styles.description}>{description}</span>
                      <span className={styles.time}>{formatTimeAgo(item.changedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
