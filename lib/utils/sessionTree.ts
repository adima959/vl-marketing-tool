import type { SessionReportRow } from '@/types/sessionReport';
import { toTitleCase } from '@/lib/formatters';

/** Flat row from the session flat query API */
export type SessionFlatRow = Record<string, string | number>;

/** Enriched dimensions that use _id columns for keys instead of display names */
const ENRICHED_DIMS = new Set(['entryCampaign', 'entryAdset', 'entryAd']);

/**
 * Build a hierarchical tree from flat session data rows.
 *
 * Groups rows by dimensions at each level, sums base metric counts,
 * and computes derived metrics from the correct aggregated sums.
 * This prevents averaging-of-averages errors for ratios like bounce rate.
 */
export function buildSessionTree(
  flatRows: SessionFlatRow[],
  dimensions: string[],
  sortBy: string | null,
  sortDirection: 'ascend' | 'descend' | null,
): SessionReportRow[] {
  if (flatRows.length === 0 || dimensions.length === 0) return [];
  return buildLevel(
    flatRows,
    dimensions,
    0,
    '',
    sortBy ?? 'pageViews',
    sortDirection ?? 'descend',
  );
}

function buildLevel(
  rows: SessionFlatRow[],
  dimensions: string[],
  depth: number,
  keyPrefix: string,
  sortBy: string,
  sortDirection: 'ascend' | 'descend',
): SessionReportRow[] {
  if (depth >= dimensions.length || rows.length === 0) return [];

  const dim = dimensions[depth];
  const isLast = depth === dimensions.length - 1;
  const isEnriched = ENRICHED_DIMS.has(dim);

  // Group rows by the current dimension value
  const groups = new Map<string, SessionFlatRow[]>();
  for (const row of rows) {
    const val = String(row[dim] ?? 'Unknown');
    let group = groups.get(val);
    if (!group) {
      group = [];
      groups.set(val, group);
    }
    group.push(row);
  }

  // Build a SessionReportRow per group
  const result: SessionReportRow[] = [];
  for (const [dimValue, groupRows] of groups) {
    // For enriched dims: use tracking ID for key, display name for attribute
    // The first row's _id value is representative (all rows in this group share the same dim value)
    const idKey = `_${dim}_id`;
    const keyValue = isEnriched && groupRows[0][idKey] != null
      ? String(groupRows[0][idKey])
      : dimValue;
    const key = keyPrefix ? `${keyPrefix}::${keyValue}` : keyValue;

    // Sum raw metric counts across all rows in this group
    let pageViews = 0;
    let uniqueVisitors = 0;
    let bouncedCount = 0;
    let activeTimeCount = 0;
    let totalActiveTime = 0;
    let scrollPastHero = 0;
    let formViews = 0;
    let formStarters = 0;

    for (const r of groupRows) {
      pageViews += Number(r.page_views) || 0;
      uniqueVisitors += Number(r.unique_visitors) || 0;
      bouncedCount += Number(r.bounced_count) || 0;
      activeTimeCount += Number(r.active_time_count) || 0;
      totalActiveTime += Number(r.total_active_time) || 0;
      scrollPastHero += Number(r.scroll_past_hero) || 0;
      formViews += Number(r.form_views) || 0;
      formStarters += Number(r.form_starters) || 0;
    }

    // Compute derived metrics from aggregated sums (NOT averaged)
    const bounceRate = activeTimeCount > 0 ? bouncedCount / activeTimeCount : 0;
    const avgActiveTime = activeTimeCount > 0 ? totalActiveTime / activeTimeCount : 0;
    const scrollRate = pageViews > 0 ? scrollPastHero / pageViews : 0;
    const formViewRate = pageViews > 0 ? formViews / pageViews : 0;
    const formStartRate = formViews > 0 ? formStarters / formViews : 0;

    const row: SessionReportRow = {
      key,
      attribute: formatAttribute(dim, dimValue, isEnriched),
      depth,
      hasChildren: !isLast,
      metrics: {
        pageViews,
        uniqueVisitors,
        bounceRate: Math.round(bounceRate * 10000) / 10000,
        avgActiveTime: Math.round(avgActiveTime * 100) / 100,
        scrollPastHero,
        scrollRate: Math.round(scrollRate * 10000) / 10000,
        formViews,
        formViewRate: Math.round(formViewRate * 10000) / 10000,
        formStarters,
        formStartRate: Math.round(formStartRate * 10000) / 10000,
      },
    };

    if (!isLast) {
      row.children = buildLevel(groupRows, dimensions, depth + 1, key, sortBy, sortDirection);
    }

    result.push(row);
  }

  return sortRows(result, sortBy, sortDirection, dim);
}

/** Dimensions that should never be title-cased (URLs, domains, IDs) */
const RAW_VALUE_DIMS = new Set([
  'entryUrlPath', 'urlPath', 'funnelStep',
  'entryReferrer', 'entryPlacement',
  'funnelId', 'entryWebmasterId',
]);

/** Format a dimension value for display */
function formatAttribute(dimension: string, value: string, isEnriched: boolean): string {
  if (dimension === 'date') return value;
  if (dimension === 'entryCountryCode') return value.toUpperCase();
  // Enriched dims already have proper names from marketing_merged_ads_spending
  if (isEnriched) return value;
  // URLs, domains, and IDs should not be title-cased
  if (RAW_VALUE_DIMS.has(dimension)) return value;
  return toTitleCase(value);
}

/** Sort rows — date dimension always sorts chronologically DESC, others by metric */
function sortRows(
  rows: SessionReportRow[],
  sortBy: string,
  direction: 'ascend' | 'descend',
  dimension: string,
): SessionReportRow[] {
  if (dimension === 'date') {
    return rows.sort((a, b) => b.attribute.localeCompare(a.attribute));
  }

  const multiplier = direction === 'ascend' ? 1 : -1;
  return rows.sort((a, b) => {
    const aVal = a.metrics[sortBy as keyof typeof a.metrics];
    const bVal = b.metrics[sortBy as keyof typeof b.metrics];
    const aNum = typeof aVal === 'number' ? aVal : 0;
    const bNum = typeof bVal === 'number' ? bVal : 0;
    return (aNum - bNum) * multiplier;
  });
}
