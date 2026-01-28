import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NEW_ORDERS_DEFAULT_VISIBLE_COLUMNS } from '@/config/newOrdersColumns';

interface NewOrdersColumnState {
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  setVisibleColumns: (ids: string[]) => void;
  resetToDefaults: () => void;
}

export const useNewOrdersColumnStore = create<NewOrdersColumnState>()(
  persist(
    (set, get) => ({
      visibleColumns: NEW_ORDERS_DEFAULT_VISIBLE_COLUMNS,

      toggleColumn: (id) => {
        const { visibleColumns } = get();
        if (visibleColumns.includes(id)) {
          set({ visibleColumns: visibleColumns.filter((c) => c !== id) });
        } else {
          set({ visibleColumns: [...visibleColumns, id] });
        }
      },

      setVisibleColumns: (ids) => set({ visibleColumns: ids }),

      resetToDefaults: () => set({ visibleColumns: NEW_ORDERS_DEFAULT_VISIBLE_COLUMNS }),
    }),
    {
      name: 'new-orders-column-settings',
      version: 1,
      migrate: (persistedState: any) => {
        const currentColumns = persistedState?.visibleColumns || [];
        const validColumns = currentColumns.filter((col: string) =>
          NEW_ORDERS_DEFAULT_VISIBLE_COLUMNS.includes(col)
        );
        const newColumns = NEW_ORDERS_DEFAULT_VISIBLE_COLUMNS.filter(
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
