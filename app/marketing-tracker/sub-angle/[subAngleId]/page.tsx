import type { Metadata } from 'next';
import SubAngleRedirectClientPage from './SubAngleRedirectClientPage';

export async function generateMetadata({ params }: { params: Promise<{ subAngleId: string }> }): Promise<Metadata> {
  const { subAngleId } = await params;
  return {
    title: `Redirecting... | Vitaliv Analytics`,
    description: 'Redirecting to message page',
  };
}

/**
 * @deprecated This route has been renamed to /marketing-tracker/message/[messageId]
 * This page redirects to the new route for backwards compatibility.
 */
export default async function SubAngleRedirectPage({ params }: { params: Promise<{ subAngleId: string }> }) {
  const { subAngleId } = await params;
  return <SubAngleRedirectClientPage subAngleId={subAngleId} />;
}
