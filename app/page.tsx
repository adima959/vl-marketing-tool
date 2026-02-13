import { Metadata } from 'next';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Main analytics dashboard',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
