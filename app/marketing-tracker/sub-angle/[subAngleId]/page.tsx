'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * @deprecated This route has been renamed to /marketing-tracker/message/[messageId]
 * This page redirects to the new route for backwards compatibility.
 */
export default function SubAngleRedirectPage() {
  const params = useParams<{ subAngleId: string }>();
  const router = useRouter();
  const subAngleId = params.subAngleId;

  useEffect(() => {
    if (subAngleId) {
      // Redirect to the new message route
      router.replace(`/marketing-tracker/message/${subAngleId}`);
    }
  }, [subAngleId, router]);

  return null;
}
