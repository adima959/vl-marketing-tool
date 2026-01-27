import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Marketing Report | Vitaliv Analytics',
  description: 'Marketing campaign performance and analytics',
};

export default function MarketingReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
