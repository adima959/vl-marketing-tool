import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pay Rate | Vitaliv Analytics',
  description: 'Pay rate analysis across dimensions and time periods',
};

export default function PayRateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
