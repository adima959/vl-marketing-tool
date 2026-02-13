import type { Metadata } from 'next';
import MessageClientPage from './MessageClientPage';

export async function generateMetadata({ params }: { params: Promise<{ messageId: string }> }): Promise<Metadata> {
  const { messageId } = await params;
  return {
    title: `Message ${messageId}`,
    description: 'Message hypothesis, assets, and creatives',
  };
}

export default async function MessagePage({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  return <MessageClientPage messageId={messageId} />;
}
