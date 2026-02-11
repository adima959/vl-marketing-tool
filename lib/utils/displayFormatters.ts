/**
 * Display formatters shared across marketing tracker components.
 *
 * Extracted from ActivityFeed, ConceptDetailPanel, and OnPageViewsModal
 * to eliminate duplication and provide a single source of truth.
 */

/** Relative time display: "just now", "5m ago", "3h ago", "2d ago", or locale date for >7 days */
export function formatTimeAgo(dateString: string): string {
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

/** Format seconds as "Xs" or "Xm Ys" */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '–';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

/** Convert camelCase field name to human-readable label using a lookup map */
export function formatFieldName(field: string, labels: Record<string, string>): string {
  if (labels[field]) return labels[field];
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

/** Format a history value for display (truncate long strings, strip HTML, handle null) */
export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const plain = value.replace(/<[^>]*>/g, '').trim();
    if (!plain) return null;
    return plain.length > 40 ? plain.slice(0, 40) + '...' : plain;
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  return null;
}

/** Summarize activity count for collapsed feed */
export function getSummaryText(activity: { changedAt: string }[]): string {
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

/** Format a history entry for display in ConceptDetailPanel */
export function formatHistoryEntry(entry: { action: string; fieldName: string; oldValue: unknown; newValue: unknown }): string {
  if (entry.action === 'create') return 'Message created';
  if (entry.action === 'delete') return 'Message deleted';
  const field = entry.fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, s => s.toUpperCase());
  if (entry.fieldName === 'pipelineStage') return `Stage changed to ${entry.newValue}`;
  const oldStr = entry.oldValue != null ? String(entry.oldValue) : '—';
  const newStr = entry.newValue != null ? String(entry.newValue) : '—';
  if (oldStr === '—') return `${field} set to "${newStr}"`;
  return `${field} changed`;
}
