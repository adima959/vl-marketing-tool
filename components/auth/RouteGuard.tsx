'use client';

import { useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Spin } from 'antd';
import { AuthErrorPage } from '@/components/auth/AuthErrorPage';

interface RouteGuardProps {
  children: ReactNode;
}

const PUBLIC_PATHS = ['/api/auth/callback', '/api/auth/logout'];

/**
 * Route guard component that protects pages from unauthenticated access
 * Redirects to CRM login if not authenticated
 */
export function RouteGuard({ children }: RouteGuardProps) {
  const { isAuthenticated, isLoading, isLoggingOut, authConfig, authError } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    // Skip check for public paths
    if (PUBLIC_PATHS.some(path => pathname?.startsWith(path))) {
      return;
    }

    // IMPORTANT: Skip redirect if we're logging out
    if (isLoggingOut) {
      return;
    }

    // Wait for auth config to load
    if (!authConfig) {
      return;
    }

    // If not loading and not authenticated, redirect to CRM login
    if (!isLoading && !isAuthenticated) {
      const returnUrl = encodeURIComponent(window.location.href);
      window.location.href = `${authConfig.loginUrl}?callback_url=${authConfig.callbackUrl}&returnUrl=${returnUrl}`;
    }
  }, [isAuthenticated, isLoading, isLoggingOut, pathname, authConfig]);

  // Show loading spinner while checking auth or logging out
  if (isLoading || isLoggingOut) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw'
      }}>
        <Spin size="large" tip={isLoggingOut ? "Logging out..." : "Loading..."}>
          <div style={{ padding: '50px' }} />
        </Spin>
      </div>
    );
  }

  // If auth error detected (401 from API), show error page
  if (authError) {
    return <AuthErrorPage />;
  }

  // If not authenticated, show nothing (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  // User is authenticated, render children
  return <>{children}</>;
}
