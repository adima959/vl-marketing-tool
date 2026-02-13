import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Product Settings',
  description: 'Configure product CPA targets and settings',
};

export default function PipelineProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
