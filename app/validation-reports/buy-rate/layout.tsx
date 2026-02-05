import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Buy Rate | Vitaliv Analytics',
  description: 'Buy rate analysis across dimensions and time periods',
};

export default function BuyRateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
