export interface ReportRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: ReportRow[];
  metrics: {
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversionRate: number;
  };
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ReportFilters {
  dateRange: DateRange;
  timezone: string;
  dimensions: string[];
  useEntranceTime: boolean;
}
