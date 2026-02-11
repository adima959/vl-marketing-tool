'use client';

import { AppError, ErrorCode } from '@/lib/types/errors';
import { Button } from 'antd';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorPageProps {
  error: AppError;
  onRetry?: () => void;
}

interface ErrorConfig {
  iconColor: string;
  iconBgColor: string;
  title: string;
  buttonText: string;
  buttonType: 'primary' | 'default';
  buttonDanger?: boolean;
}

/**
 * Get error configuration based on error code
 */
function getErrorConfig(code: ErrorCode): ErrorConfig {
  switch (code) {
    case ErrorCode.AUTH_ERROR:
      return {
        iconColor: 'text-green-600',
        iconBgColor: 'bg-green-50',
        title: 'Authentication Required',
        buttonText: 'Refresh Session',
        buttonType: 'primary',
      };

    case ErrorCode.TIMEOUT:
      return {
        iconColor: 'text-red-600',
        iconBgColor: 'bg-red-50',
        title: 'Request Timeout',
        buttonText: 'Try Again',
        buttonType: 'primary',
        buttonDanger: true,
      };

    case ErrorCode.DATABASE_ERROR:
      return {
        iconColor: 'text-red-600',
        iconBgColor: 'bg-red-50',
        title: 'Database Error',
        buttonText: 'Try Again',
        buttonType: 'primary',
        buttonDanger: true,
      };

    case ErrorCode.NETWORK_ERROR:
      return {
        iconColor: 'text-red-600',
        iconBgColor: 'bg-red-50',
        title: 'Connection Error',
        buttonText: 'Try Again',
        buttonType: 'primary',
        buttonDanger: true,
      };

    default:
      return {
        iconColor: 'text-red-600',
        iconBgColor: 'bg-red-50',
        title: 'Error',
        buttonText: 'Try Again',
        buttonType: 'primary',
        buttonDanger: true,
      };
  }
}

/**
 * Unified error page component
 * Displays full-page error with appropriate theming based on error.code
 * Used for all error types: auth, database, network, timeout, etc.
 */
export function ErrorPage({ error, onRetry }: ErrorPageProps) {
  const config = getErrorConfig(error.code);
  const handleRetry = onRetry || (() => window.location.reload());

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 ${config.iconBgColor} rounded-full flex items-center justify-center`}>
            <AlertCircle className={`w-8 h-8 ${config.iconColor}`} />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {config.title}
        </h1>

        <p className="text-gray-600 mb-6">
          {error.message}
        </p>

        <div className="space-y-3">
          <Button
            type={config.buttonType}
            danger={config.buttonDanger}
            size="large"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={handleRetry}
            block
          >
            {config.buttonText}
          </Button>

          <p className="text-sm text-gray-500">
            {error.code === ErrorCode.AUTH_ERROR
              ? 'You will be redirected to log in again'
              : 'Click the button above to retry your request'
            }
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            {error.code === ErrorCode.AUTH_ERROR
              ? 'If you continue to experience issues, please contact support or clear your browser cookies.'
              : 'If this problem persists, please contact support.'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
