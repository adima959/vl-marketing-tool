'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SubAngleRedirectClientPageProps {
  subAngleId: string;
}

/**
 * @deprecated This route has been renamed to /marketing-tracker/message/[messageId]
 * This page redirects to the new route for backwards compatibility.
 */
export default function SubAngleRedirectClientPage({ subAngleId }: SubAngleRedirectClientPageProps) {
  const router = useRouter();

  useEffect(() => {
    if (subAngleId) {
      // Redirect to the new message route
      router.replace(`/marketing-tracker/message/${subAngleId}`);
    }
  }, [subAngleId, router]);

  return null;
}
