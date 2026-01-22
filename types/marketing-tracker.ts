// Marketing Tracker Types

// Enums
export type AngleStatus = 'idea' | 'in_production' | 'live' | 'paused' | 'retired';
export type Geography = 'NO' | 'SE' | 'DK';
export type AssetType = 'landing_page' | 'image_ads' | 'ugc_video' | 'text_ad' | 'brief' | 'research';

// Status display configuration
export const STATUS_CONFIG: Record<AngleStatus, { label: string; color: string; bgColor: string }> = {
  idea: { label: 'Idea', color: '#6b7280', bgColor: '#f3f4f6' },
  in_production: { label: 'In Production', color: '#d97706', bgColor: '#fef3c7' },
  live: { label: 'Live', color: '#059669', bgColor: '#d1fae5' },
  paused: { label: 'Paused', color: '#dc2626', bgColor: '#fee2e2' },
  retired: { label: 'Retired', color: '#9ca3af', bgColor: '#e5e7eb' },
};

export const GEO_CONFIG: Record<Geography, { label: string; flag: string }> = {
  NO: { label: 'Norway', flag: '🇳🇴' },
  SE: { label: 'Sweden', flag: '🇸🇪' },
  DK: { label: 'Denmark', flag: '🇩🇰' },
};

export const ASSET_TYPE_CONFIG: Record<AssetType, { label: string; icon: string }> = {
  landing_page: { label: 'Landing Page', icon: 'Globe' },
  image_ads: { label: 'Image Ads', icon: 'Image' },
  ugc_video: { label: 'UGC Video', icon: 'Video' },
  text_ad: { label: 'Text Ad', icon: 'FileText' },
  brief: { label: 'Brief', icon: 'FileCheck' },
  research: { label: 'Research', icon: 'Search' },
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
  ownerId: string;
  owner?: TrackerUser;
  angleCount?: number;
  activeAngleCount?: number;
}

// Main Angle
export interface MainAngle extends BaseEntity {
  productId: string;
  name: string;
  targetAudience?: string;
  painPoint?: string;
  hook?: string;
  description?: string;
  status: AngleStatus;
  launchedAt?: string;
  subAngles?: SubAngle[];
  subAngleCount?: number;
}

// Sub-Angle
export interface SubAngle extends BaseEntity {
  mainAngleId: string;
  name: string;
  hook?: string;
  description?: string;
  status: AngleStatus;
  launchedAt?: string;
  assets?: Asset[];
  assetCount?: number;
  assetsByGeo?: Record<Geography, Asset[]>;
}

// Asset
export interface Asset extends BaseEntity {
  subAngleId: string;
  geo: Geography;
  type: AssetType;
  name: string;
  url?: string;
  content?: string;
  notes?: string;
}

// Activity Log
export type ActivityAction = 'created' | 'updated' | 'deleted';
export type EntityType = 'product' | 'main_angle' | 'sub_angle' | 'asset';

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
  ownerId: string;
}

export interface CreateMainAngleRequest {
  productId: string;
  name: string;
  targetAudience?: string;
  painPoint?: string;
  hook?: string;
  description?: string;
  status?: AngleStatus;
}

export interface CreateSubAngleRequest {
  mainAngleId: string;
  name: string;
  hook?: string;
  description?: string;
  status?: AngleStatus;
}

export interface CreateAssetRequest {
  subAngleId: string;
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
