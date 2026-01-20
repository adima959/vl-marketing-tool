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

  // Background variations
  background: {
    primary: '#ffffff',
    secondary: '#fafbfc',
    tertiary: '#f5f6f7',
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
 * CSS custom properties (CSS variables) for use in stylesheets
 * These can be used in CSS files as var(--color-primary-500), etc.
 */
export const cssVariables = `
:root {
  /* Typography - Font Families */
  --font-family-data: ${typography.fontFamilyData};
  --font-family-mono: ${typography.fontFamilyMono};
  --font-family-base: ${typography.fontFamilyBase};

  /* Primary Colors */
  --color-primary-50: ${colors.primary[50]};
  --color-primary-100: ${colors.primary[100]};
  --color-primary-200: ${colors.primary[200]};
  --color-primary-300: ${colors.primary[300]};
  --color-primary-400: ${colors.primary[400]};
  --color-primary-500: ${colors.primary[500]};
  --color-primary-600: ${colors.primary[600]};
  --color-primary-700: ${colors.primary[700]};
  --color-primary-800: ${colors.primary[800]};
  --color-primary-900: ${colors.primary[900]};

  /* Gray Scale */
  --color-gray-50: ${colors.gray[50]};
  --color-gray-100: ${colors.gray[100]};
  --color-gray-200: ${colors.gray[200]};
  --color-gray-300: ${colors.gray[300]};
  --color-gray-400: ${colors.gray[400]};
  --color-gray-500: ${colors.gray[500]};
  --color-gray-600: ${colors.gray[600]};
  --color-gray-700: ${colors.gray[700]};
  --color-gray-800: ${colors.gray[800]};
  --color-gray-900: ${colors.gray[900]};

  /* Semantic Colors */
  --color-success: ${colors.semantic.success};
  --color-warning: ${colors.semantic.warning};
  --color-error: ${colors.semantic.error};
  --color-info: ${colors.semantic.info};

  /* Accent Colors */
  --color-accent-blue: ${colors.accent.blue};
  --color-accent-purple: ${colors.accent.purple};
  --color-accent-pink: ${colors.accent.pink};
  --color-accent-orange: ${colors.accent.orange};
  --color-accent-cyan: ${colors.accent.cyan};
  --color-accent-emerald: ${colors.accent.emerald};

  /* Background Colors */
  --color-background-primary: ${colors.background.primary};
  --color-background-secondary: ${colors.background.secondary};
  --color-background-tertiary: ${colors.background.tertiary};
  --color-background-hover: ${colors.background.hover};
  --color-background-active: ${colors.background.active};
  --color-background-expanded: ${colors.background.expanded};

  /* Legacy Color Aliases */
  --color-primary: ${colors.primary[500]};
  --color-text-primary: ${colors.text.primary};
  --color-text-secondary: ${colors.text.secondary};
  --color-text-heading: ${colors.text.heading};
  --color-border-light: ${colors.border.light};
  --color-border-medium: ${colors.border.medium};
  --color-border-dark: ${colors.border.dark};

  /* Spacing */
  --spacing-0: ${spacing[0]}px;
  --spacing-1: ${spacing[1]}px;
  --spacing-2: ${spacing[2]}px;
  --spacing-3: ${spacing[3]}px;
  --spacing-4: ${spacing[4]}px;
  --spacing-5: ${spacing[5]}px;
  --spacing-6: ${spacing[6]}px;
  --spacing-7: ${spacing[7]}px;
  --spacing-8: ${spacing[8]}px;
  --spacing-10: ${spacing[10]}px;
  --spacing-12: ${spacing[12]}px;
  --spacing-16: ${spacing[16]}px;
  --spacing-xs: ${spacing.xs}px;
  --spacing-sm: ${spacing.sm}px;
  --spacing-md: ${spacing.md}px;
  --spacing-lg: ${spacing.lg}px;
  --spacing-xl: ${spacing.xl}px;

  /* Border Radius */
  --radius-none: ${borderRadius.none}px;
  --radius-sm: ${borderRadius.sm}px;
  --radius-md: ${borderRadius.md}px;
  --radius-lg: ${borderRadius.lg}px;
  --radius-xl: ${borderRadius.xl}px;
  --radius-2xl: ${borderRadius['2xl']}px;
  --radius-full: ${borderRadius.full}px;

  /* Font Sizes */
  --font-size-xs: ${fontSize.xs}px;
  --font-size-sm: ${fontSize.sm}px;
  --font-size-md: ${fontSize.md}px;
  --font-size-lg: ${fontSize.lg}px;

  /* Font Weights */
  --font-weight-normal: ${fontWeight.normal};
  --font-weight-medium: ${fontWeight.medium};
  --font-weight-semibold: ${fontWeight.semibold};
  --font-weight-bold: ${fontWeight.bold};

  /* Shadows */
  --shadow-xs: ${shadows.xs};
  --shadow-sm: ${shadows.sm};
  --shadow-md: ${shadows.md};
  --shadow-lg: ${shadows.lg};
  --shadow-xl: ${shadows.xl};
  --shadow-2xl: ${shadows['2xl']};
  --shadow-float: ${shadows.float};
  --shadow-modal: ${shadows.modal};
  --shadow-button: ${shadows.button};
  --shadow-button-hover: ${shadows.buttonHover};
  --shadow-fixed: ${shadows.fixed};

  /* Transitions */
  --transition-fast: ${transitions.fast};
  --transition-base: ${transitions.base};
  --transition-slow: ${transitions.slow};
  --transition-elastic: ${transitions.elastic};
}
`;
