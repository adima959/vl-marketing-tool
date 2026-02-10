/**
 * Integration tests to verify CRM counting logic is consistent
 * between Dashboard (geography mode) and Marketing Report (tracking mode)
 *
 * These tests ensure that when filtering rules change, both pages
 * continue to count subscriptions/trials the same way.
 */

import { describe, it, expect } from '@jest/globals';
import { isEligibleForTrialCount, isEligibleForMarketingMatch } from '@/lib/server/crmFilters';

describe('CRM Filtering Consistency', () => {
  describe('isEligibleForTrialCount', () => {
    it('should exclude deleted subscriptions', () => {
      const row = {
        subscription_deleted: 1,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
      };

      expect(isEligibleForTrialCount(row)).toBe(false);
    });

    it('should exclude deleted invoices', () => {
      const row = {
        subscription_deleted: 0,
        invoice_deleted: 1,
        invoice_id: 123,
        invoice_tag: null,
      };

      expect(isEligibleForTrialCount(row)).toBe(false);
    });

    it('should exclude subscriptions without invoices', () => {
      const row = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: null,
        invoice_tag: null,
      };

      expect(isEligibleForTrialCount(row)).toBe(false);
    });

    it('should exclude upsell-tagged invoices', () => {
      const row = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: 'parent-sub-id=12345',
      };

      expect(isEligibleForTrialCount(row)).toBe(false);
    });

    it('should include valid trial invoices', () => {
      const row = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
      };

      expect(isEligibleForTrialCount(row)).toBe(true);
    });
  });

  describe('isEligibleForMarketingMatch', () => {
    it('should require tracking IDs in addition to trial eligibility', () => {
      const validTrial = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
        campaign_id: null, // Missing tracking
        source: 'Adwords',
      };

      expect(isEligibleForTrialCount(validTrial)).toBe(true);
      expect(isEligibleForMarketingMatch(validTrial)).toBe(false);
    });

    it('should require source in addition to trial eligibility', () => {
      const validTrial = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
        campaign_id: '12345',
        source: null, // Missing source
      };

      expect(isEligibleForTrialCount(validTrial)).toBe(true);
      expect(isEligibleForMarketingMatch(validTrial)).toBe(false);
    });

    it('should include rows that are eligible trials with tracking and source', () => {
      const row = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
        campaign_id: '12345',
        source: 'Adwords',
      };

      expect(isEligibleForTrialCount(row)).toBe(true);
      expect(isEligibleForMarketingMatch(row)).toBe(true);
    });
  });

  describe('Business Rule Documentation', () => {
    it('should document why Dashboard and Marketing Report might show different counts', () => {
      // Dashboard shows ALL eligible trials (only needs invoice, not deleted)
      const dashboardEligible = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
        campaign_id: null, // No tracking - OK for Dashboard
        source: null, // No source - OK for Dashboard
      };

      // Marketing Report only shows trials that can be matched to ads (needs tracking + source)
      const marketingEligible = {
        subscription_deleted: 0,
        invoice_deleted: 0,
        invoice_id: 123,
        invoice_tag: null,
        campaign_id: '12345', // Required for Marketing
        source: 'Adwords', // Required for Marketing
      };

      expect(isEligibleForTrialCount(dashboardEligible)).toBe(true);
      expect(isEligibleForMarketingMatch(dashboardEligible)).toBe(false);

      expect(isEligibleForTrialCount(marketingEligible)).toBe(true);
      expect(isEligibleForMarketingMatch(marketingEligible)).toBe(true);
    });
  });
});
