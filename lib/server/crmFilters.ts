/**
 * Shared CRM Business Rules
 *
 * These filters define what counts as a valid trial, subscription, etc.
 * Used by both Dashboard (geography mode) and Marketing Report (tracking mode)
 * to ensure consistent counting logic across the application.
 *
 * IMPORTANT: When updating these rules, both Dashboard and Marketing Report
 * will automatically use the updated logic.
 */

/**
 * SQL WHERE conditions for CRM queries
 * These are applied at the database level for performance
 */
export const CRM_FILTERS = {
  /**
   * Exclude deleted subscriptions from all counts
   * Applied to subscription table
   */
  notDeletedSubscription: 's.deleted = 0',

  /**
   * Exclude deleted invoices from trial counts
   * Applied to invoice table
   */
  notDeletedInvoice: 'i.deleted = 0',

  /**
   * Exclude upsell-tagged invoices from trial counts
   * Upsell tags contain 'parent-sub-id=' indicating this is an upsell invoice
   */
  notUpsellTagged: "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",

  /**
   * Only trial invoices (type = 1)
   * Applied when counting trials
   */
  trialInvoiceType: 'i.type = 1',

  /**
   * Only marked/approved invoices
   * Applied when counting approved trials
   */
  isMarked: 'i.is_marked = 1',

  /**
   * Has valid tracking IDs (required for Marketing Report matching)
   * All three IDs must be non-null and non-empty
   */
  hasTrackingIds: [
    's.tracking_id_4 IS NOT NULL',
    "s.tracking_id_4 != ''",
    's.tracking_id_2 IS NOT NULL',
    "s.tracking_id_2 != ''",
    's.tracking_id IS NOT NULL',
    "s.tracking_id != ''",
  ],
} as const;

/**
 * JavaScript-side filter for client-side aggregation (Marketing Report)
 * Checks if a subscription row should be counted in trial metrics
 */
export interface CRMRowForFiltering {
  subscription_deleted?: number | boolean;
  invoice_deleted?: number | boolean;
  invoice_id?: number | string | null;
  invoice_tag?: string | null;
  campaign_id?: string | null;
  source?: string | null;
}

/**
 * Check if a row is eligible to be counted as a trial
 * This matches the SQL-level filters in CRM_FILTERS
 *
 * @param row - Database row with subscription/invoice data
 * @returns true if row should be counted in trial metrics
 */
export function isEligibleForTrialCount(row: CRMRowForFiltering): boolean {
  // Must not be deleted (subscription or invoice)
  if (row.subscription_deleted) return false;
  if (row.invoice_deleted) return false;

  // Must have an invoice
  if (!row.invoice_id) return false;

  // Must not be tagged as an upsell
  if (row.invoice_tag && row.invoice_tag.includes('parent-sub-id=')) {
    return false;
  }

  return true;
}

/**
 * Check if a row is eligible for Marketing Report matching
 * Requires valid tracking IDs and source in addition to trial eligibility
 *
 * @param row - Database row with subscription/invoice data
 * @returns true if row should be included in Marketing Report CRM data
 */
export function isEligibleForMarketingMatch(row: CRMRowForFiltering): boolean {
  // Must pass trial eligibility first
  if (!isEligibleForTrialCount(row)) return false;

  // Must have tracking IDs
  if (!row.campaign_id) return false;

  // Must have source for network matching
  if (!row.source) return false;

  return true;
}

/**
 * Get a human-readable list of reasons why a row is not eligible
 * Useful for debugging and diagnostic scripts
 *
 * @param row - Database row to check
 * @returns Array of issue descriptions
 */
export function getIneligibilityReasons(row: CRMRowForFiltering): string[] {
  const reasons: string[] = [];

  if (row.subscription_deleted) reasons.push('SUBSCRIPTION DELETED');
  if (row.invoice_deleted) reasons.push('INVOICE DELETED');
  if (!row.invoice_id) reasons.push('NO INVOICE');
  if (row.invoice_tag && row.invoice_tag.includes('parent-sub-id=')) {
    reasons.push('UPSELL TAG (excluded from trials)');
  }
  if (!row.campaign_id) reasons.push('NO CAMPAIGN ID');
  if (!row.source) reasons.push('NO SOURCE');

  return reasons;
}
