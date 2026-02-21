import { create } from 'zustand';
import type {
  PipelineStage,
  PipelineCard,
  PipelineSummary,
  Product,
  Angle,
  PipelineUser,
  Asset,
  Creative,
  Campaign,
  CampaignPerformanceData,
  Channel,
  Geography,
  AssetType,
  CreativeFormat,
  GeoStage,
  VerdictType,
  MessageDetail,
} from '@/types';
import type { MessageGeo } from '@/types/marketing-pipeline';
import { groupByStage } from '@/lib/marketing-pipeline/cpaUtils';
import { checkAuthError, fetchApi, handleStoreError } from '@/lib/api/errorHandler';

/** Lightweight error handler for in-panel mutations — logs instead of replacing the page. */
function handleMutationError(label: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  console.error(`[pipeline] ${label}: ${msg}`);
}

export interface HistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  oldValueDisplay?: string | null;
  newValueDisplay?: string | null;
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
  users: PipelineUser[];
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
  detailTab: 'strategy' | 'activity';
  setDetailTab: (tab: 'strategy' | 'activity') => void;

  // Product detail panel
  isProductPanelOpen: boolean;
  selectedProductId: string | null;

  // Campaign performance (auto-fetched from ads + CRM + on-page)
  campaignPerformance: Record<string, CampaignPerformanceData>;
  campaignPerformanceLoading: boolean;

  // UI
  isLoading: boolean;
  _hasLoadedOnce: boolean;

  // Actions
  loadPipeline: () => void;
  moveMessage: (messageId: string, targetStage: PipelineStage, verdictType?: VerdictType, verdictNotes?: string) => void;

  selectMessage: (messageId: string) => void;
  refreshDetail: (messageId: string) => void;
  closePanel: () => void;
  updateMessageField: (messageId: string, field: string, value: string | string[] | number | unknown[]) => void;
  createMessage: (data: { angleId: string; name: string; description?: string; pipelineStage?: string }) => void;
  deleteMessage: (messageId: string) => void;
  createAngle: (data: { productId: string; name: string; description?: string }) => Promise<{ id: string } | null>;
  deleteAngle: (angleId: string) => Promise<{ success: boolean; error?: string }>;
  addCampaign: (messageId: string, data: { name?: string; channel: Channel; geo: Geography; externalId?: string; externalUrl?: string }) => void;
  updateCampaign: (campaignId: string, data: Partial<Campaign>) => void;
  deleteCampaign: (campaignId: string) => void;
  addGeo: (messageId: string, data: { geo: Geography; isPrimary?: boolean; spendThreshold?: number }) => void;
  updateGeoStage: (geoId: string, data: { stage?: GeoStage; spendThreshold?: number; notes?: string }) => void;
  removeGeo: (geoId: string) => void;
  addAsset: (messageId: string, data: { geo: Geography; type: AssetType; name: string; url?: string; content?: string; notes?: string }) => Promise<void>;
  addCreative: (messageId: string, data: { geo: Geography; name: string; format: CreativeFormat; cta?: string; url?: string; notes?: string }) => Promise<void>;
  setOwnerFilter: (value: string) => void;
  setProductFilter: (value: string) => void;
  setAngleFilter: (value: string) => void;
  toggleChannelFilter: (value: string) => void;
  toggleGeoFilter: (value: string) => void;
  updateProductField: (productId: string, field: string, value: string | number) => void;
  updateAngleField: (angleId: string, field: string, value: string) => void;
  fetchCampaignPerformance: (messageId: string, dateRange?: { start: string; end: string }) => void;
  openProductPanel: (productId: string) => void;
  closeProductPanel: () => void;
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

/** Shared helper: refresh detail panel if open, then reload board.
 *  Uses a silent refresh that doesn't reset the panel to loading state. */
function refreshAfterMutation(get: () => PipelineState, messageId?: string): void {
  const msgId = messageId ?? get().selectedMessageId;
  if (msgId) get().refreshDetail(msgId);
  get().loadPipeline();
}

/** Mutation generation counter — incremented before each detail-panel mutation.
 *  `refreshDetail` and `updateMessageField` only apply server data when the
 *  generation hasn't advanced since they started (i.e. no newer mutation is in-flight). */
let mutationGen = 0;

/** Optimistically patch the selectedMessage without waiting for the server. */
function optimisticPatch(
  get: () => PipelineState,
  set: (partial: Partial<PipelineState>) => void,
  patcher: (msg: MessageDetail) => MessageDetail,
): MessageDetail | null {
  const msg = get().selectedMessage;
  if (!msg) return null;
  const updated = patcher(msg);
  set({ selectedMessage: updated });
  return updated;
}

/** Module-level prefetch cache — stores in-flight or resolved fetch promises */
interface FetchResult { detail: MessageDetail; history: HistoryEntry[] }

function fetchMessageData(messageId: string): Promise<FetchResult> {
  return Promise.all([
    fetch(`/api/marketing-pipeline/messages/${messageId}`).then(r => r.json()),
    fetchHistory(messageId),
  ]).then(([detailJson, history]) => {
    if (!detailJson.success) throw new Error(detailJson.error || 'Failed to fetch message detail');
    return {
      detail: detailJson.data as MessageDetail,
      history,
    };
  });
}

function fetchHistory(messageId: string): Promise<HistoryEntry[]> {
  return fetch(`/api/marketing-pipeline/history?entityType=pipeline_message&entityId=${messageId}`)
    .then(r => r.json())
    .then(json => (json.success ? json.data : []) as HistoryEntry[]);
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
  detailTab: 'strategy',

  isProductPanelOpen: false,
  selectedProductId: null,

  campaignPerformance: {},
  campaignPerformanceLoading: false,

  isLoading: false,
  _hasLoadedOnce: false,

  loadPipeline: async () => {
    if (!get()._hasLoadedOnce) set({ isLoading: true });
    try {
      const { cards, summary, users, products, angles } = await fetchApi(buildBoardUrl(get()));
      set({ stages: groupByStage(cards), summary, users, products, angles, isLoading: false, _hasLoadedOnce: true });
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
    const isSameMessage = get().selectedMessageId === messageId;
    // When switching messages, show skeleton + reset tab. When refreshing same message, keep current state.
    // Mutual exclusion: close product panel when opening message panel
    set({
      selectedMessageId: messageId,
      ...(isSameMessage ? {} : { selectedMessage: null, messageHistory: [], detailTab: 'strategy' }),
      isPanelOpen: true,
      isProductPanelOpen: false,
      selectedProductId: null,
    });

    try {
      const result = await fetchMessageData(messageId);

      set({
        selectedMessage: result.detail,
        messageHistory: result.history,
      });
    } catch (error) {
      handleStoreError('select message', error);
      set({ isPanelOpen: false, selectedMessageId: null });
    }
  },

  refreshDetail: async (messageId) => {
    const gen = mutationGen;
    try {
      const result = await fetchMessageData(messageId);
      // Only apply if no newer mutation has started and we're still viewing this message
      if (gen === mutationGen && get().selectedMessageId === messageId) {
        set({ selectedMessage: result.detail, messageHistory: result.history });
      }
    } catch (error) {
      handleMutationError('refresh detail', error);
    }
  },

  setDetailTab: (tab) => {
    set({ detailTab: tab });
    // Refresh history when switching to Activity tab so latest entries are visible
    if (tab === 'activity') {
      const messageId = get().selectedMessageId;
      if (messageId) {
        fetchHistory(messageId).then(history => {
          if (get().selectedMessageId === messageId) set({ messageHistory: history });
        });
      }
    }
  },

  closePanel: () => {
    set({ selectedMessageId: null, selectedMessage: null, messageHistory: [], isPanelOpen: false, detailTab: 'strategy' });
  },

  updateMessageField: async (messageId, field, value) => {
    mutationGen++;
    const gen = mutationGen;
    try {
      const data = await fetchApi(`/api/marketing-pipeline/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      // Only apply if no newer mutation started while we were awaiting
      if (gen === mutationGen && get().selectedMessageId === messageId) {
        set({ selectedMessage: data });
        fetchHistory(messageId).then(history => {
          if (get().selectedMessageId === messageId) set({ messageHistory: history });
        });
      }
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
    mutationGen++;
    const tempCampaign: Campaign = {
      id: `temp-${Date.now()}`, messageId, name: data.name, channel: data.channel, geo: data.geo,
      externalId: data.externalId ?? '', externalUrl: data.externalUrl ?? '',
      cpa: 0, spend: 0, conversions: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, campaigns: [...msg.campaigns, tempCampaign],
    }));
    try {
      await fetchApi('/api/marketing-pipeline/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      refreshAfterMutation(get, messageId);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('add campaign', error);
    }
  },

  updateCampaign: async (campaignId, data) => {
    mutationGen++;
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, campaigns: msg.campaigns.map(c => c.id === campaignId ? { ...c, ...data, updatedAt: new Date().toISOString() } : c),
    }));
    try {
      await fetchApi(`/api/marketing-pipeline/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      refreshAfterMutation(get);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('update campaign', error);
    }
  },

  deleteCampaign: async (campaignId) => {
    mutationGen++;
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, campaigns: msg.campaigns.filter(c => c.id !== campaignId),
    }));
    try {
      await fetchApi(`/api/marketing-pipeline/campaigns/${campaignId}`, { method: 'DELETE' });
      refreshAfterMutation(get);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('delete campaign', error);
    }
  },

  addGeo: async (messageId, data) => {
    mutationGen++;
    const tempId = `temp-${Date.now()}`;
    const optimisticGeo: MessageGeo = {
      id: tempId, messageId, geo: data.geo,
      stage: 'setup', isPrimary: data.isPrimary ?? false,
      spendThreshold: data.spendThreshold ?? 0, notes: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, geos: [...msg.geos, optimisticGeo],
    }));
    try {
      await fetchApi('/api/marketing-pipeline/geos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      refreshAfterMutation(get, messageId);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('add geo', error);
    }
  },

  updateGeoStage: async (geoId, data) => {
    mutationGen++;
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, geos: msg.geos.map(g => g.id === geoId ? { ...g, ...data, updatedAt: new Date().toISOString() } : g),
    }));
    try {
      await fetchApi(`/api/marketing-pipeline/geos/${geoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      refreshAfterMutation(get);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('update geo stage', error);
    }
  },

  removeGeo: async (geoId) => {
    mutationGen++;
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, geos: msg.geos.filter(g => g.id !== geoId),
    }));
    try {
      await fetchApi(`/api/marketing-pipeline/geos/${geoId}`, { method: 'DELETE' });
      refreshAfterMutation(get);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('remove geo', error);
    }
  },

  addAsset: async (messageId, data) => {
    mutationGen++;
    const tempAsset: Asset = {
      id: `temp-${Date.now()}`, messageId, geo: data.geo, type: data.type, name: data.name,
      url: data.url, content: data.content, notes: data.notes,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, assets: [...(msg.assets ?? []), tempAsset],
    }));
    try {
      await fetchApi('/api/marketing-pipeline/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      refreshAfterMutation(get, messageId);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('add asset', error);
    }
  },

  addCreative: async (messageId, data) => {
    mutationGen++;
    const tempCreative: Creative = {
      id: `temp-${Date.now()}`, messageId, geo: data.geo, name: data.name, format: data.format,
      cta: data.cta, url: data.url, notes: data.notes,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const prev = optimisticPatch(get, set, msg => ({
      ...msg, creatives: [...(msg.creatives ?? []), tempCreative],
    }));
    try {
      await fetchApi('/api/marketing-pipeline/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...data }),
      });
      refreshAfterMutation(get, messageId);
    } catch (error) {
      if (prev) set({ selectedMessage: prev });
      handleMutationError('add creative', error);
    }
  },

  setOwnerFilter: (value) => {
    const { productFilter, products } = get();
    // Keep product selected if it belongs to the new owner (or no owner filter)
    const keepProduct = value === 'all' || (productFilter !== 'all' && products.find(p => p.id === productFilter)?.ownerId === value);
    set({
      ownerFilter: value,
      ...(!keepProduct && { productFilter: 'all', angleFilter: 'all' }),
    });
    get().loadPipeline();
  },
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

  fetchCampaignPerformance: async (messageId, dateRange) => {
    set({ campaignPerformanceLoading: true });
    try {
      const params = new URLSearchParams({ messageId });
      if (dateRange) {
        params.set('start', dateRange.start);
        params.set('end', dateRange.end);
      }
      const data = await fetchApi<Record<string, CampaignPerformanceData>>(
        `/api/marketing-pipeline/campaigns/performance?${params}`,
      );
      if (get().selectedMessageId === messageId) {
        set({ campaignPerformance: data, campaignPerformanceLoading: false });
      }
    } catch (error) {
      handleMutationError('fetch campaign performance', error);
      set({ campaignPerformanceLoading: false });
    }
  },

  openProductPanel: (productId) => {
    // Mutual exclusion: close message panel when opening product panel
    set({ isProductPanelOpen: true, selectedProductId: productId, isPanelOpen: false, selectedMessageId: null, selectedMessage: null, messageHistory: [] });
  },

  closeProductPanel: () => {
    set({ isProductPanelOpen: false, selectedProductId: null });
  },

  updateProductField: async (productId, field, value) => {
    try {
      await fetchApi(`/api/marketing-pipeline/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      set({ products: get().products.map(p => p.id === productId ? { ...p, [field]: value } : p) });
      refreshAfterMutation(get);
    } catch (error) {
      handleStoreError('update product field', error);
    }
  },

  updateAngleField: async (angleId, field, value) => {
    try {
      await fetchApi(`/api/marketing-pipeline/angles/${angleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      set({ angles: get().angles.map(a => a.id === angleId ? { ...a, [field]: value } : a) });
    } catch (error) {
      handleStoreError('update angle field', error);
    }
  },
}));
