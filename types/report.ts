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
    customers: number;
    subscriptions: number;
    trials: number;
    trialsApproved: number;
    ots: number;
    otsApproved: number;
    approvalRate: number;
    otsApprovalRate: number;
    upsells: number;
    upsellsApproved: number;
    upsellApprovalRate: number;
    realCpa: number;
  };
}

export interface DateRange {
  start: Date;
  end: Date;
}
