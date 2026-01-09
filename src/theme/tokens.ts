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

/**
 * CompetentNL Brand Colors (from logo palette)
 */
const competentNLBrand = {
  brandNavy: '#00263E',
  brandBlue: '#156082',
  brandOrange: '#EE7F01',
  brandCyan: '#3DBBCE',
  successGreen: '#196B24',
  accentMagenta: '#A1006B'
};

export const colors = {
  primary: {
    default: '#196B24',  // CompetentNL successGreen
    hover: '#145a1e',
    active: '#0f4517'
  } satisfies ColorState,
  support: {
    default: '#156082',  // CompetentNL brandBlue
    hover: '#114d6a',
    active: '#0d3a51'
  } satisfies ColorState,
  surface: {
    base: '#f8f9fa',
    raised: '#ffffff',
    muted: '#f1f3f4',
    inverse: '#00263E',  // CompetentNL brandNavy
    attention: '#fff3cd'
  },
  border: {
    subtle: '#e0e0e0',
    default: '#dee2e6',
    warning: '#EE7F01'  // CompetentNL brandOrange
  },
  text: {
    primary: '#00263E',  // CompetentNL brandNavy
    secondary: '#666666',
    inverse: '#ffffff',
    code: '#3DBBCE'  // CompetentNL brandCyan
  },
  states: {
    success: '#196B24',  // CompetentNL successGreen
    warning: '#EE7F01',  // CompetentNL brandOrange
    info: '#156082',     // CompetentNL brandBlue
    danger: '#ef4444',
    disabled: '#cccccc'
  },
  brand: competentNLBrand
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
  primary: '#22c55e',      // Lighter green for dark mode
  support: '#3DBBCE',      // CompetentNL brandCyan
  surfaceBase: '#0f172a',
  surfaceRaised: '#1e293b',
  surfaceMuted: '#111827',
  border: '#334155',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  shadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
};
