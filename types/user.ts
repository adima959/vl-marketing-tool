/**
 * User role enum matching database user_role type
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * App user from database
 */
export interface AppUser {
  id: string;
  external_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

/**
 * DTO for creating a new user
 */
export interface CreateUserDTO {
  external_id: string;
  name: string;
  email: string;
  role?: UserRole;
}

/**
 * DTO for updating user role
 */
export interface UpdateUserRoleDTO {
  role: UserRole;
}
