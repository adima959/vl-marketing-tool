export interface ReportRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: ReportRow[];
  metrics: {
    // Ad spend metrics
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversionRate: number;
    // CRM metrics
    customers: number;
    upsellNewCustomers: number;
    subscriptions: number;
    upsellSubs: number;
    upsellSubTrials: number;
    trials: number;
    trialsApproved: number;
    approvalRate: number;
    realCpa: number;
    onHold: number;
    ots: number;
    otsApproved: number;
    otsApprovalRate: number;
    upsells: number;
    upsellsApproved: number;
    upsellsDeleted: number;
    upsellApprovalRate: number;
  };
}
