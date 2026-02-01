'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from 'antd';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Full-page authentication error component
 * Shows when user session is invalid or expired
 * Provides option to refresh session and re-authenticate
 */
export function AuthErrorPage() {
  const { refreshSession } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Authentication Required
        </h1>

        <p className="text-gray-600 mb-6">
          Your session has expired or is invalid. Please refresh your session to continue using the dashboard.
        </p>

        <div className="space-y-3">
          <Button
            type="primary"
            size="large"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={refreshSession}
            block
          >
            Refresh Session
          </Button>

          <p className="text-sm text-gray-500">
            You will be redirected to log in again
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            If you continue to experience issues, please contact support or clear your browser cookies.
          </p>
        </div>
      </div>
    </div>
  );
}
