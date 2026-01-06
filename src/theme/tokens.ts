/**
 * Design tokens for colors, spacing, radii and shadows.
 * - Primary/support colors expose default/hover/active states.
 * - Dark-mode mapping documents how base tokens shift when the UI switches theme.
 */

export type ColorState = {
  /** Default/base color for the element state. */
  default: string;
  /** Hover color for the element state. */
  hover: string;
  /** Active/pressed color for the element state. */
  active: string;
};

export const colors = {
  primary: {
    default: '#0066cc',
    hover: '#0052a3',
    active: '#003f7d'
  } satisfies ColorState,
  support: {
    default: '#17a2b8',
    hover: '#138496',
    active: '#0f6678'
  } satisfies ColorState,
  surface: {
    base: '#f8f9fa',
    raised: '#ffffff',
    muted: '#f1f3f4',
    inverse: '#263238',
    attention: '#fff3cd'
  },
  border: {
    subtle: '#e0e0e0',
    default: '#dee2e6',
    warning: '#ffc107'
  },
  text: {
    primary: '#263238',
    secondary: '#666666',
    inverse: '#ffffff',
    code: '#80cbc4'
  },
  states: {
    success: '#28a745',
    warning: '#ffc107',
    info: '#17a2b8',
    danger: '#ef4444',
    disabled: '#cccccc'
  }
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999
};

export const shadows = {
  soft: '0 1px 2px rgba(0, 0, 0, 0.1)',
  medium: '0 4px 8px rgba(0, 0, 0, 0.12)'
};

/**
 * Dark-mode mapping shows how the base tokens translate when a dark theme is active.
 */
export const darkModeMapping = {
  primary: '#3b82f6',
  support: '#22c55e',
  surfaceBase: '#0f172a',
  surfaceRaised: '#1e293b',
  surfaceMuted: '#111827',
  border: '#334155',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  shadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
};
