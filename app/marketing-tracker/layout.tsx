import type { Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Marketing Tracker',
  description: 'Track marketing campaigns, products, and assets',
};

export default function MarketingTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
