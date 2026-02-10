import type { Metadata } from 'next';
import AngleClientPage from './AngleClientPage';

export async function generateMetadata({ params }: { params: Promise<{ angleId: string }> }): Promise<Metadata> {
  const { angleId } = await params;
  return {
    title: `Angle ${angleId} | Vitaliv Analytics`,
    description: 'Angle details and messaging hypotheses',
  };
}

export default async function AnglePage({ params }: { params: Promise<{ angleId: string }> }) {
  const { angleId } = await params;
  return <AngleClientPage angleId={angleId} />;
}
