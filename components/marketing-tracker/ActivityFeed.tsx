'use client';

import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { Clock } from 'lucide-react';
import type { ActivityRecord } from '@/stores/marketingTrackerStore';
import styles from './ActivityFeed.module.css';

const ENTITY_LABELS: Record<string, string> = {
  product: 'Product',
  angle: 'Angle',
  message: 'Message',
  creative: 'Creative',
  asset: 'Asset',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
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
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

export function ActivityFeed() {
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, []);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Clock size={16} />
          <h3 className={styles.title}>Recent Activity</h3>
        </div>
        <div className={styles.loading}><Spin size="small" /></div>
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Clock size={16} />
          <h3 className={styles.title}>Recent Activity</h3>
        </div>
        <p className={styles.empty}>No recent activity</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Clock size={16} />
        <h3 className={styles.title}>Recent Activity</h3>
      </div>
      <div className={styles.list}>
        {activity.map((item) => {
          const entityType = ENTITY_LABELS[item.entityType] || item.entityType;
          const action = ACTION_LABELS[item.action] || item.action;
          const isDelete = item.action === 'deleted';
          const field = item.fieldName === '_deleted' ? '' : formatFieldName(item.fieldName);

          return (
            <div key={item.id} className={styles.item}>
              <div className={`${styles.dot} ${styles[`dot_${item.action}`]}`} />
              <div className={styles.content}>
                <span className={styles.description}>
                  {isDelete ? (
                    <><strong>{entityType}</strong> {action}</>
                  ) : item.action === 'created' ? (
                    <><strong>{entityType}</strong> {action}</>
                  ) : (
                    <><strong>{entityType}</strong> <span className={styles.field}>{field}</span> {action}</>
                  )}
                </span>
                <span className={styles.time}>{formatTimeAgo(item.changedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
