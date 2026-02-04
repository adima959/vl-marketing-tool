// Marketing Tracker Types - v2 (Message-Based Structure)

// Enums
export type AngleStatus = 'idea' | 'in_production' | 'live' | 'paused' | 'retired';
export type ProductStatus = 'active' | 'inactive';
export type Geography = 'NO' | 'SE' | 'DK';
export type AssetType = 'landing_page' | 'text_ad' | 'brief' | 'research';
export type CreativeFormat = 'ugc_video' | 'static_image' | 'video';

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
};

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

// Base entity with common fields
interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// User
export interface TrackerUser extends BaseEntity {
  name: string;
  email: string;
  isDeleted?: boolean;
}

// Product
export interface Product extends BaseEntity {
  name: string;
  description?: string;
  notes?: string;
  status: ProductStatus;
  ownerId: string;
  owner?: TrackerUser;
  angleCount?: number;
  activeAngleCount?: number;
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
  status: AngleStatus;
  launchedAt?: string;
  assets?: Asset[];
  creatives?: Creative[];
  assetCount?: number;
  creativeCount?: number;
  assetsByGeo?: Record<Geography, Asset[]>;
  creativesByGeo?: Record<Geography, Creative[]>;
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

// Activity Log
export type ActivityAction = 'created' | 'updated' | 'deleted';
export type EntityType = 'product' | 'angle' | 'message' | 'asset' | 'creative';

export interface ActivityLog extends BaseEntity {
  userId: string;
  user?: TrackerUser;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActivityAction;
  changes?: Record<string, { before: unknown; after: unknown }>;
}

// API Request/Response types
export interface CreateProductRequest {
  name: string;
  description?: string;
  notes?: string;
  status?: ProductStatus;
  ownerId: string;
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
  users: TrackerUser[];
}

// Legacy type aliases for backward compatibility during migration
/** @deprecated Use Angle instead */
export type MainAngle = Angle;
/** @deprecated Use Message instead */
export type SubAngle = Message;
/** @deprecated Use CreateAngleRequest instead */
export type CreateMainAngleRequest = CreateAngleRequest;
/** @deprecated Use CreateMessageRequest instead */
export type CreateSubAngleRequest = CreateMessageRequest;
