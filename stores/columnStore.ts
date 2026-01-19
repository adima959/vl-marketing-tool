import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_VISIBLE_COLUMNS } from '@/config/columns';

interface ColumnState {
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  setVisibleColumns: (ids: string[]) => void;
  resetToDefaults: () => void;
}

export const useColumnStore = create<ColumnState>()(
  persist(
    (set, get) => ({
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,

      toggleColumn: (id) => {
        const { visibleColumns } = get();
        if (visibleColumns.includes(id)) {
          set({ visibleColumns: visibleColumns.filter((c) => c !== id) });
        } else {
          set({ visibleColumns: [...visibleColumns, id] });
        }
      },

      setVisibleColumns: (ids) => set({ visibleColumns: ids }),

      resetToDefaults: () => set({ visibleColumns: DEFAULT_VISIBLE_COLUMNS }),
    }),
    {
      name: 'column-settings',
    }
  )
);
