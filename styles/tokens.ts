/**
 * Design tokens for the application
 * Single source of truth for colors, spacing, typography, and other design values
 * Modern & Data-Forward aesthetic inspired by Linear, Stripe Dashboard, Vercel Analytics
 */

// Typography System
export const typography = {
  // Font families
  fontFamilyData: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
  fontFamilyBase: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",

  // Heading styles
  heading: {
    h1: { size: 28, weight: 600, lineHeight: 1.2 },
    h2: { size: 20, weight: 600, lineHeight: 1.3 },
    h3: { size: 16, weight: 600, lineHeight: 1.4 },
    h4: { size: 14, weight: 600, lineHeight: 1.5 },
  },

  // Body text
  body: {
    lg: { size: 15, weight: 400, lineHeight: 1.5 },
    md: { size: 14, weight: 400, lineHeight: 1.5 },
    sm: { size: 13, weight: 400, lineHeight: 1.5 },
    xs: { size: 12, weight: 400, lineHeight: 1.4 },
  },

  // Data/numeric text (for tables and metrics)
  data: {
    lg: { size: 16, weight: 500, lineHeight: 1.3, letterSpacing: '-0.01em' },
    md: { size: 14, weight: 500, lineHeight: 1.3, letterSpacing: '-0.005em' },
    sm: { size: 13, weight: 500, lineHeight: 1.3, letterSpacing: '0em' },
  },
} as const;

// Color System
export const colors = {
  // Primary brand color (teal/green - keeping existing)
  primary: {
    50: '#e6f9f4',
    100: '#b3ede1',
    200: '#80e0cd',
    300: '#4dd4ba',
    400: '#1ac8a6',
    500: '#00B96B', // Main brand color
    600: '#00a661',
    700: '#009254',
    800: '#007e47',
    900: '#00562f',
  },

  // Refined gray scale (Linear-inspired)
  gray: {
    50: '#fafbfc',
    100: '#f5f6f7',
    200: '#e8eaed',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },

  // Semantic colors
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  // Data visualization accents
  accent: {
    blue: '#3b82f6',
    purple: '#8b5cf6',
    pink: '#ec4899',
    orange: '#f97316',
    cyan: '#06b6d4',
    emerald: '#10b981',
  },

  // Navy colors (for tables)
  navy: {
    primary: '#1E3A5F',
    border: '#C5D3E0',
    accent: '#2C4A6E',
  },

  // Background variations
  background: {
    primary: '#ffffff',
    secondary: '#fafbfc',
    tertiary: '#f5f6f7',
    canvas: '#eef0f2',
    hover: '#f0f9ff',
    active: '#e0f2fe',
    expanded: '#e6f7ed',
  },

  // Legacy color mappings (for backwards compatibility)
  text: {
    primary: '#111827',  // gray-900
    secondary: '#6b7280', // gray-500
    heading: '#1f2937',  // gray-800
  },

  border: {
    light: '#e8eaed',   // gray-200
    medium: '#d1d5db',  // gray-300
    dark: '#9ca3af',    // gray-400
  },
} as const;

// Spacing Scale
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  // Legacy aliases
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// Border Radius
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  full: 9999,
} as const;

// Font Sizes (legacy, use typography.body/heading instead)
export const fontSize = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
} as const;

// Font Weights (legacy, use typography instead)
export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// Modern Shadow System (lighter, more subtle)
export const shadows = {
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
  float: '0 8px 16px rgba(0, 0, 0, 0.08)',
  modal: '0 24px 48px rgba(0, 0, 0, 0.12)',
  // Legacy shadows
  button: '0 1px 2px rgba(0, 185, 107, 0.2)',
  buttonHover: '0 2px 4px rgba(0, 185, 107, 0.3)',
  fixed: 'inset 10px 0 8px -8px rgba(0, 0, 0, 0.15)',
} as const;

// Transitions
export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  elastic: '400ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const;

/**
 * NOTE: CSS variables are defined in styles/tokens.css
 * If you need to use these tokens in CSS files, import that file
 * If you need to use these tokens in JS/TS, import the objects above
 */
