import { create } from 'zustand';
import type {
  Product,
  MainAngle,
  SubAngle,
  Asset,
  ProductWithStats,
  TrackerUser,
  AngleStatus,
  Geography,
} from '@/types';
import {
  getProductsWithStats,
  getMainAnglesForProduct,
  getSubAnglesForMainAngle,
  getAssetsForSubAngle,
  getProductById,
  getMainAngleById,
  getSubAngleById,
  DUMMY_USERS,
} from '@/lib/marketing-tracker/dummy-data';

interface MarketingTrackerState {
  // Data
  products: ProductWithStats[];
  users: TrackerUser[];
  currentProduct: Product | null;
  currentMainAngle: MainAngle | null;
  currentSubAngle: SubAngle | null;
  mainAngles: MainAngle[];
  subAngles: SubAngle[];
  assets: Asset[];

  // Filters
  statusFilter: AngleStatus | 'all';
  geoFilter: Geography | 'all';
  searchQuery: string;
  ownerFilter: string | 'all';

  // UI State
  isLoading: boolean;
  error: string | null;

  // Actions - Data Loading
  loadDashboard: () => Promise<void>;
  loadProduct: (productId: string) => Promise<void>;
  loadMainAngle: (angleId: string) => Promise<void>;
  loadSubAngle: (subAngleId: string) => Promise<void>;

  // Actions - Filters
  setStatusFilter: (status: AngleStatus | 'all') => void;
  setGeoFilter: (geo: Geography | 'all') => void;
  setSearchQuery: (query: string) => void;
  setOwnerFilter: (ownerId: string | 'all') => void;

  // Actions - Status Updates
  updateMainAngleStatus: (angleId: string, status: AngleStatus) => void;
  updateSubAngleStatus: (subAngleId: string, status: AngleStatus) => void;

  // Computed
  getFilteredProducts: () => ProductWithStats[];
  getFilteredMainAngles: () => MainAngle[];
  getFilteredAssets: () => Asset[];
}

export const useMarketingTrackerStore = create<MarketingTrackerState>((set, get) => ({
  // Initial data state
  products: [],
  users: [],
  currentProduct: null,
  currentMainAngle: null,
  currentSubAngle: null,
  mainAngles: [],
  subAngles: [],
  assets: [],

  // Initial filter state
  statusFilter: 'all',
  geoFilter: 'all',
  searchQuery: '',
  ownerFilter: 'all',

  // Initial UI state
  isLoading: false,
  error: null,

  // Data Loading Actions
  loadDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 300));
      const products = getProductsWithStats();
      set({ products, users: DUMMY_USERS, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to load dashboard', isLoading: false });
    }
  },

  loadProduct: async (productId: string) => {
    set({ isLoading: true, error: null });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const product = getProductById(productId);
      const mainAngles = getMainAnglesForProduct(productId);
      if (!product) {
        throw new Error('Product not found');
      }
      set({
        currentProduct: product,
        mainAngles,
        currentMainAngle: null,
        currentSubAngle: null,
        subAngles: [],
        assets: [],
        isLoading: false,
      });
    } catch (error) {
      set({ error: 'Failed to load product', isLoading: false });
    }
  },

  loadMainAngle: async (angleId: string) => {
    set({ isLoading: true, error: null });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const mainAngle = getMainAngleById(angleId);
      const subAngles = getSubAnglesForMainAngle(angleId);
      if (!mainAngle) {
        throw new Error('Angle not found');
      }
      // Also load the product for breadcrumb
      const product = getProductById(mainAngle.productId);
      set({
        currentMainAngle: mainAngle,
        currentProduct: product || null,
        subAngles,
        currentSubAngle: null,
        assets: [],
        isLoading: false,
      });
    } catch (error) {
      set({ error: 'Failed to load angle', isLoading: false });
    }
  },

  loadSubAngle: async (subAngleId: string) => {
    set({ isLoading: true, error: null });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const subAngle = getSubAngleById(subAngleId);
      const assets = getAssetsForSubAngle(subAngleId);
      if (!subAngle) {
        throw new Error('Sub-angle not found');
      }
      // Also load parent angle and product for breadcrumb
      const mainAngle = getMainAngleById(subAngle.mainAngleId);
      const product = mainAngle ? getProductById(mainAngle.productId) : null;
      set({
        currentSubAngle: subAngle,
        currentMainAngle: mainAngle || null,
        currentProduct: product || null,
        assets,
        isLoading: false,
      });
    } catch (error) {
      set({ error: 'Failed to load sub-angle', isLoading: false });
    }
  },

  // Filter Actions
  setStatusFilter: (status) => set({ statusFilter: status }),
  setGeoFilter: (geo) => set({ geoFilter: geo }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setOwnerFilter: (ownerId) => set({ ownerFilter: ownerId }),

  // Status Update Actions
  updateMainAngleStatus: (angleId: string, status: AngleStatus) => {
    set((state) => ({
      mainAngles: state.mainAngles.map((angle) =>
        angle.id === angleId
          ? {
              ...angle,
              status,
              launchedAt: status === 'live' && !angle.launchedAt ? new Date().toISOString() : angle.launchedAt,
            }
          : angle
      ),
      currentMainAngle:
        state.currentMainAngle?.id === angleId
          ? {
              ...state.currentMainAngle,
              status,
              launchedAt:
                status === 'live' && !state.currentMainAngle.launchedAt
                  ? new Date().toISOString()
                  : state.currentMainAngle.launchedAt,
            }
          : state.currentMainAngle,
    }));
  },

  updateSubAngleStatus: (subAngleId: string, status: AngleStatus) => {
    set((state) => ({
      subAngles: state.subAngles.map((subAngle) =>
        subAngle.id === subAngleId
          ? {
              ...subAngle,
              status,
              launchedAt: status === 'live' && !subAngle.launchedAt ? new Date().toISOString() : subAngle.launchedAt,
            }
          : subAngle
      ),
      currentSubAngle:
        state.currentSubAngle?.id === subAngleId
          ? {
              ...state.currentSubAngle,
              status,
              launchedAt:
                status === 'live' && !state.currentSubAngle.launchedAt
                  ? new Date().toISOString()
                  : state.currentSubAngle.launchedAt,
            }
          : state.currentSubAngle,
    }));
  },

  // Computed getters
  getFilteredProducts: () => {
    const { products, searchQuery, ownerFilter } = get();
    return products.filter((product) => {
      const matchesSearch = searchQuery === '' || product.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesOwner = ownerFilter === 'all' || product.ownerId === ownerFilter;
      return matchesSearch && matchesOwner;
    });
  },

  getFilteredMainAngles: () => {
    const { mainAngles, statusFilter, searchQuery } = get();
    return mainAngles.filter((angle) => {
      const matchesStatus = statusFilter === 'all' || angle.status === statusFilter;
      const matchesSearch = searchQuery === '' || angle.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  },

  getFilteredAssets: () => {
    const { assets, geoFilter } = get();
    return assets.filter((asset) => {
      return geoFilter === 'all' || asset.geo === geoFilter;
    });
  },
}));
