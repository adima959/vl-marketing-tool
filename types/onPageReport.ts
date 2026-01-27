export interface OnPageReportRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: OnPageReportRow[];
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
