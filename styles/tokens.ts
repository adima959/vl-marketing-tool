/**
 * Design tokens for the application
 * Single source of truth for colors, spacing, and other design values
 */

export const colors = {
  // Primary brand color
  primary: '#00B96B',

  // Text colors
  text: {
    primary: '#202124',
    secondary: '#5f6368',
    heading: '#262626',
  },

  // Border colors
  border: {
    light: '#e8eaed',
    medium: '#e0e0e0',
    dark: '#dadce0',
  },

  // Background colors
  background: {
    white: '#fff',
    light: '#fafafa',
    lighter: '#f5f5f5',
    hover: '#e8f0fe',
    hoverAlt: '#f0f9ff',
    expanded: '#e6f7ed',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
} as const;

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 1px 3px rgba(0, 0, 0, 0.08)',
  lg: '0 2px 8px rgba(0, 0, 0, 0.12)',
  button: '0 1px 2px rgba(0, 185, 107, 0.2)',
  buttonHover: '0 2px 4px rgba(0, 185, 107, 0.3)',
  fixed: 'inset 10px 0 8px -8px rgba(0, 0, 0, 0.15)',
} as const;

/**
 * CSS custom properties (CSS variables) for use in stylesheets
 * These can be used in CSS files as var(--color-primary), etc.
 */
export const cssVariables = `
:root {
  /* Colors */
  --color-primary: ${colors.primary};
  --color-text-primary: ${colors.text.primary};
  --color-text-secondary: ${colors.text.secondary};
  --color-text-heading: ${colors.text.heading};
  --color-border-light: ${colors.border.light};
  --color-border-medium: ${colors.border.medium};
  --color-border-dark: ${colors.border.dark};
  --color-background-white: ${colors.background.white};
  --color-background-light: ${colors.background.light};
  --color-background-lighter: ${colors.background.lighter};
  --color-background-hover: ${colors.background.hover};
  --color-background-hover-alt: ${colors.background.hoverAlt};
  --color-background-expanded: ${colors.background.expanded};

  /* Spacing */
  --spacing-xs: ${spacing.xs}px;
  --spacing-sm: ${spacing.sm}px;
  --spacing-md: ${spacing.md}px;
  --spacing-lg: ${spacing.lg}px;
  --spacing-xl: ${spacing.xl}px;

  /* Border Radius */
  --radius-sm: ${borderRadius.sm}px;
  --radius-md: ${borderRadius.md}px;
  --radius-lg: ${borderRadius.lg}px;

  /* Font Size */
  --font-size-xs: ${fontSize.xs}px;
  --font-size-sm: ${fontSize.sm}px;
  --font-size-md: ${fontSize.md}px;
  --font-size-lg: ${fontSize.lg}px;

  /* Font Weight */
  --font-weight-normal: ${fontWeight.normal};
  --font-weight-medium: ${fontWeight.medium};
  --font-weight-semibold: ${fontWeight.semibold};

  /* Shadows */
  --shadow-sm: ${shadows.sm};
  --shadow-md: ${shadows.md};
  --shadow-lg: ${shadows.lg};
  --shadow-button: ${shadows.button};
  --shadow-button-hover: ${shadows.buttonHover};
  --shadow-fixed: ${shadows.fixed};
}
`;
