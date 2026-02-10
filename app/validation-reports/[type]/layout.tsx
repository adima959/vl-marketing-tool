import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VALIDATION_REPORTS, type ValidationReportType } from '@/config/validationReports';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const config = VALIDATION_REPORTS[type as ValidationReportType];

  if (!config) {
    notFound();
  }

  return {
    title: config.title,
    description: config.description,
  };
}

export default function ValidationReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
