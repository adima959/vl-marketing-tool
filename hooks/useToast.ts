/**
 * Toast Hook
 * Convenience hook for showing toast notifications
 */

import { useToastStore, type ToastType } from '@/stores/toastStore';

export interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export function useToast() {
  const addToast = useToastStore((state) => state.addToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const clearAll = useToastStore((state) => state.clearAll);

  const showToast = (options: ToastOptions) => {
    return addToast(options);
  };

  // Convenience methods for common toast types
  const success = (title: string, message?: string, duration?: number) => {
    return showToast({ type: 'success', title, message, duration });
  };

  const error = (title: string, message?: string, duration?: number) => {
    return showToast({ type: 'error', title, message, duration });
  };

  const warning = (title: string, message?: string, duration?: number) => {
    return showToast({ type: 'warning', title, message, duration });
  };

  const info = (title: string, message?: string, duration?: number) => {
    return showToast({ type: 'info', title, message, duration });
  };

  return {
    showToast,
    success,
    error,
    warning,
    info,
    removeToast,
    clearAll,
  };
}
