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
  ProductStatus,
  Geography,
} from '@/types';
import { triggerError, checkAuthError } from '@/lib/api/errorHandler';
import { normalizeError } from '@/lib/types/errors';

// Activity record from history API
export interface ActivityRecord {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  oldValueDisplay: string | null;
  newValueDisplay: string | null;
  action: string;
  changedBy: string | null;
  changedByName: string | null;
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
  productStatusFilter: ProductStatus | 'all';

  // UI State
  isLoading: boolean;

  // Actions - Data Loading
  loadDashboard: () => Promise<void>;
  loadProduct: (productId: string) => Promise<void>;
  loadAngle: (angleId: string) => Promise<void>;
  loadMessage: (messageId: string) => Promise<void>;
  loadUsers: () => Promise<void>;

  // Actions - Filters
  setStatusFilter: (status: AngleStatus | 'all') => void;
  setGeoFilter: (geo: Geography | 'all') => void;
  setProductStatusFilter: (status: ProductStatus | 'all') => void;

  // Actions - Status Updates
  updateAngleStatus: (angleId: string, status: AngleStatus) => Promise<void>;
  updateMessageStatus: (messageId: string, status: AngleStatus) => Promise<void>;

  // Actions - Inline Field Updates
  updateAngleField: (angleId: string, field: string, value: string) => Promise<void>;
  updateProductField: (productId: string, field: string, value: string) => Promise<void>;
  updateMessageField: (messageId: string, field: string, value: string | string[]) => Promise<void>;

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
  productStatusFilter: 'active',

  // Initial UI state
  isLoading: false,

  // Data Loading Actions
  loadDashboard: async () => {
    const { productStatusFilter } = get();
    set({ isLoading: true });
    try {
      // Build URL with status filter
      const statusParam = productStatusFilter !== 'all' ? `?status=${productStatusFilter}` : '';

      // Fetch products and users in parallel
      const [productsResponse, users] = await Promise.all([
        fetch(`/api/marketing-tracker/products${statusParam}`),
        fetchUsers(),
      ]);
      checkAuthError(productsResponse);
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
      const appError = normalizeError(error);
      console.error('Failed to load dashboard:', appError);
      triggerError(appError);
      set({ isLoading: false });
    }
  },

  loadProduct: async (productId: string) => {
    set({ isLoading: true });
    try {
      // Fetch product and users in parallel
      const [productResponse, users] = await Promise.all([
        fetch(`/api/marketing-tracker/products/${productId}`),
        get().users.length === 0 ? fetchUsers() : Promise.resolve(get().users),
      ]);
      checkAuthError(productResponse);
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
      const appError = normalizeError(error);
      console.error('Failed to load product:', appError);
      triggerError(appError);
      set({ isLoading: false });
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
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/marketing-tracker/angles/${angleId}`);
      checkAuthError(response);
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
      const appError = normalizeError(error);
      console.error('Failed to load angle:', appError);
      triggerError(appError);
      set({ isLoading: false });
    }
  },

  loadMessage: async (messageId: string) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/marketing-tracker/messages/${messageId}`);
      checkAuthError(response);
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
      const appError = normalizeError(error);
      console.error('Failed to load message:', appError);
      triggerError(appError);
      set({ isLoading: false });
    }
  },

  // Filter Actions
  setStatusFilter: (status) => set({ statusFilter: status }),
  setGeoFilter: (geo) => set({ geoFilter: geo }),
  setProductStatusFilter: (status) => set({ productStatusFilter: status }),

  // Status Update Actions
  updateAngleStatus: async (angleId: string, status: AngleStatus) => {
    try {
      const response = await fetch(`/api/marketing-tracker/angles/${angleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      checkAuthError(response);
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
      const appError = normalizeError(error);
      console.error('Failed to update angle status:', appError);
      triggerError(appError);
    }
  },

  updateMessageStatus: async (messageId: string, status: AngleStatus) => {
    try {
      const response = await fetch(`/api/marketing-tracker/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      checkAuthError(response);
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
      const appError = normalizeError(error);
      console.error('Failed to update message status:', appError);
      triggerError(appError);
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
      checkAuthError(response);
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
      const appError = normalizeError(error);
      console.error('Failed to update angle:', appError);
      triggerError(appError);
    }
  },

  updateProductField: async (productId: string, field: string, value: string) => {
    try {
      const response = await fetch(`/api/marketing-tracker/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      checkAuthError(response);
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
      const appError = normalizeError(error);
      console.error('Failed to update product:', appError);
      triggerError(appError);
    }
  },

  updateMessageField: async (messageId: string, field: string, value: string | string[]) => {
    try {
      const response = await fetch(`/api/marketing-tracker/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      checkAuthError(response);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to update message');
      }

      const updatedMessage = data.data as Message;

      // Update local state
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === messageId ? updatedMessage : message
        ),
        currentMessage:
          state.currentMessage?.id === messageId
            ? { ...state.currentMessage, ...updatedMessage }
            : state.currentMessage,
      }));
    } catch (error) {
      const appError = normalizeError(error);
      console.error('Failed to update message:', appError);
      triggerError(appError);
    }
  },

  // Computed getters
  getFilteredProducts: () => {
    // Products are already filtered server-side by productStatusFilter
    // This getter returns the products as-is (filtering happens in loadDashboard)
    return get().products;
  },

  getFilteredAngles: () => {
    const { angles, statusFilter } = get();
    return angles.filter((angle) => {
      return statusFilter === 'all' || angle.status === statusFilter;
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
