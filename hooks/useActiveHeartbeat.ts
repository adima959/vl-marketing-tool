'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const IDLE_TIMEOUT_MS = 60_000; // 60 seconds

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'] as const;

export function useActiveHeartbeat(): void {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lastActivityRef = useRef<number>(Date.now());
  const isVisibleRef = useRef<boolean>(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pathnameRef = useRef(pathname);
  const searchParamsRef = useRef(searchParams);

  // Keep refs in sync without triggering effects
  pathnameRef.current = pathname;
  searchParamsRef.current = searchParams;

  // Track user activity (ref-only, no re-renders)
  useEffect(() => {
    if (!isAuthenticated) return;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [isAuthenticated]);

  // Track tab visibility
  useEffect(() => {
    if (!isAuthenticated) return;

    const onVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
      if (isVisibleRef.current) {
        lastActivityRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated]);

  // Heartbeat interval — stable, reads latest page/params from refs
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const sendHeartbeat = async () => {
      if (cancelled) return;

      const now = Date.now();
      const isIdle = now - lastActivityRef.current > IDLE_TIMEOUT_MS;
      if (isIdle || !isVisibleRef.current) return;

      const params: Record<string, string> = {};
      searchParamsRef.current.forEach((value, key) => {
        params[key] = value;
      });

      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ page: pathnameRef.current, params }),
        });
      } catch {
        // Silently fail — heartbeat loss is not critical
      }
    };

    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated]);
}
