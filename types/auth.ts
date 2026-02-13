import type { UserRole } from './user';
import type { FeatureKey, PermissionAction } from './roles';

/**
 * Per-feature permission flags, keyed by action.
 * Only features present in the map are explicitly granted;
 * missing features default to denied.
 */
export type PermissionMap = Partial<
  Record<FeatureKey, Record<PermissionAction, boolean>>
>;

/**
 * CRM User profile information
 * Includes role + resolved permissions from database
 */
export interface CRMUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: PermissionMap;
}

/**
 * Response from token validation with CRM
 */
export interface AuthValidationResponse {
  success: boolean;
  user?: CRMUser;
  error?: string;
}
