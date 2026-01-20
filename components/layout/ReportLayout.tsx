'use client';

import { Layout, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useReportStore } from '@/stores/reportStore';
import styles from './ReportLayout.module.css';

const { Header, Content } = Layout;
const { Title } = Typography;

interface ReportLayoutProps {
  children: ReactNode;
}

const ExportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 1V9M8 1L5 4M8 1L11 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 10V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 7L10 5M6 9L10 11" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ReportLayout({ children }: ReportLayoutProps) {
  const { reportData } = useReportStore();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState<string>('Never');

  // Update lastUpdated when data changes
  useEffect(() => {
    if (reportData.length > 0) {
      setLastUpdated(new Date());
    }
  }, [reportData]);

  // Update time ago every minute
  useEffect(() => {
    const updateTimeAgo = () => {
      setTimeAgo(formatTimeAgo(lastUpdated));
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <div className={styles.headerLeft}>
          <Title level={4} className={styles.title}>
            Analytics Dashboard
          </Title>
          {lastUpdated && (
            <span className={styles.lastUpdated}>
              Last updated: <strong>{timeAgo}</strong>
            </span>
          )}
        </div>

        <div className={styles.headerRight}>
          <button className={styles.actionButton} title="Export data">
            <ExportIcon />
          </button>
          <button className={styles.actionButton} title="Share report">
            <ShareIcon />
          </button>
        </div>
      </Header>
      <Content className={styles.content}>{children}</Content>
    </Layout>
  );
}
