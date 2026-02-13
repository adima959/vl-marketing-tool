import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Permissions',
};

export default function PermissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
