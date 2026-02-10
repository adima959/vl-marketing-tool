import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

const METADATA_MAP: Record<string, { title: string; description: string }> = {
  'approval-rate': {
    title: 'Approval Rate | Vitaliv Analytics',
    description: 'Approval rate analysis across dimensions and time periods',
  },
  'buy-rate': {
    title: 'Buy Rate | Vitaliv Analytics',
    description: 'Buy rate analysis across dimensions and time periods',
  },
  'pay-rate': {
    title: 'Pay Rate | Vitaliv Analytics',
    description: 'Pay rate analysis across dimensions and time periods',
  },
};

export async function generateMetadata({
  params,
}: {
  params: { type: string };
}): Promise<Metadata> {
  const metadata = METADATA_MAP[params.type];

  if (!metadata) {
    notFound();
  }

  return metadata;
}

export default function ValidationReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
