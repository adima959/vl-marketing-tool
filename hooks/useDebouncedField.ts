import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook for debounced field updates. Manages per-field timers so rapid edits
 * are batched into a single callback invocation after `delay` ms of idle time.
 *
 * Returns a stable `debouncedUpdate` function. Cleans up timers on unmount
 * and flushes any pending callbacks.
 */
export function useDebouncedField(
  callback: (field: string, value: string | string[] | unknown[]) => void,
  delay: number,
): (field: string, value: string | string[] | unknown[]) => void {
  const timers = useRef<Record<string, NodeJS.Timeout>>({});
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Flush pending timers on unmount
  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
    };
  }, []);

  const debouncedUpdate = useCallback((field: string, value: string | string[] | unknown[]) => {
    if (timers.current[field]) clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => {
      callbackRef.current(field, value);
    }, delay);
  }, [delay]);

  return debouncedUpdate;
}
