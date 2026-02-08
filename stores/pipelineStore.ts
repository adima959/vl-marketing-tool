import { create } from 'zustand';
import type {
  PipelineStage,
  PipelineCard,
  PipelineSummary,
  Product,
  Angle,
  TrackerUser,
  Campaign,
  Channel,
  Geography,
  GeoStage,
  VerdictType,
  MessageDetail,
} from '@/types';
import { groupByStage } from '@/lib/marketing-pipeline/cpaUtils';

export interface HistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  action: string;
  changedBy: string;
  changedAt: string;
  changedByName?: string;
}

interface PipelineState {
  // Board data
  stages: Record<PipelineStage, PipelineCard[]>;
  summary: PipelineSummary;

  // Filter options
  users: TrackerUser[];
  products: Product[];
  angles: Angle[];

  // Active filters
  ownerFilter: string;
  productFilter: string;
  angleFilter: string;
  channelFilters: string[];
  geoFilters: string[];

  // Detail panel
  selectedMessageId: string | null;
  selectedMessage: MessageDetail | null;
  messageHistory: HistoryEntry[];
  isPanelOpen: boolean;

  // UI
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPipeline: () => void;
  moveMessage: (messageId: string, targetStage: PipelineStage, verdictType?: VerdictType, verdictNotes?: string) => void;
  selectMessage: (messageId: string) => void;
  closePanel: () => void;
  updateMessageField: (messageId: string, field: string, value: string | string[] | number) => void;
  createMessage: (data: { angleId: string; name: string; description?: string; pipelineStage?: string }) => void;
  deleteMessage: (messageId: string) => void;
  createAngle: (data: { productId: string; name: string; description?: string }) => Promise<{ id: string } | null>;
  deleteAngle: (angleId: string) => Promise<{ success: boolean; error?: string }>;
  addCampaign: (messageId: string, data: { channel: Channel; geo: Geography; externalId?: string; externalUrl?: string }) => void;
  updateCampaign: (campaignId: string, data: Partial<Campaign>) => void;
  deleteCampaign: (campaignId: string) => void;
  addAsset: (messageId: string, data: { geo: Geography; type: string; name: string; url?: string; content?: string; notes?: string }) => void;
  deleteAsset: (assetId: string) => void;
  addCreative: (messageId: string, data: { geo: Geography; name: string; format: string; cta?: string; url?: string; notes?: string }) => void;
  deleteCreative: (creativeId: string) => void;
  addGeo: (messageId: string, data: { geo: Geography; isPrimary?: boolean; spendThreshold?: number }) => void;
  updateGeoStage: (geoId: string, data: { stage?: GeoStage; spendThreshold?: number; notes?: string }) => void;
  removeGeo: (geoId: string) => void;
  setOwnerFilter: (value: string) => void;
  setProductFilter: (value: string) => void;
  setAngleFilter: (value: string) => void;
  toggleChannelFilter: (value: string) => void;
  toggleGeoFilter: (value: string) => void;
  updateProductField: (productId: string, field: string, value: string | number) => void;
}

const emptyStages: Record<PipelineStage, PipelineCard[]> = {
  backlog: [], production: [], testing: [], scaling: [], retired: [],
};

function buildBoardUrl(state: Pick<PipelineState, 'ownerFilter' | 'productFilter' | 'angleFilter' | 'channelFilters' | 'geoFilters'>): string {
  const params = new URLSearchParams();
  if (state.ownerFilter !== 'all') params.set('ownerId', state.ownerFilter);
  if (state.productFilter !== 'all') params.set('productId', state.productFilter);
  if (state.angleFilter !== 'all') params.set('angleId', state.angleFilter);
  if (state.channelFilters.length > 0) params.set('channels', state.channelFilters.join(','));
  if (state.geoFilters.length > 0) params.set('geos', state.geoFilters.join(','));
  const qs = params.toString();
  return `/api/marketing-pipeline/board${qs ? `?${qs}` : ''}`;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  stages: emptyStages,
  summary: { totalSpend: 0, scalingCount: 0, totalMessages: 0 },

  users: [],
  products: [],
  angles: [],

  ownerFilter: 'all',
  productFilter: 'all',
  angleFilter: 'all',
  channelFilters: [],
  geoFilters: [],

  selectedMessageId: null,
  selectedMessage: null,
  messageHistory: [],
  isPanelOpen: false,

  isLoading: false,
  error: null,

  loadPipeline: async () => {
    set({ isLoading: true, error: null });
    try {
      const url = buildBoardUrl(get());
      const res = await fetch(url);
      const json = await res.json();

      if (!json.success) {
        set({ error: json.error || 'Failed to load pipeline', isLoading: false });
        return;
      }

      const { cards, summary, users, products, angles } = json.data;
      const stages = groupByStage(cards);

      set({ stages, summary, users, products, angles, isLoading: false });
    } catch (err) {
      console.error('Failed to load pipeline:', err);
      set({ error: 'Failed to load pipeline', isLoading: false });
    }
  },

  moveMessage: async (messageId, targetStage, verdictType, verdictNotes) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/messages/${messageId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStage, verdictType, verdictNotes }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Move failed:', json.error);
        return;
      }

      // Refresh board
      get().loadPipeline();

      // If panel is open for this message, refresh it
      const { selectedMessageId } = get();
      if (selectedMessageId === messageId) {
        // For iterate, the original message is now retired. Show the new version if created.
        if (json.data?.newMessageId) {
          get().selectMessage(json.data.newMessageId);
        } else {
          get().selectMessage(messageId);
        }
      }
    } catch (err) {
      console.error('Failed to move message:', err);
    }
  },

  selectMessage: async (messageId) => {
    try {
      const [detailRes, historyRes] = await Promise.all([
        fetch(`/api/marketing-pipeline/messages/${messageId}`),
        fetch(`/api/marketing-pipeline/history?entityType=pipeline_message&entityId=${messageId}`),
      ]);
      const detailJson = await detailRes.json();
      const historyJson = await historyRes.json();

      if (!detailJson.success) {
        console.error('Failed to fetch message detail:', detailJson.error);
        return;
      }

      set({
        selectedMessageId: messageId,
        selectedMessage: detailJson.data,
        messageHistory: historyJson.success ? historyJson.data : [],
        isPanelOpen: true,
      });
    } catch (err) {
      console.error('Failed to select message:', err);
    }
  },

  closePanel: () => {
    set({ selectedMessageId: null, selectedMessage: null, messageHistory: [], isPanelOpen: false });
  },

  updateMessageField: async (messageId, field, value) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Update failed:', json.error);
        return;
      }

      // Update panel with fresh data
      if (get().selectedMessageId === messageId) {
        set({ selectedMessage: json.data });
      }

      // Refresh board (name changes affect cards)
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to update message field:', err);
    }
  },

  createMessage: async (data) => {
    try {
      const res = await fetch('/api/marketing-pipeline/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Create message failed:', json.error);
        return;
      }
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to create message:', err);
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/messages/${messageId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Delete message failed:', json.error);
        return;
      }
      // Close panel if this message was open
      if (get().selectedMessageId === messageId) {
        get().closePanel();
      }
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  },

  createAngle: async (data) => {
    try {
      const res = await fetch('/api/marketing-pipeline/angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Create angle failed:', json.error);
        return null;
      }
      return { id: json.data.id };
    } catch (err) {
      console.error('Failed to create angle:', err);
      return null;
    }
  },

  deleteAngle: async (angleId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/angles/${angleId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) {
        return { success: false, error: json.error };
      }
      // Remove from local state
      const angles = get().angles.filter(a => a.id !== angleId);
      set({ angles });
      return { success: true };
    } catch (err) {
      console.error('Failed to delete angle:', err);
      return { success: false, error: 'Failed to delete angle' };
    }
  },

  addCampaign: async (messageId, data) => {
    try {
      const res = await fetch('/api/marketing-pipeline/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Add campaign failed:', json.error);
        return;
      }

      // Refresh panel and board
      if (get().selectedMessageId === messageId) {
        get().selectMessage(messageId);
      }
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to add campaign:', err);
    }
  },

  updateCampaign: async (campaignId, data) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Update campaign failed:', json.error);
        return;
      }

      // Refresh panel and board
      const { selectedMessageId } = get();
      if (selectedMessageId) {
        get().selectMessage(selectedMessageId);
      }
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to update campaign:', err);
    }
  },

  deleteCampaign: async (campaignId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Delete campaign failed:', json.error);
        return;
      }

      // Refresh panel and board
      const { selectedMessageId } = get();
      if (selectedMessageId) {
        get().selectMessage(selectedMessageId);
      }
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  },

  addAsset: async (messageId, data) => {
    try {
      const res = await fetch('/api/marketing-pipeline/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      const json = await res.json();
      if (!json.success) { console.error('Add asset failed:', json.error); return; }
      if (get().selectedMessageId === messageId) get().selectMessage(messageId);
    } catch (err) { console.error('Failed to add asset:', err); }
  },

  deleteAsset: async (assetId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/assets/${assetId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) { console.error('Delete asset failed:', json.error); return; }
      const { selectedMessageId } = get();
      if (selectedMessageId) get().selectMessage(selectedMessageId);
    } catch (err) { console.error('Failed to delete asset:', err); }
  },

  addCreative: async (messageId, data) => {
    try {
      const res = await fetch('/api/marketing-pipeline/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      const json = await res.json();
      if (!json.success) { console.error('Add creative failed:', json.error); return; }
      if (get().selectedMessageId === messageId) get().selectMessage(messageId);
    } catch (err) { console.error('Failed to add creative:', err); }
  },

  deleteCreative: async (creativeId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/creatives/${creativeId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) { console.error('Delete creative failed:', json.error); return; }
      const { selectedMessageId } = get();
      if (selectedMessageId) get().selectMessage(selectedMessageId);
    } catch (err) { console.error('Failed to delete creative:', err); }
  },

  addGeo: async (messageId, data) => {
    try {
      const res = await fetch('/api/marketing-pipeline/geos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      const json = await res.json();
      if (!json.success) { console.error('Add geo failed:', json.error); return; }
      if (get().selectedMessageId === messageId) get().selectMessage(messageId);
      get().loadPipeline();
    } catch (err) { console.error('Failed to add geo:', err); }
  },

  updateGeoStage: async (geoId, data) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/geos/${geoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) { console.error('Update geo failed:', json.error); return; }
      const { selectedMessageId } = get();
      if (selectedMessageId) get().selectMessage(selectedMessageId);
      get().loadPipeline();
    } catch (err) { console.error('Failed to update geo:', err); }
  },

  removeGeo: async (geoId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/geos/${geoId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) { console.error('Remove geo failed:', json.error); return; }
      const { selectedMessageId } = get();
      if (selectedMessageId) get().selectMessage(selectedMessageId);
      get().loadPipeline();
    } catch (err) { console.error('Failed to remove geo:', err); }
  },

  setOwnerFilter: (value) => { set({ ownerFilter: value, productFilter: 'all', angleFilter: 'all' }); get().loadPipeline(); },
  setProductFilter: (value) => { set({ productFilter: value, angleFilter: 'all' }); get().loadPipeline(); },
  setAngleFilter: (value) => { set({ angleFilter: value }); get().loadPipeline(); },
  toggleChannelFilter: (value) => {
    const current = get().channelFilters;
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    set({ channelFilters: next });
    get().loadPipeline();
  },
  toggleGeoFilter: (value) => {
    const current = get().geoFilters;
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    set({ geoFilters: next });
    get().loadPipeline();
  },

  updateProductField: async (productId, field, value) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Update product failed:', json.error);
        return;
      }

      // Update products in state
      const products = get().products.map(p =>
        p.id === productId ? { ...p, [field]: value } : p,
      );
      set({ products });

      // Refresh pipeline (CPA targets affect card colors)
      get().loadPipeline();
    } catch (err) {
      console.error('Failed to update product field:', err);
    }
  },
}));
