export interface SessionReportRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: SessionReportRow[];
  metrics: {
    pageViews: number;
    uniqueVisitors: number;
    bounceRate: number;
    avgActiveTime: number;
    scrollPastHero: number;
    scrollRate: number;
    formViews: number;
    formViewRate: number;
    formStarters: number;
    formStartRate: number;
  };
}
