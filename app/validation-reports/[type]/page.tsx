import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ValidationReportClient } from '@/components/validation-rate/ValidationReportClient';
import { VALIDATION_REPORT_TYPES } from '@/config/validationReports';

export default async function ValidationReportPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;

  if (!VALIDATION_REPORT_TYPES.includes(type as any)) {
    notFound();
  }

  return (
    <Suspense fallback={<div />}>
      <ValidationReportClient type={type} />
    </Suspense>
  );
}
