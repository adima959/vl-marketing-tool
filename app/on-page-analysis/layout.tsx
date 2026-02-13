import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'On-Page Analysis',
  description: 'Analyze on-page behavior metrics and user engagement',
};

export default function OnPageAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
