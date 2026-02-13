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
import { checkAuthError, fetchApi, handleStoreError } from '@/lib/api/errorHandler';

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

/** Shared helper: refresh detail panel if open, then reload board */
function refreshAfterMutation(get: () => PipelineState, messageId?: string): void {
  const msgId = messageId ?? get().selectedMessageId;
  if (msgId) get().selectMessage(msgId);
  get().loadPipeline();
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

  loadPipeline: async () => {
    set({ isLoading: true });
    try {
      const { cards, summary, users, products, angles } = await fetchApi(buildBoardUrl(get()));
      set({ stages: groupByStage(cards), summary, users, products, angles, isLoading: false });
    } catch (error) {
      handleStoreError('load pipeline', error);
      set({ isLoading: false });
    }
  },

  moveMessage: async (messageId, targetStage, verdictType, verdictNotes) => {
    const isSimpleMove = !verdictType;
    const prevStages = get().stages;

    // Optimistic update for simple stage moves (arrow clicks)
    if (isSimpleMove) {
      let sourceStage: PipelineStage | null = null;
      let card: PipelineCard | null = null;

      for (const [stage, cards] of Object.entries(prevStages) as [PipelineStage, PipelineCard[]][]) {
        const found = cards.find(c => c.id === messageId);
        if (found) { sourceStage = stage; card = found; break; }
      }

      if (sourceStage && card && sourceStage !== targetStage) {
        const newStages = { ...prevStages };
        newStages[sourceStage] = prevStages[sourceStage].filter(c => c.id !== messageId);
        newStages[targetStage] = [...prevStages[targetStage], { ...card, pipelineStage: targetStage }];
        set({ stages: newStages });
      }
    }

    try {
      const res = await fetch(`/api/marketing-pipeline/messages/${messageId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStage, verdictType, verdictNotes }),
      });
      checkAuthError(res);
      const json = await res.json();
      if (!json.success) {
        handleStoreError('move message', new Error(json.error || 'Move failed'));
        if (isSimpleMove) set({ stages: prevStages });
        return;
      }

      // Complex moves (verdict/iterate) or server-created entities need full refresh
      if (!isSimpleMove || json.data?.newMessageId) {
        get().loadPipeline();
      }

      // If panel is open for this message, refresh it
      const { selectedMessageId } = get();
      if (selectedMessageId === messageId) {
        if (json.data?.newMessageId) {
          get().selectMessage(json.data.newMessageId);
        } else {
          get().selectMessage(messageId);
        }
      }
    } catch (error) {
      handleStoreError('move message', error);
      if (isSimpleMove) set({ stages: prevStages });
    }
  },

  selectMessage: async (messageId) => {
    try {
      const [detailRes, historyRes] = await Promise.all([
        fetch(`/api/marketing-pipeline/messages/${messageId}`),
        fetch(`/api/marketing-pipeline/history?entityType=pipeline_message&entityId=${messageId}`),
      ]);
      checkAuthError(detailRes);
      checkAuthError(historyRes);
      const detailJson = await detailRes.json();
      const historyJson = await historyRes.json();

      if (!detailJson.success) {
        handleStoreError('select message', new Error(detailJson.error || 'Failed to fetch message detail'));
        return;
      }

      set({
        selectedMessageId: messageId,
        selectedMessage: detailJson.data,
        messageHistory: historyJson.success ? historyJson.data : [],
        isPanelOpen: true,
      });
    } catch (error) {
      handleStoreError('select message', error);
    }
  },

  closePanel: () => {
    set({ selectedMessageId: null, selectedMessage: null, messageHistory: [], isPanelOpen: false });
  },

  updateMessageField: async (messageId, field, value) => {
    try {
      const data = await fetchApi(`/api/marketing-pipeline/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (get().selectedMessageId === messageId) set({ selectedMessage: data });
      get().loadPipeline();
    } catch (error) {
      handleStoreError('update message field', error);
    }
  },

  createMessage: async (data) => {
    try {
      await fetchApi('/api/marketing-pipeline/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      get().loadPipeline();
    } catch (error) {
      handleStoreError('create message', error);
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await fetchApi(`/api/marketing-pipeline/messages/${messageId}`, { method: 'DELETE' });
      if (get().selectedMessageId === messageId) get().closePanel();
      get().loadPipeline();
    } catch (error) {
      handleStoreError('delete message', error);
    }
  },

  createAngle: async (data) => {
    try {
      const result = await fetchApi<{ id: string }>('/api/marketing-pipeline/angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { id: result.id };
    } catch (error) {
      handleStoreError('create angle', error);
      return null;
    }
  },

  deleteAngle: async (angleId) => {
    try {
      const res = await fetch(`/api/marketing-pipeline/angles/${angleId}`, {
        method: 'DELETE',
      });
      checkAuthError(res);
      const json = await res.json();
      if (!json.success) {
        return { success: false, error: json.error };
      }
      set({ angles: get().angles.filter(a => a.id !== angleId) });
      return { success: true };
    } catch (error) {
      handleStoreError('delete angle', error);
      return { success: false, error: 'Failed to delete angle' };
    }
  },

  addCampaign: async (messageId, data) => {
    try {
      await fetchApi('/api/marketing-pipeline/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      refreshAfterMutation(get, messageId);
    } catch (error) {
      handleStoreError('add campaign', error);
    }
  },

  updateCampaign: async (campaignId, data) => {
    try {
      await fetchApi(`/api/marketing-pipeline/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      refreshAfterMutation(get);
    } catch (error) {
      handleStoreError('update campaign', error);
    }
  },

  deleteCampaign: async (campaignId) => {
    try {
      await fetchApi(`/api/marketing-pipeline/campaigns/${campaignId}`, { method: 'DELETE' });
      refreshAfterMutation(get);
    } catch (error) {
      handleStoreError('delete campaign', error);
    }
  },

  addAsset: async (messageId, data) => {
    try {
      await fetchApi('/api/marketing-pipeline/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      const msgId = messageId ?? get().selectedMessageId;
      if (msgId) get().selectMessage(msgId);
    } catch (error) {
      handleStoreError('add asset', error);
    }
  },

  deleteAsset: async (assetId) => {
    try {
      await fetchApi(`/api/marketing-pipeline/assets/${assetId}`, { method: 'DELETE' });
      const { selectedMessageId } = get();
      if (selectedMessageId) get().selectMessage(selectedMessageId);
    } catch (error) {
      handleStoreError('delete asset', error);
    }
  },

  addCreative: async (messageId, data) => {
    try {
      await fetchApi('/api/marketing-pipeline/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      const msgId = messageId ?? get().selectedMessageId;
      if (msgId) get().selectMessage(msgId);
    } catch (error) {
      handleStoreError('add creative', error);
    }
  },

  deleteCreative: async (creativeId) => {
    try {
      await fetchApi(`/api/marketing-pipeline/creatives/${creativeId}`, { method: 'DELETE' });
      const { selectedMessageId } = get();
      if (selectedMessageId) get().selectMessage(selectedMessageId);
    } catch (error) {
      handleStoreError('delete creative', error);
    }
  },

  addGeo: async (messageId, data) => {
    try {
      await fetchApi('/api/marketing-pipeline/geos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      refreshAfterMutation(get, messageId);
    } catch (error) {
      handleStoreError('add geo', error);
    }
  },

  updateGeoStage: async (geoId, data) => {
    try {
      await fetchApi(`/api/marketing-pipeline/geos/${geoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      refreshAfterMutation(get);
    } catch (error) {
      handleStoreError('update geo stage', error);
    }
  },

  removeGeo: async (geoId) => {
    try {
      await fetchApi(`/api/marketing-pipeline/geos/${geoId}`, { method: 'DELETE' });
      refreshAfterMutation(get);
    } catch (error) {
      handleStoreError('remove geo', error);
    }
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
      await fetchApi(`/api/marketing-pipeline/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      set({ products: get().products.map(p => p.id === productId ? { ...p, [field]: value } : p) });
      refreshAfterMutation(get);
    } catch (error) {
      handleStoreError('update product field', error);
    }
  },
}));
