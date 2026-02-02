import { create } from 'zustand';
import type {
  Product,
  Angle,
  Message,
  Creative,
  Asset,
  ProductWithStats,
  TrackerUser,
  AngleStatus,
  Geography,
} from '@/types';

// Activity record from history API
export interface ActivityRecord {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  action: string;
  changedBy: string | null;
  changedAt: string;
}

// Helper to fetch users from API
async function fetchUsers(): Promise<TrackerUser[]> {
  try {
    const response = await fetch('/api/marketing-tracker/users');
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    return [];
  } catch {
    return [];
  }
}

// Helper to fetch recent activity from API
async function fetchRecentActivity(limit: number = 10): Promise<ActivityRecord[]> {
  try {
    const response = await fetch(`/api/marketing-tracker/history?limit=${limit}`);
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    return [];
  } catch {
    return [];
  }
}

interface MarketingTrackerState {
  // Data
  products: ProductWithStats[];
  users: TrackerUser[];
  currentProduct: Product | null;
  currentAngle: Angle | null;
  currentMessage: Message | null;
  angles: Angle[];
  messages: Message[];
  assets: Asset[];
  creatives: Creative[];
  recentActivity: ActivityRecord[];

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
  loadAngle: (angleId: string) => Promise<void>;
  loadMessage: (messageId: string) => Promise<void>;
  loadUsers: () => Promise<void>;

  // Actions - Filters
  setStatusFilter: (status: AngleStatus | 'all') => void;
  setGeoFilter: (geo: Geography | 'all') => void;
  setSearchQuery: (query: string) => void;
  setOwnerFilter: (ownerId: string | 'all') => void;

  // Actions - Status Updates
  updateAngleStatus: (angleId: string, status: AngleStatus) => Promise<void>;
  updateMessageStatus: (messageId: string, status: AngleStatus) => Promise<void>;

  // Actions - Inline Field Updates
  updateAngleField: (angleId: string, field: string, value: string) => Promise<void>;
  updateProductField: (productId: string, field: string, value: string) => Promise<void>;

  // Computed
  getFilteredProducts: () => ProductWithStats[];
  getFilteredAngles: () => Angle[];
  getFilteredAssets: () => Asset[];
  getFilteredCreatives: () => Creative[];
}

export const useMarketingTrackerStore = create<MarketingTrackerState>((set, get) => ({
  // Initial data state
  products: [],
  users: [],
  currentProduct: null,
  currentAngle: null,
  currentMessage: null,
  angles: [],
  messages: [],
  assets: [],
  creatives: [],
  recentActivity: [],

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
      // Fetch products and users in parallel (removed unused recentActivity fetch)
      const [productsResponse, users] = await Promise.all([
        fetch('/api/marketing-tracker/products'),
        fetchUsers(),
      ]);
      const productsData = await productsResponse.json();

      if (!productsData.success) {
        throw new Error(productsData.error || 'Failed to load dashboard');
      }

      set({
        products: productsData.data as ProductWithStats[],
        users,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard';
      set({ error: message, isLoading: false });
    }
  },

  loadProduct: async (productId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Fetch product and users in parallel
      const [productResponse, users] = await Promise.all([
        fetch(`/api/marketing-tracker/products/${productId}`),
        get().users.length === 0 ? fetchUsers() : Promise.resolve(get().users),
      ]);
      const data = await productResponse.json();

      if (!data.success) {
        throw new Error(data.error || 'Product not found');
      }

      set({
        currentProduct: data.data.product,
        angles: data.data.mainAngles || [],
        users: Array.isArray(users) ? users : get().users,
        currentAngle: null,
        currentMessage: null,
        messages: [],
        assets: [],
        creatives: [],
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load product';
      set({ error: message, isLoading: false });
    }
  },

  loadUsers: async () => {
    // Don't reload if we already have users
    if (get().users.length > 0) return;

    try {
      const users = await fetchUsers();
      set({ users });
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  },

  loadAngle: async (angleId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/marketing-tracker/angles/${angleId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Angle not found');
      }

      set({
        currentAngle: data.data.angle,
        currentProduct: data.data.product || null,
        messages: data.data.messages || [],
        currentMessage: null,
        assets: [],
        creatives: [],
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load angle';
      set({ error: message, isLoading: false });
    }
  },

  loadMessage: async (messageId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/marketing-tracker/messages/${messageId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Message not found');
      }

      set({
        currentMessage: data.data.message,
        currentAngle: data.data.angle || null,
        currentProduct: data.data.product || null,
        assets: data.data.assets || [],
        creatives: data.data.creatives || [],
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load message';
      set({ error: message, isLoading: false });
    }
  },

  // Filter Actions
  setStatusFilter: (status) => set({ statusFilter: status }),
  setGeoFilter: (geo) => set({ geoFilter: geo }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setOwnerFilter: (ownerId) => set({ ownerFilter: ownerId }),

  // Status Update Actions
  updateAngleStatus: async (angleId: string, status: AngleStatus) => {
    try {
      const response = await fetch(`/api/marketing-tracker/angles/${angleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update angle status');
      }

      const updatedAngle = data.data as Angle;

      // Update local state with the response from server
      set((state) => ({
        angles: state.angles.map((angle) =>
          angle.id === angleId ? updatedAngle : angle
        ),
        currentAngle:
          state.currentAngle?.id === angleId ? updatedAngle : state.currentAngle,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update angle status';
      set({ error: message });
    }
  },

  updateMessageStatus: async (messageId: string, status: AngleStatus) => {
    try {
      const response = await fetch(`/api/marketing-tracker/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update message status');
      }

      const updatedMessage = data.data as Message;

      // Update local state with the response from server
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === messageId ? updatedMessage : message
        ),
        currentMessage:
          state.currentMessage?.id === messageId ? updatedMessage : state.currentMessage,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update message status';
      set({ error: message });
    }
  },

  // Inline Field Update Actions
  updateAngleField: async (angleId: string, field: string, value: string) => {
    try {
      const response = await fetch(`/api/marketing-tracker/angles/${angleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update angle');
      }

      const updatedAngle = data.data as Angle;

      // Update local state
      set((state) => ({
        angles: state.angles.map((angle) =>
          angle.id === angleId ? updatedAngle : angle
        ),
        currentAngle:
          state.currentAngle?.id === angleId ? updatedAngle : state.currentAngle,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update angle';
      set({ error: message });
    }
  },

  updateProductField: async (productId: string, field: string, value: string) => {
    try {
      const response = await fetch(`/api/marketing-tracker/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update product');
      }

      const updatedProduct = data.data as Product;

      // Update local state
      set((state) => ({
        products: state.products.map((product) =>
          product.id === productId ? { ...product, ...updatedProduct } : product
        ),
        currentProduct:
          state.currentProduct?.id === productId ? updatedProduct : state.currentProduct,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update product';
      set({ error: message });
    }
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

  getFilteredAngles: () => {
    const { angles, statusFilter, searchQuery } = get();
    return angles.filter((angle) => {
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

  getFilteredCreatives: () => {
    const { creatives, geoFilter } = get();
    return creatives.filter((creative) => {
      return geoFilter === 'all' || creative.geo === geoFilter;
    });
  },
}));
