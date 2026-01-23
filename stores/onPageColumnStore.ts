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
    }
  )
);
