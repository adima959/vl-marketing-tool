/**
 * Data Maps Page - Remains Client Component
 *
 * Architecture Decision: This page uses Client Component pattern
 *
 * Reasons for remaining client-side:
 * - Tab switching state requires client-side interactivity
 * - Three lazy-loaded panels (Campaign, URL, Affiliate) with independent data
 * - Each panel has complex table interactions and inline editing
 * - Tab state coordination with panel rendering
 *
 * Current pattern is appropriate - tabs provide good UX organization
 * and lazy loading already optimizes bundle size.
 */
'use client';

import { useState, lazy, Suspense } from 'react';
import { Spin } from 'antd';
import { Megaphone, Globe, Link2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import settingsStyles from '@/styles/components/settings.module.css';
import styles from '@/components/settings/data-maps.module.css';

const CampaignMapPanel = lazy(() =>
  import('@/components/settings/CampaignMapPanel').then((mod) => ({ default: mod.CampaignMapPanel }))
);

const UrlMapPanel = lazy(() =>
  import('@/components/settings/UrlMapPanel').then((mod) => ({ default: mod.UrlMapPanel }))
);

const AffiliateMapPanel = lazy(() =>
  import('@/components/settings/AffiliateMapPanel').then((mod) => ({ default: mod.AffiliateMapPanel }))
);

type TabKey = 'campaign' | 'url' | 'affiliate';

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { key: 'campaign', label: 'Campaign Map', icon: Megaphone },
  { key: 'url', label: 'URL Map', icon: Globe },
  { key: 'affiliate', label: 'Affiliate Map', icon: Link2 },
];

export default function DataMapsPage(): React.ReactNode {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('campaign');

  if (authLoading) {
    return <div className={settingsStyles.centeredState}><Spin size="small" /></div>;
  }

  if (!isAuthenticated) {
    return <div className={settingsStyles.authMessage}>Please log in to access this page.</div>;
  }

  return (
    <div className={settingsStyles.page}>
      <div className={settingsStyles.sectionHeader}>
        <div className={settingsStyles.sectionInfo}>
          <h2 className={settingsStyles.sectionTitle}>Data Maps</h2>
          <p className={settingsStyles.sectionSubtitle}>
            Map campaigns, URLs, and affiliates to products and countries
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className={styles.tabs}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className={styles.tabIcon} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <Suspense fallback={<div className={settingsStyles.centeredState}><Spin size="small" /></div>}>
        {activeTab === 'campaign' && <CampaignMapPanel />}
        {activeTab === 'url' && <UrlMapPanel />}
        {activeTab === 'affiliate' && <AffiliateMapPanel />}
      </Suspense>
    </div>
  );
}
