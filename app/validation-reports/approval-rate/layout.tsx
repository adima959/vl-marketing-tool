import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Approval Rate | Vitaliv Analytics',
  description: 'Approval rate analysis across dimensions and time periods',
};

export default function ApprovalRateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
