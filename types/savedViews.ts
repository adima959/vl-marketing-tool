export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last14days'
  | 'last30days'
  | 'last90days'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth';

export type DateMode = 'relative' | 'absolute';

export interface SavedView {
  id: string;
  name: string;
  pagePath: string;
  dateMode: DateMode;
  datePreset: DatePreset | null;
  dateStart: string | null; // YYYY-MM-DD
  dateEnd: string | null; // YYYY-MM-DD
  dimensions: string[] | null;
  filters: { field: string; operator: string; value: string }[] | null;
  sortBy: string | null;
  sortDir: 'ascend' | 'descend' | null;
  period: 'weekly' | 'biweekly' | 'monthly' | null;
  visibleColumns: string[] | null;
  isFavorite: boolean;
  favoriteOrder: number | null;
  createdAt: string;
}

export interface ResolvedViewParams {
  start: Date;
  end: Date;
  dimensions?: string[];
  filters?: { field: string; operator: string; value: string }[];
  sortBy?: string;
  sortDir?: 'ascend' | 'descend';
  period?: 'weekly' | 'biweekly' | 'monthly';
  visibleColumns?: string[];
}
