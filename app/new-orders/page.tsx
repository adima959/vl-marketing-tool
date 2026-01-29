'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewOrdersPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard (home page)
    router.replace('/');
  }, [router]);

  return null;
}
