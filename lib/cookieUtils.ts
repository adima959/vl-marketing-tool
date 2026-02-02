/**
 * Cookie utilities for persisting user preferences
 * Uses js-cookie for client-side cookie management
 */

const COOKIE_KEYS = {
  DASHBOARD_DIMENSIONS: 'dashboard_dimensions',
} as const;

const COOKIE_OPTIONS = {
  expires: 365, // 1 year
  sameSite: 'strict' as const,
};

/**
 * Save dashboard dimension order to cookie
 */
export function saveDashboardDimensions(dimensions: string[]): void {
  if (typeof window === 'undefined') return;

  try {
    document.cookie = `${COOKIE_KEYS.DASHBOARD_DIMENSIONS}=${JSON.stringify(dimensions)}; max-age=${COOKIE_OPTIONS.expires * 24 * 60 * 60}; path=/; samesite=${COOKIE_OPTIONS.sameSite}`;
  } catch (error) {
    console.warn('Failed to save dashboard dimensions to cookie:', error);
  }
}

/**
 * Load dashboard dimension order from cookie
 * Returns null if cookie doesn't exist or is invalid
 */
export function loadDashboardDimensions(): string[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const cookies = document.cookie.split(';');
    const dashboardCookie = cookies.find(c => c.trim().startsWith(`${COOKIE_KEYS.DASHBOARD_DIMENSIONS}=`));

    if (!dashboardCookie) return null;

    const value = dashboardCookie.split('=')[1];
    const dimensions = JSON.parse(decodeURIComponent(value));

    // Validate that it's an array of strings
    if (Array.isArray(dimensions) && dimensions.every(d => typeof d === 'string')) {
      return dimensions;
    }

    return null;
  } catch (error) {
    console.warn('Failed to load dashboard dimensions from cookie:', error);
    return null;
  }
}
