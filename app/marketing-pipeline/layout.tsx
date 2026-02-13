import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Marketing Pipeline',
  description: 'Marketing pipeline board and management',
};

export default function MarketingPipelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
