import type { Metadata } from 'next';
import ProductListClientPage from './ProductListClientPage';

export const metadata: Metadata = {
  title: 'Marketing Tracker | Vitaliv Analytics',
  description: 'Manage marketing products, angles, and messaging',
};

export default function MarketingTrackerDashboard() {
  return <ProductListClientPage />;
}
