'use client';

import { ExportOutlined, RightOutlined } from '@ant-design/icons';
import { fmtNumber, fmtPct, fmtTime } from '@/lib/marketing-pipeline/formatters';
import { formatNok } from '@/lib/marketing-pipeline/cpaUtils';
import type { CampaignHierarchyData, AdLandingPage } from '@/types';
import styles from './CampaignDetailContent.module.css';

// Local aliases for brevity
const fmt = fmtNumber;
const pct = fmtPct;
const formatTime = fmtTime;

// ── V2 Hierarchy Section ─────────────────────────────────────────────

interface V2HierarchySectionProps {
  hierarchy: CampaignHierarchyData | null;
  hierarchyLoading: boolean;
  hasExternalId: boolean;
  expandedAdsets: Set<string>;
  expandedAds: Set<string>;
  onToggleAdset: (id: string) => void;
  onToggleAd: (id: string) => void;
}

export function V2HierarchySection({
  hierarchy,
  hierarchyLoading,
  hasExternalId,
  expandedAdsets,
  expandedAds,
  onToggleAdset,
  onToggleAd,
}: V2HierarchySectionProps): React.ReactNode {
  const totalSpend = hierarchy?.adsets.reduce((s, a) => s + a.spend, 0) ?? 0;

  return (
    <div className={styles.v2Hierarchy}>
      {/* Column headers */}
      <div className={styles.v2ColHeader}>
        <span className={styles.v2ColLabel}>Ad Set / Ad</span>
        <span className={styles.v2ColLabel}>Spend</span>
        <span className={styles.v2ColLabel}>Clicks</span>
        <span className={styles.v2ColLabel}>CTR</span>
        <span className={styles.v2ColLabel}>Conv</span>
      </div>

      {hierarchyLoading ? (
        <div className={styles.v2Empty}>Loading...</div>
      ) : !hierarchy || hierarchy.adsets.length === 0 ? (
        <div className={styles.v2Empty}>
          {!hasExternalId ? 'No External ID linked' : 'No adset data for this period'}
        </div>
      ) : (
        hierarchy.adsets.map(adset => {
          const ads = hierarchy.ads.filter(a => a.adsetId === adset.adsetId);
          const expanded = expandedAdsets.has(adset.adsetId);
          const spendPct = totalSpend > 0 ? (adset.spend / totalSpend) * 100 : 0;

          return (
            <div key={adset.adsetId}>
              {/* Adset row */}
              <div className={styles.v2AdsetRow} onClick={() => onToggleAdset(adset.adsetId)}>
                <div className={styles.v2AdsetNameCell}>
                  {ads.length > 0 && (
                    <span className={`${styles.v2Expand} ${expanded ? styles.v2ExpandOpen : ''}`}>
                      <RightOutlined />
                    </span>
                  )}
                  <span className={styles.v2AdsetName}>{adset.adsetName}</span>
                </div>
                <div className={styles.v2SpendCell}>
                  <span className={styles.v2MetricCell}>{formatNok(adset.spend)}</span>
                  <div className={styles.v2SpendBar}>
                    <div className={styles.v2SpendBarFill} style={{ width: `${spendPct}%` }} />
                  </div>
                </div>
                <span className={styles.v2MetricCell}>{fmt(adset.clicks)}</span>
                <span className={styles.v2MetricCell}>{pct(adset.ctr)}</span>
                <span className={styles.v2MetricCell}>{fmt(adset.conversions)}</span>
              </div>

              {/* Expanded ads */}
              {expanded && ads.length > 0 && (
                <div className={styles.v2AdsContainer}>
                  {ads.map(ad => {
                    const landingPages = hierarchy.adLandingPages[ad.adId] ?? [];
                    const hasPages = landingPages.length > 0;
                    const adExpanded = expandedAds.has(ad.adId);

                    return (
                      <div key={ad.adId}>
                        <div
                          className={styles.v2AdRow}
                          onClick={hasPages ? () => onToggleAd(ad.adId) : undefined}
                          style={{ cursor: hasPages ? 'pointer' : 'default' }}
                        >
                          <div className={styles.v2AdNameCell}>
                            {hasPages && (
                              <span className={`${styles.v2Expand} ${adExpanded ? styles.v2ExpandOpen : ''}`}>
                                <RightOutlined />
                              </span>
                            )}
                            <span className={styles.v2AdName}>{ad.adName}</span>
                          </div>
                          <span className={styles.v2AdMetric}>{formatNok(ad.spend)}</span>
                          <span className={styles.v2AdMetric}>{fmt(ad.clicks)}</span>
                          <span className={styles.v2AdMetric}>{pct(ad.ctr)}</span>
                          <span className={styles.v2AdMetric}>{fmt(ad.conversions)}</span>
                        </div>

                        {/* Landing pages — tabular with entry/thank-you grouping */}
                        {adExpanded && hasPages && (
                          <V2LandingPageTable landingPages={landingPages} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── V2 Landing Page Table ────────────────────────────────────────────

function isThankYouPage(urlPath: string): boolean {
  const lower = urlPath.toLowerCase();
  return lower.includes('thank-you') || lower.includes('thankyou') || lower.includes('tack') || lower.includes('tak');
}

interface LpGroup {
  entry: AdLandingPage;
  children: AdLandingPage[];
}

function groupLandingPages(pages: AdLandingPage[]): LpGroup[] {
  const entries = pages.filter(p => !isThankYouPage(p.urlPath));
  const thankYous = pages.filter(p => isThankYouPage(p.urlPath));

  if (entries.length === 0) return pages.map(p => ({ entry: p, children: [] }));
  if (entries.length === 1) return [{ entry: entries[0], children: thankYous }];

  return entries.map((entry, i) => ({
    entry,
    children: i === 0 ? thankYous : [],
  }));
}

function V2LpRow({ lp }: { lp: AdLandingPage }): React.ReactNode {
  return (
    <>
      <span className={styles.v2LpMetricCell}>{fmt(lp.pageViews)}</span>
      <span className={styles.v2LpMetricCell}>{fmt(lp.uniqueVisitors)}</span>
      <span className={lp.scrollRate >= 0.5 ? styles.v2LpHighlight : styles.v2LpMetricCell}>
        {pct(lp.scrollRate)}
      </span>
      <span className={lp.formStartRate >= 0.1 ? styles.v2LpHighlight : styles.v2LpMetricCell}>
        {pct(lp.formStartRate)}
      </span>
      <span className={lp.bounceRate >= 0.5 ? styles.v2LpWarn : styles.v2LpMetricCell}>
        {pct(lp.bounceRate)}
      </span>
      <span className={styles.v2LpMetricCell}>{formatTime(lp.avgTimeOnPage)}</span>
    </>
  );
}

function V2LandingPageTable({ landingPages }: { landingPages: AdLandingPage[] }): React.ReactNode {
  const groups = groupLandingPages(landingPages);

  return (
    <div className={styles.v2LpContainer}>
      <div className={styles.v2LpHeader}>
        <span className={styles.v2LpColLabel}>Landing Page</span>
        <span className={styles.v2LpColLabel}>Views</span>
        <span className={styles.v2LpColLabel}>Unique</span>
        <span className={styles.v2LpColLabel}>Scroll</span>
        <span className={styles.v2LpColLabel}>Form</span>
        <span className={styles.v2LpColLabel}>Bounce</span>
        <span className={styles.v2LpColLabel}>Time</span>
      </div>
      {groups.map(group => (
        <div key={group.entry.urlPath} className={styles.v2LpGroup}>
          <div className={styles.v2LpRow}>
            <a href={group.entry.urlPath} target="_blank" rel="noopener noreferrer" className={styles.v2LpUrl} title={group.entry.urlPath}>
              {group.entry.urlPath}
              <ExportOutlined className={styles.v2LpLinkIcon} />
            </a>
            <V2LpRow lp={group.entry} />
          </div>
          {group.children.map(child => (
            <div key={child.urlPath} className={styles.v2LpChildRow}>
              <a href={child.urlPath} target="_blank" rel="noopener noreferrer" className={styles.v2LpChildUrl} title={child.urlPath}>
                <span className={styles.v2LpChildArrow}>&rarr;</span>
                {child.urlPath}
                <ExportOutlined className={styles.v2LpLinkIcon} />
              </a>
              <V2LpRow lp={child} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
