import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SESSION_DEFAULT_VISIBLE_COLUMNS } from '@/config/sessionColumns';

interface SessionColumnState {
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  setVisibleColumns: (ids: string[]) => void;
  resetToDefaults: () => void;
}

export const useSessionColumnStore = create<SessionColumnState>()(
  persist(
    (set, get) => ({
      visibleColumns: SESSION_DEFAULT_VISIBLE_COLUMNS,

      toggleColumn: (id) => {
        const { visibleColumns } = get();
        if (visibleColumns.includes(id)) {
          set({ visibleColumns: visibleColumns.filter((c) => c !== id) });
        } else {
          set({ visibleColumns: [...visibleColumns, id] });
        }
      },

      setVisibleColumns: (ids) => set({ visibleColumns: ids }),

      resetToDefaults: () => set({ visibleColumns: SESSION_DEFAULT_VISIBLE_COLUMNS }),
    }),
    {
      name: 'session-column-settings',
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Record<string, unknown>;
        const currentColumns = (Array.isArray(state.visibleColumns) ? state.visibleColumns : []) as string[];
        const validColumns = currentColumns.filter((col) =>
          SESSION_DEFAULT_VISIBLE_COLUMNS.includes(col)
        );
        const newColumns = SESSION_DEFAULT_VISIBLE_COLUMNS.filter(
          (col) => !validColumns.includes(col)
        );
        return {
          ...state,
          visibleColumns: [...validColumns, ...newColumns],
        };
      },
    }
  )
);
