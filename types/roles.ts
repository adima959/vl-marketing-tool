// Role & Permissions types for the RBAC system
// Phase 1: Types + UI + DB only. Enforcement is Phase 2.

// ============================================================================
// Permission Actions & Feature Keys
// ============================================================================

export type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

export type FeatureKey =
  | 'analytics.dashboard'
  | 'analytics.marketing_report'
  | 'analytics.on_page_analysis'
  | 'analytics.validation_reports'
  | 'tools.marketing_tracker'
  | 'tools.marketing_pipeline'
  | 'shared.saved_views'
  | 'admin.user_management'
  | 'admin.product_settings'
  | 'admin.role_permissions';

export type FeatureGroup = 'Analytics & Reports' | 'Tools' | 'Shared Features' | 'Administration';

// ============================================================================
// Feature Registry (drives the permission grid UI)
// ============================================================================

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  group: FeatureGroup;
  /** Which CRUD actions apply. Analytics features only have 'can_view'. */
  applicableActions: PermissionAction[];
}

export const FEATURES: FeatureDefinition[] = [
  // Analytics & Reports (View only)
  { key: 'analytics.dashboard', label: 'Dashboard', group: 'Analytics & Reports', applicableActions: ['can_view'] },
  { key: 'analytics.marketing_report', label: 'Marketing Report', group: 'Analytics & Reports', applicableActions: ['can_view'] },
  { key: 'analytics.on_page_analysis', label: 'On-Page Analysis', group: 'Analytics & Reports', applicableActions: ['can_view'] },
  { key: 'analytics.validation_reports', label: 'Validation Reports', group: 'Analytics & Reports', applicableActions: ['can_view'] },
  // Tools (Full CRUD)
  { key: 'tools.marketing_tracker', label: 'Marketing Tracker', group: 'Tools', applicableActions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
  { key: 'tools.marketing_pipeline', label: 'Marketing Pipeline', group: 'Tools', applicableActions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
  // Shared Features (Full CRUD)
  { key: 'shared.saved_views', label: 'Saved Views', group: 'Shared Features', applicableActions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
  // Administration (Full CRUD)
  { key: 'admin.user_management', label: 'User Management', group: 'Administration', applicableActions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
  { key: 'admin.product_settings', label: 'Product Settings', group: 'Administration', applicableActions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
  { key: 'admin.role_permissions', label: 'Role & Permissions', group: 'Administration', applicableActions: ['can_view', 'can_create', 'can_edit', 'can_delete'] },
];

/** Feature groups in display order */
export const FEATURE_GROUPS: FeatureGroup[] = ['Analytics & Reports', 'Tools', 'Shared Features', 'Administration'];

// ============================================================================
// Database Models
// ============================================================================

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount?: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface RolePermission {
  id: string;
  roleId: string;
  featureKey: FeatureKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

// ============================================================================
// API Request Types
// ============================================================================

export interface CreateRoleRequest {
  name: string;
  description?: string;
  /** Clone permissions from an existing role */
  cloneFromRoleId?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface UpdatePermissionsRequest {
  permissions: {
    featureKey: FeatureKey;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }[];
}
