/**
 * Shared CRM metric fields — single source of truth for both Dashboard and Marketing Report.
 *
 * Dashboard extends with: upsellSub, upsellOts
 * Marketing extends with: ad metrics (cost, clicks, etc.) + realCpa
 */
export type CrmMetrics = {
  customers: number;
  subscriptions: number;
  trials: number;
  trialsApproved: number;
  ots: number;
  otsApproved: number;
  onHold: number;
  approvalRate: number;
  upsells: number;
  upsellsApproved: number;
  otsApprovalRate: number;
  upsellApprovalRate: number;
}
