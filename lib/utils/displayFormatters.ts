/**
 * Display formatters shared across marketing pipeline components.
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

/** Human-readable field labels for history display */
const HISTORY_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  angleId: 'Angle',
  ownerId: 'Owner',
  pipelineStage: 'Stage',
  specificPainPoint: 'Pain point',
  corePromise: 'Core promise',
  keyIdea: 'Key idea',
  primaryHookDirection: 'Hook direction',
  description: 'Description',
  notes: 'Notes',
  spendThreshold: 'Spend threshold',
  status: 'Status',
  copyVariations: 'Copy variations',
  channel: 'Channel',
  geo: 'Geo',
  stage: 'Stage',
  cpa: 'CPA',
  spend: 'Spend',
  externalId: 'External ID',
  externalUrl: 'External URL',
  isPrimary: 'Primary',
  messageId: 'Message',
};

/** Format a history entry for display in ConceptDetailPanel */
export function formatHistoryEntry(entry: {
  action: string;
  entityType?: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  oldValueDisplay?: string | null;
  newValueDisplay?: string | null;
}): string {
  const isCampaign = entry.entityType === 'campaign';
  const isGeo = entry.entityType === 'pipeline_message' && (entry.fieldName === 'geo' || entry.fieldName === 'stage' || entry.fieldName === 'isPrimary');

  // Created/deleted actions
  if (entry.action === 'created') {
    if (isCampaign) {
      const geo = (entry.fieldName === 'geo' ? entry.newValue : null) as string | null;
      const channel = (entry.fieldName === 'channel' ? entry.newValue : null) as string | null;
      if (geo || channel) return `Campaign ${channel ?? ''} ${geo ?? ''} added`.trim();
      return 'Campaign added';
    }
    if (entry.fieldName === 'geo') return `Geo ${entry.newValue} added`;
    return 'Message created';
  }
  if (entry.action === 'deleted') {
    if (isCampaign) return 'Campaign removed';
    if (entry.fieldName === '_deleted' && !isCampaign) {
      const snap = entry.oldValue as Record<string, unknown> | null;
      if (snap?.geo) return `Geo ${snap.geo} removed`;
    }
    return 'Message deleted';
  }

  if (entry.fieldName === 'copyVariations') return 'Copy variations changed';

  const field = HISTORY_FIELD_LABELS[entry.fieldName]
    ?? entry.fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, s => s.toUpperCase());

  if (entry.fieldName === 'pipelineStage') return `Stage changed to ${entry.newValue}`;
  if (entry.fieldName === 'stage' && isGeo) {
    return `Geo stage changed to ${entry.newValue}`;
  }

  // Use display values (resolved names) if available, otherwise raw values
  const oldStr = entry.oldValueDisplay ?? (typeof entry.oldValue === 'string' ? entry.oldValue : null);
  const newStr = entry.newValueDisplay ?? (typeof entry.newValue === 'string' ? entry.newValue : null);

  const prefix = isCampaign ? 'Campaign ' : '';
  if (oldStr && newStr) return `${prefix}${field}: ${oldStr} → ${newStr}`;
  if (!oldStr && newStr) return `${prefix}${field} set to "${newStr}"`;
  if (oldStr && !newStr) return `${prefix}${field} "${oldStr}" removed`;
  return `${prefix}${field} changed`;
}

// ── Copy Variations diff ──────────────────────────────────
const SECTION_LABELS: Record<string, string> = { hook: 'Hook', primaryText: 'Primary Text', cta: 'CTA' };
const LANG_LABELS: Record<string, string> = { en: 'EN', no: 'NO', se: 'SE', dk: 'DK' };
const SECTIONS = ['hook', 'primaryText', 'cta'] as const;
const LANGS = ['en', 'no', 'se', 'dk'] as const;

interface CopyVar {
  id: string;
  status?: string;
  hook?: Record<string, string>;
  primaryText?: Record<string, string>;
  cta?: Record<string, string>;
}

export interface CopyVariationChange {
  type: 'added' | 'deleted' | 'text_changed';
  /** 1-based variation number (uses position in the new array, or old array for deletes) */
  variationNum: number;
  /** e.g. "Hook EN" — only for text_changed */
  cellLabel?: string;
  oldText?: string;
  newText?: string;
  /** Snapshot of the variation's content (for added/deleted) */
  snapshot?: Record<string, string>;
}

/** Extract non-empty text cells from a variation as "Section Lang" → text */
function buildSnapshot(v: CopyVar): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const section of SECTIONS) {
    for (const lang of LANGS) {
      const text = v[section]?.[lang]?.trim();
      if (text) {
        snap[`${SECTION_LABELS[section]} ${LANG_LABELS[lang]}`] = text;
      }
    }
  }
  return snap;
}

/** Diff two copy variation arrays and return granular changes */
export function diffCopyVariations(oldVal: unknown, newVal: unknown): CopyVariationChange[] {
  const oldArr = (Array.isArray(oldVal) ? oldVal : []) as CopyVar[];
  const newArr = (Array.isArray(newVal) ? newVal : []) as CopyVar[];

  const changes: CopyVariationChange[] = [];
  const oldById = new Map(oldArr.map((v, i) => [v.id, { variation: v, index: i }]));
  const newById = new Map(newArr.map((v, i) => [v.id, { variation: v, index: i }]));

  // Deleted variations (in old but not in new)
  for (const [id, { variation, index }] of oldById) {
    if (!newById.has(id)) {
      changes.push({ type: 'deleted', variationNum: index + 1, snapshot: buildSnapshot(variation) });
    }
  }

  // Added variations (in new but not in old)
  for (const [id, { variation, index }] of newById) {
    if (!oldById.has(id)) {
      changes.push({ type: 'added', variationNum: index + 1, snapshot: buildSnapshot(variation) });
    }
  }

  // Text changes for variations present in both
  for (const [id, { variation: newV, index: newIdx }] of newById) {
    const oldEntry = oldById.get(id);
    if (!oldEntry) continue;
    const oldV = oldEntry.variation;

    for (const section of SECTIONS) {
      for (const lang of LANGS) {
        const oldText = (oldV[section]?.[lang] ?? '').trim();
        const newText = (newV[section]?.[lang] ?? '').trim();
        if (oldText !== newText) {
          changes.push({
            type: 'text_changed',
            variationNum: newIdx + 1,
            cellLabel: `${SECTION_LABELS[section]} ${LANG_LABELS[lang]}`,
            oldText: oldText || undefined,
            newText: newText || undefined,
          });
        }
      }
    }
  }

  return changes;
}
