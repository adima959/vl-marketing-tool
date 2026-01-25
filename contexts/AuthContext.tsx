'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { CRMUser } from '@/types/auth';

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
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
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

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/validate', {
        credentials: 'same-origin',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
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
    checkAuth,
    logout,
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
