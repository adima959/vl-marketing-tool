import { Users, Package, Map, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Settings Pages Configuration
 *
 * Single source of truth for all settings pages.
 * Defines navigation tabs, routes, icons, and permissions.
 *
 * Usage:
 * - SettingsNav.tsx: Uses SETTINGS_PAGES for navigation tabs
 * - Future: Can be used for page-level metadata and auth requirements
 */

export interface SettingsPageConfig {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  requireAdmin?: boolean;
}

/**
 * All settings pages configuration
 * Ordered as they should appear in navigation
 */
export const SETTINGS_PAGES: readonly SettingsPageConfig[] = [
  {
    id: 'users',
    title: 'Users',
    href: '/settings/users',
    icon: Users,
    requireAdmin: true,
  },
  {
    id: 'products',
    title: 'Products',
    href: '/settings/products',
    icon: Package,
  },
  {
    id: 'data-maps',
    title: 'Data Maps',
    href: '/settings/data-maps',
    icon: Map,
  },
  {
    id: 'permissions',
    title: 'Permissions',
    href: '/settings/permissions',
    icon: Shield,
  },
] as const;

/**
 * Get settings page configuration by ID
 */
export function getSettingsPage(id: string): SettingsPageConfig | undefined {
  return SETTINGS_PAGES.find((page) => page.id === id);
}

/**
 * Get settings page configuration by href
 */
export function getSettingsPageByHref(href: string): SettingsPageConfig | undefined {
  return SETTINGS_PAGES.find((page) => page.href === href);
}
