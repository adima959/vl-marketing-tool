import { Users, Package, Map, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FeatureKey } from '@/types/roles';

/**
 * Settings Pages Configuration
 *
 * Single source of truth for all settings pages.
 * Defines navigation tabs, routes, icons, and permission gates.
 *
 * Each page is gated by a FeatureKey — users need can_view on that feature
 * to see the tab and access the page.
 */

export interface SettingsPageConfig {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  featureKey: FeatureKey;
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
    featureKey: 'admin.user_management',
  },
  {
    id: 'products',
    title: 'Products',
    href: '/settings/products',
    icon: Package,
    featureKey: 'admin.product_settings',
  },
  {
    id: 'data-maps',
    title: 'Data Maps',
    href: '/settings/data-maps',
    icon: Map,
    featureKey: 'admin.data_maps',
  },
  {
    id: 'permissions',
    title: 'Permissions',
    href: '/settings/permissions',
    icon: Shield,
    featureKey: 'admin.role_permissions',
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
