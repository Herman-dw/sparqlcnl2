export const palette = {
  primary: '#0F4C81',
  secondary: '#1E6F5C',
  accent: '#B83207',
  success: '#1D713D',
  warning: '#B85C00',
  danger: '#A4161A',
  neutral: '#0B1021',
  surface: '#F5F7FA',
  mutedSurface: '#E6ECF3'
};

export const textColors = {
  onDark: '#FFFFFF',
  onLight: '#0B1021',
  subtle: '#334155'
};

export type PaletteName = keyof typeof palette;

export const getToken = (name: PaletteName) => palette[name];
