export type ColorPalette = {
  brandNavy: string;
  brandBlue: string;
  accentOrange: string;
  accentCyan: string;
  successGreen: string;
  magenta: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textOnDark: string;
  textOnAccent: string;
};

export type TypographyScale = {
  headingFont: string;
  bodyFont: string;
  h1: { size: string; lineHeight: string; weight: number };
  h2: { size: string; lineHeight: string; weight: number };
  h3: { size: string; lineHeight: string; weight: number };
  h4: { size: string; lineHeight: string; weight: number };
  body: { size: string; lineHeight: string; weight: number };
  bodyStrong: { size: string; lineHeight: string; weight: number };
  caption: { size: string; lineHeight: string; weight: number };
};

export const colorPalette: ColorPalette = {
  // Extracted from the CompetentNL logo colors in the supplied documentation theme
  brandNavy: '#0E2841',
  brandBlue: '#156082',
  accentOrange: '#E97132',
  accentCyan: '#0F9ED5',
  successGreen: '#196B24',
  magenta: '#A02B93',
  surface: '#F5F8FB',
  surfaceAlt: '#FFFFFF',
  border: '#D9E2EC',
  textPrimary: '#0E2841',
  textSecondary: '#156082',
  textOnDark: '#FFFFFF',
  textOnAccent: '#0E2841'
};

export const typographyScale: TypographyScale = {
  headingFont: '"Space Grotesk", "Inter", "Inter var", system-ui, -apple-system, sans-serif',
  bodyFont: '"Inter", "Inter var", system-ui, -apple-system, sans-serif',
  h1: { size: '2.25rem', lineHeight: '2.75rem', weight: 700 },
  h2: { size: '1.875rem', lineHeight: '2.375rem', weight: 700 },
  h3: { size: '1.5rem', lineHeight: '2rem', weight: 600 },
  h4: { size: '1.25rem', lineHeight: '1.75rem', weight: 600 },
  body: { size: '1rem', lineHeight: '1.625rem', weight: 400 },
  bodyStrong: { size: '1rem', lineHeight: '1.625rem', weight: 600 },
  caption: { size: '0.8125rem', lineHeight: '1.25rem', weight: 500 }
};

export const theme = {
  colors: colorPalette,
  typography: typographyScale
};

type ThemeTarget = HTMLElement | null;

export const applyTheme = (target: ThemeTarget = typeof document !== 'undefined' ? document.documentElement : null) => {
  if (!target) return;

  const setVar = (key: string, value: string | number) => {
    target.style.setProperty(key, String(value));
  };

  // Color variables
  Object.entries(colorPalette).forEach(([name, value]) => {
    setVar(`--color-${name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`, value);
  });

  // Typography variables
  setVar('--font-heading', typographyScale.headingFont);
  setVar('--font-body', typographyScale.bodyFont);

  (['h1', 'h2', 'h3', 'h4', 'body', 'bodyStrong', 'caption'] as const).forEach((key) => {
    const rule = typographyScale[key];
    setVar(`--font-${key}-size`, rule.size);
    setVar(`--font-${key}-line-height`, rule.lineHeight);
    setVar(`--font-${key}-weight`, rule.weight);
  });
};
