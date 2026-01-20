/**
 * Filter Preset Store
 * Manages saved filter configurations with persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DateRange } from '@/types';

export interface FilterPreset {
  id: string;
  name: string;
  dateRange: DateRange | null;
  dimensions: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  createdAt: number;
  isQuickAccess: boolean;
}

interface FilterPresetState {
  presets: FilterPreset[];
  addPreset: (preset: Omit<FilterPreset, 'id' | 'createdAt'>) => string;
  updatePreset: (id: string, updates: Partial<Omit<FilterPreset, 'id' | 'createdAt'>>) => void;
  deletePreset: (id: string) => void;
  toggleQuickAccess: (id: string) => void;
  getPreset: (id: string) => FilterPreset | undefined;
  getQuickAccessPresets: () => FilterPreset[];
}

export const useFilterPresetStore = create<FilterPresetState>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (preset) => {
        const id = `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newPreset: FilterPreset = {
          ...preset,
          id,
          createdAt: Date.now(),
        };

        set((state) => ({
          presets: [...state.presets, newPreset],
        }));

        return id;
      },

      updatePreset: (id, updates) => {
        set((state) => ({
          presets: state.presets.map((preset) =>
            preset.id === id ? { ...preset, ...updates } : preset
          ),
        }));
      },

      deletePreset: (id) => {
        set((state) => ({
          presets: state.presets.filter((preset) => preset.id !== id),
        }));
      },

      toggleQuickAccess: (id) => {
        set((state) => ({
          presets: state.presets.map((preset) =>
            preset.id === id
              ? { ...preset, isQuickAccess: !preset.isQuickAccess }
              : preset
          ),
        }));
      },

      getPreset: (id) => {
        return get().presets.find((preset) => preset.id === id);
      },

      getQuickAccessPresets: () => {
        return get().presets.filter((preset) => preset.isQuickAccess);
      },
    }),
    {
      name: 'filter-presets-storage',
      version: 1,
    }
  )
);
