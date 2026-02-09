import { formatLocalDate } from '@/lib/types/api';
import type { DatePreset, SavedView, ResolvedViewParams } from '@/types/savedViews';

/**
 * Map of preset identifiers to human-readable labels
 */
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7days: 'Last 7 days',
  last14days: 'Last 14 days',
  last30days: 'Last 30 days',
  last90days: 'Last 90 days',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
};

/**
 * Resolve a relative date preset to concrete start/end dates
 * Computes relative to "today" at call time — NOT at save time
 */
export function resolveDatePreset(preset: DatePreset): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  const end = new Date(today);

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'last7days':
      start.setDate(start.getDate() - 6);
      break;
    case 'last14days':
      start.setDate(start.getDate() - 13);
      break;
    case 'last30days':
      start.setDate(start.getDate() - 29);
      break;
    case 'last90days':
      start.setDate(start.getDate() - 89);
      break;
    case 'thisWeek': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = start of week
      start.setDate(start.getDate() - diff);
      break;
    }
    case 'lastWeek': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(today.getDate() - diff - 7);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'thisMonth':
      start.setDate(1);
      break;
    case 'lastMonth':
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      end.setDate(1);
      end.setMonth(end.getMonth());
      end.setDate(0); // last day of previous month
      break;
  }

  return { start, end };
}

/**
 * Resolve a saved view to concrete params for applying to store/URL
 * Relative dates are computed at call time
 */
export function resolveViewParams(view: SavedView): ResolvedViewParams {
  let start: Date;
  let end: Date;

  if (view.dateMode === 'none') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start = today;
    end = new Date(today);
  } else if (view.dateMode === 'relative' && view.datePreset) {
    const resolved = resolveDatePreset(view.datePreset);
    start = resolved.start;
    end = resolved.end;
  } else {
    start = new Date(view.dateStart!);
    start.setHours(0, 0, 0, 0);
    end = new Date(view.dateEnd!);
    end.setHours(0, 0, 0, 0);
  }

  return {
    start,
    end,
    dimensions: view.dimensions ?? undefined,
    filters: view.filters ?? undefined,
    sortBy: view.sortBy ?? undefined,
    sortDir: view.sortDir ?? undefined,
    period: view.period ?? undefined,
    visibleColumns: view.visibleColumns ?? undefined,
  };
}

/**
 * Detect if a date range matches a known relative preset
 * Used when saving to suggest "relative" mode
 */
export function detectDatePreset(start: Date, end: Date): DatePreset | null {
  const startStr = formatLocalDate(start);
  const endStr = formatLocalDate(end);

  const presets: DatePreset[] = [
    'today',
    'yesterday',
    'last7days',
    'last14days',
    'last30days',
    'last90days',
    'thisWeek',
    'lastWeek',
    'thisMonth',
    'lastMonth',
  ];

  for (const preset of presets) {
    const resolved = resolveDatePreset(preset);
    if (
      formatLocalDate(resolved.start) === startStr &&
      formatLocalDate(resolved.end) === endStr
    ) {
      return preset;
    }
  }

  return null;
}
