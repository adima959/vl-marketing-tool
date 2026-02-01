'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { CRMUser } from '@/types/auth';
import { registerAuthErrorHandler } from '@/lib/api/authErrorHandler';

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
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  setAuthError: (hasError: boolean) => void;
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

    const returnUrl = encodeURIComponent(window.location.href);
    const redirectUrl = `${authConfig.loginUrl}?callback_url=${authConfig.callbackUrl}&returnUrl=${returnUrl}`;

    console.log('[Auth] Refreshing session, redirecting to:', redirectUrl);
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
        console.log('[AuthContext] Config response status:', res.status);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(config => {
        console.log('[AuthContext] Config loaded:', config);
        setAuthConfig(config);
      })
      .catch(error => {
        console.error('[AuthContext] Failed to load auth config:', error);
        // Set fallback config
        const fallbackConfig = {
          callbackUrl: `${window.location.origin}/api/auth/callback`,
          loginUrl: process.env.NEXT_PUBLIC_CRM_LOGIN_URL || 'https://vitaliv.no/admin/site/marketing',
        };
        console.log('[AuthContext] Using fallback config:', fallbackConfig);
        setAuthConfig(fallbackConfig);
      });
  }, []);

  // Register global auth error handler
  useEffect(() => {
    registerAuthErrorHandler(setAuthError);
  }, []);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isLoggingOut,
    authConfig,
    authError,
    checkAuth,
    logout,
    setAuthError,
    refreshSession,
  };

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
