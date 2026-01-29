import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DASHBOARD_DEFAULT_VISIBLE_COLUMNS } from '@/config/dashboardColumns';

interface DashboardColumnState {
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  setVisibleColumns: (ids: string[]) => void;
  resetToDefaults: () => void;
}

/**
 * Migration helper - runs once on store initialization
 * Copies column settings from old 'new-orders-column-settings' key to new 'dashboard-column-settings' key
 */
const migrateFromOldKey = (): void => {
  if (typeof window === 'undefined') return;

  const oldKey = 'new-orders-column-settings';
  const newKey = 'dashboard-column-settings';

  const oldData = localStorage.getItem(oldKey);
  const newData = localStorage.getItem(newKey);

  // Only migrate if old exists and new doesn't
  if (oldData && !newData) {
    localStorage.setItem(newKey, oldData);
    console.log('✅ Migrated column settings: new-orders → dashboard');
  }
};

export const useDashboardColumnStore = create<DashboardColumnState>()(
  persist(
    (set, get) => {
      // Run migration on first access
      if (typeof window !== 'undefined') {
        migrateFromOldKey();
      }

      return {
        visibleColumns: DASHBOARD_DEFAULT_VISIBLE_COLUMNS,

        toggleColumn: (id) => {
          const { visibleColumns } = get();
          if (visibleColumns.includes(id)) {
            set({ visibleColumns: visibleColumns.filter((c) => c !== id) });
          } else {
            set({ visibleColumns: [...visibleColumns, id] });
          }
        },

        setVisibleColumns: (ids) => set({ visibleColumns: ids }),

        resetToDefaults: () => set({ visibleColumns: DASHBOARD_DEFAULT_VISIBLE_COLUMNS }),
      };
    },
    {
      name: 'dashboard-column-settings',
      version: 1,
      migrate: (persistedState: any) => {
        const currentColumns = persistedState?.visibleColumns || [];
        const validColumns = currentColumns.filter((col: string) =>
          DASHBOARD_DEFAULT_VISIBLE_COLUMNS.includes(col)
        );
        const newColumns = DASHBOARD_DEFAULT_VISIBLE_COLUMNS.filter(
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
