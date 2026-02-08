import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ON_PAGE_DEFAULT_VISIBLE_COLUMNS } from '@/config/onPageColumns';

interface OnPageColumnState {
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  setVisibleColumns: (ids: string[]) => void;
  resetToDefaults: () => void;
}

export const useOnPageColumnStore = create<OnPageColumnState>()(
  persist(
    (set, get) => ({
      visibleColumns: ON_PAGE_DEFAULT_VISIBLE_COLUMNS,

      toggleColumn: (id) => {
        const { visibleColumns } = get();
        if (visibleColumns.includes(id)) {
          set({ visibleColumns: visibleColumns.filter((c) => c !== id) });
        } else {
          set({ visibleColumns: [...visibleColumns, id] });
        }
      },

      setVisibleColumns: (ids) => set({ visibleColumns: ids }),

      resetToDefaults: () => set({ visibleColumns: ON_PAGE_DEFAULT_VISIBLE_COLUMNS }),
    }),
    {
      name: 'on-page-column-settings',
      version: 6, // Increment to reset stored settings
      migrate: (persistedState: any) => {
        // Auto-add new columns if they're missing, remove old ones
        const currentColumns = persistedState?.visibleColumns || [];
        const validColumns = currentColumns.filter((col: string) =>
          ON_PAGE_DEFAULT_VISIBLE_COLUMNS.includes(col)
        );
        const newColumns = ON_PAGE_DEFAULT_VISIBLE_COLUMNS.filter(
          (col) => !validColumns.includes(col)
        );
        return {
          ...persistedState,
          visibleColumns: [...validColumns, ...newColumns],
        };
      },
    }
  )
);
