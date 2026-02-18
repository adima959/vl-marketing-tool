import { useState, useCallback } from 'react';

/**
 * Hook for managing a Set<string> with toggle semantics.
 * Useful for expand/collapse state on lists (adsets, geos, ads, etc.).
 *
 * @returns [set, toggle] — the current Set and a stable toggle function.
 */
export function useToggleSet(initial?: Iterable<string>): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(() => new Set(initial));

  const toggle = useCallback((id: string) => {
    setSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return [set, toggle];
}
