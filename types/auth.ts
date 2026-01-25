import type { UserRole } from './user';

/**
 * CRM User profile information
 * Includes role from database (checked in real-time)
 */
export interface CRMUser {
  id: string;
  email: string;
  name: string;
  role: UserRole; // Role from app_users table
}

/**
 * Response from token validation with CRM
 */
export interface AuthValidationResponse {
  success: boolean;
  user?: CRMUser;
  error?: string;
}

/**
 * Cached validation result with expiration
 */
export interface CachedValidation {
  validation: AuthValidationResponse;
  expiresAt: number;
}
