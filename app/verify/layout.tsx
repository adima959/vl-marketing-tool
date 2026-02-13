import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify',
  description: 'Database verification and diagnostics',
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
