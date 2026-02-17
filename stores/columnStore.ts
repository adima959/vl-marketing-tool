import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_VISIBLE_COLUMNS } from '@/config/columns';

interface ColumnState {
  visibleColumns: string[];
  toggleColumn: (id: string) => void;
  setVisibleColumns: (ids: string[]) => void;
  resetToDefaults: () => void;
}

/**
 * Migration helper - runs once on store initialization
 * Imports column settings from legacy Dashboard-specific key if present
 */
const migrateDashboardSettings = (): void => {
  if (typeof window === 'undefined') return;

  const oldDashboardKey = 'dashboard-column-settings';
  const currentKey = 'column-settings';

  const oldData = localStorage.getItem(oldDashboardKey);
  const currentData = localStorage.getItem(currentKey);

  // Only migrate if old Dashboard settings exist and current settings don't
  if (oldData && !currentData) {
    try {
      const parsed = JSON.parse(oldData);
      // Copy the Dashboard settings to the shared store
      localStorage.setItem(currentKey, oldData);
      console.log('[Migration] Imported Dashboard column settings to shared store');
    } catch (e) {
      console.error('[Migration] Failed to parse Dashboard column settings:', e);
    }
  }
};

export const useColumnStore = create<ColumnState>()(
  persist(
    (set, get) => {
      // Run migration on first access
      if (typeof window !== 'undefined') {
        migrateDashboardSettings();
      }

      return {
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
      };
    },
    {
      name: 'column-settings',
      version: 5,
      migrate: (persistedState: any, version: number) => {
        let columns: string[] = persistedState?.visibleColumns || [];

        if (version < 5) {
          // v5: Reset CRM columns — only show subs, trials, approval %, real CPA, upsells by default
          // Remove all previous CRM columns, then add the new defaults
          const allCrm = [
            'customers', 'subscriptions', 'trials', 'onHold',
            'trialsApproved', 'approvalRate', 'realCpa',
            'ots', 'otsApprovalRate', 'upsellsApproved', 'upsellApprovalRate',
          ];
          columns = columns.filter((col) => !allCrm.includes(col));
          columns = [...columns, 'subscriptions', 'trials', 'approvalRate', 'realCpa', 'upsellsApproved'];
        }

        return { ...persistedState, visibleColumns: columns };
      },
    }
  )
);
