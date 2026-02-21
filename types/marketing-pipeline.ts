// Marketing Pipeline Types - v2 (Message-Based Structure)

// Enums
export type AngleStatus = 'idea' | 'in_production' | 'live' | 'paused' | 'retired';
export type ProductStatus = 'active' | 'inactive';
export type Geography = 'NO' | 'SE' | 'DK' | 'FI';
export type AssetType = 'landing_page' | 'text_ad' | 'brief' | 'research';
export type CreativeFormat = 'ugc_video' | 'static_image' | 'video';

// Pipeline types
export type PipelineStage = 'backlog' | 'production' | 'testing' | 'scaling' | 'retired';
export type GeoStage = 'setup' | 'production' | 'testing' | 'live' | 'paused';
export type VerdictType = 'kill' | 'iterate' | 'scale' | 'expand';
export type Channel = 'meta' | 'google' | 'taboola' | 'other';
export type CampaignStatus = 'active' | 'paused' | 'stopped';

// Status display configuration
export const STATUS_CONFIG: Record<AngleStatus, { label: string; color: string; bgColor: string }> = {
  idea: { label: 'Idea', color: '#6b7280', bgColor: '#f3f4f6' },
  in_production: { label: 'In Production', color: '#d97706', bgColor: '#fef3c7' },
  live: { label: 'Live', color: '#059669', bgColor: '#d1fae5' },
  paused: { label: 'Paused', color: '#dc2626', bgColor: '#fee2e2' },
  retired: { label: 'Retired', color: '#9ca3af', bgColor: '#e5e7eb' },
};

export const PRODUCT_STATUS_CONFIG: Record<ProductStatus, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: '#059669', bgColor: '#d1fae5' },
  inactive: { label: 'Inactive', color: '#9ca3af', bgColor: '#e5e7eb' },
};

export const GEO_CONFIG: Record<Geography, { label: string; flag: string }> = {
  NO: { label: 'Norway', flag: '🇳🇴' },
  SE: { label: 'Sweden', flag: '🇸🇪' },
  DK: { label: 'Denmark', flag: '🇩🇰' },
  FI: { label: 'Finland', flag: '🇫🇮' },
};

// Copy Variations — structured ad copy per language
export type CopyLanguage = 'en' | 'no' | 'se' | 'dk';
export type CopySection = 'hook' | 'primaryText' | 'cta';

export const COPY_LANG_CONFIG: Record<CopyLanguage, { label: string }> = {
  en: { label: 'ENG' },
  no: { label: 'NO' },
  se: { label: 'SE' },
  dk: { label: 'DK' },
};

export const COPY_SECTION_CONFIG: Record<CopySection, { label: string; color: string; bg: string; bgHeader: string }> = {
  hook: { label: 'HOOK', color: '#2563eb', bg: '#eff6ff', bgHeader: '#dbeafe' },
  primaryText: { label: 'PRIMARY TEXT', color: '#374151', bg: '#faf5ff', bgHeader: '#f3e8ff' },
  cta: { label: 'CTA', color: '#059669', bg: '#ecfdf5', bgHeader: '#d1fae5' },
};

export interface CopyVariation {
  id: string;
  status: 'active' | 'draft';
  hook: Partial<Record<CopyLanguage, string>>;
  primaryText: Partial<Record<CopyLanguage, string>>;
  cta: Partial<Record<CopyLanguage, string>>;
}

export const ASSET_TYPE_CONFIG: Record<AssetType, { label: string; icon: string }> = {
  landing_page: { label: 'Landing Page', icon: 'Globe' },
  text_ad: { label: 'Text Ad', icon: 'FileText' },
  brief: { label: 'Brief', icon: 'FileCheck' },
  research: { label: 'Research', icon: 'Search' },
};

export const CREATIVE_FORMAT_CONFIG: Record<CreativeFormat, { label: string; icon: string }> = {
  ugc_video: { label: 'UGC Video', icon: 'Video' },
  static_image: { label: 'Static Image', icon: 'Image' },
  video: { label: 'Video', icon: 'Film' },
};

// Pipeline stage display configuration
export const PIPELINE_STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; bgColor: string; description: string }> = {
  backlog: { label: 'Backlog', color: '#6b7280', bgColor: '#f3f4f6', description: 'Raw message ideas waiting to be developed' },
  production: { label: 'Production', color: '#d97706', bgColor: '#fef3c7', description: 'Assets and creatives are being produced' },
  testing: { label: 'Testing', color: '#2563eb', bgColor: '#dbeafe', description: 'Live campaigns running, gathering data' },
  scaling: { label: 'Scaling', color: '#059669', bgColor: '#d1fae5', description: 'Proven concept, expanding to more geos' },
  retired: { label: 'Retired', color: '#9ca3af', bgColor: '#e5e7eb', description: 'Killed or replaced by a newer iteration' },
};

export const PIPELINE_STAGES_ORDER: PipelineStage[] = [
  'backlog', 'production', 'testing', 'scaling', 'retired',
];

// Geo stage display configuration
export const GEO_STAGE_CONFIG: Record<GeoStage, { label: string; color: string; bgColor: string }> = {
  setup: { label: 'Setup', color: '#6b7280', bgColor: '#f3f4f6' },
  production: { label: 'Production', color: '#d97706', bgColor: '#fef3c7' },
  testing: { label: 'Testing', color: '#2563eb', bgColor: '#dbeafe' },
  live: { label: 'Live', color: '#059669', bgColor: '#d1fae5' },
  paused: { label: 'Paused', color: '#dc2626', bgColor: '#fee2e2' },
};

export const CHANNEL_CONFIG: Record<Channel, { label: string; shortLabel: string }> = {
  meta: { label: 'Meta', shortLabel: 'M' },
  google: { label: 'Google', shortLabel: 'G' },
  taboola: { label: 'Taboola', shortLabel: 'T' },
  other: { label: 'Other', shortLabel: 'O' },
};

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: '#059669', bgColor: '#d1fae5' },
  paused: { label: 'Paused', color: '#d97706', bgColor: '#fef3c7' },
  stopped: { label: 'Stopped', color: '#dc2626', bgColor: '#fee2e2' },
};

// Base entity with common fields
interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// User
export interface PipelineUser extends BaseEntity {
  name: string;
  email: string;
  isDeleted?: boolean;
}

// CPA target per product × geo × channel
export interface CpaTarget {
  id: string;
  productId: string;
  geo: Geography;
  channel: Channel;
  target: number;
}

// Product
export interface Product extends BaseEntity {
  name: string;
  sku?: string;
  description?: string;
  notes?: string;
  color?: string;
  status: ProductStatus;
  ownerId?: string | null;
  owner?: PipelineUser;
  angleCount?: number;
  activeAngleCount?: number;
  cpaTargetNo?: number;
  cpaTargetSe?: number;
  cpaTargetDk?: number;
  cpaTargets?: CpaTarget[];
  driveFolderId?: string | null;
  assetsFolderId?: string | null;
}

// Angle (simplified from MainAngle - acts as a problem area folder)
export interface Angle extends BaseEntity {
  productId: string;
  name: string;
  description?: string;
  status: AngleStatus;
  launchedAt?: string;
  messages?: Message[];
  messageCount?: number;
  driveFolderId?: string | null;
}

// Message (enriched from SubAngle - the hypothesis level)
export interface Message extends BaseEntity {
  angleId: string;
  name: string;
  description?: string;
  specificPainPoint?: string;
  corePromise?: string;
  keyIdea?: string;
  primaryHookDirection?: string;
  headlines?: string[];
  copyVariations?: CopyVariation[];
  status: AngleStatus;
  launchedAt?: string;
  assets?: Asset[];
  creatives?: Creative[];
  assetCount?: number;
  creativeCount?: number;
  assetsByGeo?: Record<Geography, Asset[]>;
  creativesByGeo?: Record<Geography, Creative[]>;
  // Pipeline fields
  pipelineStage?: PipelineStage;
  verdictType?: VerdictType;
  verdictNotes?: string;
  parentMessageId?: string;
  spendThreshold?: number;
  version?: number;
  notes?: string;
  driveFolderId?: string | null;
}

// Creative (NEW - separated from Assets)
export interface Creative extends BaseEntity {
  messageId: string;
  geo: Geography;
  name: string;
  format: CreativeFormat;
  cta?: string;
  url?: string;
  notes?: string;
}

// Asset (reduced - non-creative materials only)
export interface Asset extends BaseEntity {
  messageId: string;
  geo: Geography;
  type: AssetType;
  name: string;
  url?: string;
  content?: string;
  notes?: string;
}

// Message Geo (per-geo stage tracking within a message)
export interface MessageGeo {
  id: string;
  messageId: string;
  geo: Geography;
  stage: GeoStage;
  isPrimary: boolean;
  launchedAt?: string;
  spendThreshold: number;
  notes?: string;
  driveFolderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Activity Log
export type ActivityAction = 'created' | 'updated' | 'deleted';
export type EntityType = 'product' | 'angle' | 'message' | 'asset' | 'creative' | 'campaign' | 'pipeline_message' | 'pipeline_angle';

export interface ActivityLog extends BaseEntity {
  userId: string;
  user?: PipelineUser;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActivityAction;
  changes?: Record<string, { before: unknown; after: unknown }>;
}

// API Request/Response types
export interface CreateProductRequest {
  name: string;
  sku?: string;
  description?: string;
  notes?: string;
  color?: string;
  status?: ProductStatus;
  ownerId?: string | null;
}

export interface CreateAngleRequest {
  productId: string;
  name: string;
  description?: string;
  status?: AngleStatus;
}

export interface CreateMessageRequest {
  angleId: string;
  name: string;
  description?: string;
  specificPainPoint?: string;
  corePromise?: string;
  keyIdea?: string;
  primaryHookDirection?: string;
  headlines?: string[];
  status?: AngleStatus;
}

export interface CreateCreativeRequest {
  messageId: string;
  geo: Geography;
  name: string;
  format: CreativeFormat;
  cta?: string;
  url?: string;
  notes?: string;
}

export interface CreateAssetRequest {
  messageId: string;
  geo: Geography;
  type: AssetType;
  name: string;
  url?: string;
  content?: string;
  notes?: string;
}

// Dashboard view types
export interface ProductWithStats extends Product {
  angleCount: number;
  activeAngleCount: number;
}

export interface DashboardData {
  products: ProductWithStats[];
  users: PipelineUser[];
}

// Campaign (message × channel × GEO instance)
export interface Campaign {
  id: string;
  messageId: string;
  name?: string;
  channel: Channel;
  geo: Geography;
  externalId?: string;
  externalUrl?: string;
  spend: number;
  conversions: number;
  cpa?: number;
  lastDataUpdate?: string;
  createdAt: string;
  updatedAt: string;
}

// Pipeline board card (aggregated view of a message)
export interface PipelineCard {
  id: string;
  name: string;
  pipelineStage: PipelineStage;
  productId: string;
  productName: string;
  productColor?: string;
  angleId: string;
  angleName: string;
  ownerId: string;
  ownerName: string;
  totalSpend: number;
  blendedCpa?: number;
  activeCampaignCount: number;
  campaigns: Campaign[];
  geos: MessageGeo[];
  verdictType?: VerdictType;
  parentMessageId?: string;
  version: number;
  spendThreshold: number;
  updatedAt: string;
  driveFolderId?: string | null;
}

export interface CreateCampaignRequest {
  messageId: string;
  name?: string;
  channel: Channel;
  geo: Geography;
  externalId?: string;
  externalUrl?: string;
}

// Campaign performance data (auto-fetched from ads + CRM + on-page)
export interface CampaignPerformanceData {
  // Ads metadata
  campaignName?: string;
  // Ads metrics (from marketing_merged_ads_spending)
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
  lastActivityDate?: string; // Most recent date with ad spend > 0
  campaignStatus?: CampaignStatus; // Derived from lastActivityDate (≤3d: active, 4-30d: paused, 30+d: stopped)
  // CRM metrics (from SaleRow filtered by tracking_id_4)
  subscriptions: number;
  trials: number;
  trialsApproved: number;
  approvalRate: number;
  upsells: number;
  ots: number;
  revenue: number;
  // On-page metrics (from trackerQueryBuilder by utm_campaign)
  pageViews: number;
  uniqueVisitors: number;
  formViews: number;
  formStarters: number;
  bounceRate: number;
  scrollPastHero: number;
  avgTimeOnPage: number | null;
  // Computed
  trueCpa: number | null;
}

// Ad hierarchy types (adset / ad level from marketing_merged_ads_spending)
export interface AdsetPerformance {
  adsetId: string;
  adsetName: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

export interface AdPerformance {
  adId: string;
  adName: string;
  adsetId: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

export interface AdLandingPage {
  urlPath: string;
  pageViews: number;
  uniqueVisitors: number;
  bounceRate: number;
  scrollPastHero: number;
  scrollRate: number;
  formViews: number;
  formViewRate: number;
  formStarters: number;
  formStartRate: number;
  avgTimeOnPage: number | null;
}

export interface CampaignHierarchyData {
  adsets: AdsetPerformance[];
  ads: AdPerformance[];
  adLandingPages: Record<string, AdLandingPage[]>;
  funnelFluxIds: string[];
}

// Pipeline summary stats
export interface PipelineSummary {
  totalSpend: number;
  scalingCount: number;
  totalMessages: number;
}

// Full message detail for the panel (message + related data)
export interface MessageDetail extends Message {
  product?: Product;
  angle?: Angle;
  owner?: PipelineUser;
  campaigns: Campaign[];
  geos: MessageGeo[];
}

