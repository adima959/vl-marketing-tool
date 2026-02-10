import { TrendingUp, ShoppingCart, CreditCard } from 'lucide-react';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { useBuyRateStore } from '@/stores/buyRateStore';
import { usePayRateStore } from '@/stores/payRateStore';
import type { LucideIcon } from 'lucide-react';
import type { UseBoundStore, StoreApi } from 'zustand';
import type { ValidationRateStore } from '@/types/validationRate';

/**
 * Validation Reports Configuration
 *
 * Single source of truth for all validation report pages.
 * Consolidates route validation, metadata, and UI configuration.
 *
 * Usage:
 * - page.tsx: Uses VALIDATION_REPORT_TYPES for route validation
 * - layout.tsx: Uses VALIDATION_REPORTS for metadata generation
 * - ValidationReportClient.tsx: Uses VALIDATION_REPORTS for UI rendering
 */

// Strict type for validation report types (derived from keys)
export const VALIDATION_REPORT_TYPES = ['approval-rate', 'buy-rate', 'pay-rate'] as const;
export type ValidationReportType = typeof VALIDATION_REPORT_TYPES[number];

/**
 * Unified configuration for each validation report
 * Contains all metadata, UI config, and store references
 */
export const VALIDATION_REPORTS: Record<
  ValidationReportType,
  {
    // Page metadata (for layout.tsx)
    title: string;
    description: string;

    // UI configuration (for ValidationReportClient.tsx)
    Icon: LucideIcon;
    promptTitle: string;

    // Store and API configuration
    useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
    urlParam: 'approval' | 'buy' | 'pay';
    rateType?: 'approval' | 'buy' | 'pay';
    modalRecordLabel?: string;
  }
> = {
  'approval-rate': {
    title: 'Approval Rate | Vitaliv Analytics',
    description: 'Approval rate analysis across dimensions and time periods',
    Icon: TrendingUp,
    promptTitle: 'Ready to analyze approval rates?',
    useStore: useApprovalRateStore,
    urlParam: 'approval',
  },
  'buy-rate': {
    title: 'Buy Rate | Vitaliv Analytics',
    description: 'Buy rate analysis across dimensions and time periods',
    Icon: ShoppingCart,
    promptTitle: 'Ready to analyze buy rates?',
    useStore: useBuyRateStore,
    urlParam: 'buy',
    rateType: 'buy',
    modalRecordLabel: 'Invoices',
  },
  'pay-rate': {
    title: 'Pay Rate | Vitaliv Analytics',
    description: 'Pay rate analysis across dimensions and time periods',
    Icon: CreditCard,
    promptTitle: 'Ready to analyze pay rates?',
    useStore: usePayRateStore,
    urlParam: 'pay',
    rateType: 'pay',
    modalRecordLabel: 'Invoices',
  },
} as const;
