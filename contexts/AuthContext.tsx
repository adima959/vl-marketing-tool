'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { CRMUser } from '@/types/auth';
import type { FeatureKey, PermissionAction } from '@/types/roles';
import { UserRole } from '@/types/user';
import { AppError, ErrorCode } from '@/lib/types/errors';
import { registerErrorHandler, clearError } from '@/lib/api/errorHandler';
import { ErrorPage } from '@/components/ErrorPage';

interface AuthConfig {
  callbackUrl: string;
  loginUrl: string;
}

interface AuthContextType {
  user: CRMUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  authConfig: AuthConfig | null;
  authError: boolean;
  appError: AppError | null;
  hasPermission: (featureKey: FeatureKey, action: PermissionAction) => boolean;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  setAuthError: (hasError: boolean) => void;
  setAppError: (error: AppError | null) => void;
  clearError: () => void;
  refreshSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<CRMUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authError, setAuthError] = useState(false);
  const [appError, setAppError] = useState<AppError | null>(null);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/validate', {
        credentials: 'same-origin',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setAuthError(false); // Clear auth error on successful validation
      } else {
        setUser(null);
        if (response.status === 401) {
          setAuthError(true);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSession = () => {
    // Clear auth error and redirect to CRM login with proper callback parameters
    setAuthError(false);

    if (!authConfig) {
      console.error('[Auth] Auth config not available for session refresh');
      return;
    }

    // Save current page so we can return after CRM login
    // (CRM may not forward returnUrl to the callback)
    sessionStorage.setItem('auth_return_url', window.location.href);

    const returnUrl = encodeURIComponent(window.location.href);
    const redirectUrl = `${authConfig.loginUrl}?callback_url=${authConfig.callbackUrl}&returnUrl=${returnUrl}`;

    window.location.href = redirectUrl;
  };

  const logout = async () => {
    setIsLoggingOut(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }

    // Always redirect to CRM base URL (not login page) to prevent auto-login
    const crmLogoutUrl = process.env.NEXT_PUBLIC_CRM_LOGOUT_URL || 'https://vitaliv.no/admin';
    window.location.href = crmLogoutUrl;
  };

  // Load auth config on mount
  useEffect(() => {
    fetch('/api/auth/config')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(config => {
        setAuthConfig(config);
      })
      .catch(error => {
        console.error('[AuthContext] Failed to load auth config:', error);
        // Set fallback config
        const fallbackConfig = {
          callbackUrl: `${window.location.origin}/api/auth/callback`,
          loginUrl: process.env.NEXT_PUBLIC_CRM_LOGIN_URL || 'https://vitaliv.no/admin/site/marketing',
        };
        setAuthConfig(fallbackConfig);
      });
  }, []);

  // Register global error handler (stores call triggerError for DB/network errors)
  useEffect(() => {
    registerErrorHandler(setAppError);
  }, []);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const hasPermission = useCallback(
    (featureKey: FeatureKey, action: PermissionAction): boolean => {
      if (!user) return false;
      if (user.role === UserRole.ADMIN) return true;
      const perm = user.permissions?.[featureKey];
      if (!perm) return false;
      return perm[action] ?? false;
    },
    [user]
  );

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isLoggingOut,
    authConfig,
    authError,
    appError,
    hasPermission,
    checkAuth,
    logout,
    setAuthError,
    setAppError,
    clearError,
    refreshSession,
  };

  // After successful auth, navigate back to the page the user was on before refresh
  useEffect(() => {
    if (!user) return;
    const returnUrl = sessionStorage.getItem('auth_return_url');
    if (!returnUrl) return;
    sessionStorage.removeItem('auth_return_url');

    // Only navigate if we're on a different page (e.g. landed on / after CRM callback)
    if (returnUrl !== window.location.href) {
      window.location.href = returnUrl;
    }
  }, [user]);

  // Render error page if auth error exists (fallback if auto-redirect didn't fire)
  if (authError) {
    const error: AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue using the dashboard.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    return (
      <AuthContext.Provider value={value}>
        <ErrorPage error={error} onRetry={refreshSession} />
      </AuthContext.Provider>
    );
  }

  // Render error page if any app error exists
  if (appError) {
    const isAuth = appError.code === ErrorCode.AUTH_ERROR;
    return (
      <AuthContext.Provider value={value}>
        <ErrorPage error={appError} onRetry={isAuth ? refreshSession : clearError} />
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
