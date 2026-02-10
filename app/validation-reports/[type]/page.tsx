import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ValidationReportClient } from '@/components/validation-rate/ValidationReportClient';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { useBuyRateStore } from '@/stores/buyRateStore';
import { usePayRateStore } from '@/stores/payRateStore';
import { TrendingUp, ShoppingCart, CreditCard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UseBoundStore, StoreApi } from 'zustand';
import type { ValidationRateStore } from '@/types/validationRate';

type RateType = 'approval' | 'buy' | 'pay';

interface ValidationConfig {
  title: string;
  Icon: LucideIcon;
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
  urlParam: RateType;
  promptTitle: string;
  rateType?: RateType;
  modalRecordLabel?: string;
}

const VALIDATION_CONFIGS: Record<string, ValidationConfig> = {
  'approval-rate': {
    title: 'Approval Rate',
    Icon: TrendingUp,
    useStore: useApprovalRateStore,
    urlParam: 'approval',
    promptTitle: 'Ready to analyze approval rates?',
  },
  'buy-rate': {
    title: 'Buy Rate',
    Icon: ShoppingCart,
    useStore: useBuyRateStore,
    urlParam: 'buy',
    promptTitle: 'Ready to analyze buy rates?',
    rateType: 'buy',
    modalRecordLabel: 'Invoices',
  },
  'pay-rate': {
    title: 'Pay Rate',
    Icon: CreditCard,
    useStore: usePayRateStore,
    urlParam: 'pay',
    promptTitle: 'Ready to analyze pay rates?',
    rateType: 'pay',
    modalRecordLabel: 'Invoices',
  },
} as const;

export default function ValidationReportPage({ params }: { params: { type: string } }) {
  const config = VALIDATION_CONFIGS[params.type];

  if (!config) {
    notFound();
  }

  return (
    <Suspense fallback={<div />}>
      <ValidationReportClient type={params.type} config={config} />
    </Suspense>
  );
}
