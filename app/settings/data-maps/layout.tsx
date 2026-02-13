import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Maps',
};

export default function DataMapsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
