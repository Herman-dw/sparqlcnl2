import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { palette, textColors } from './newPalette';

type ButtonTone = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger';

const buttonStyles: Record<ButtonTone, React.CSSProperties> = {
  primary: { backgroundColor: palette.primary, color: textColors.onDark },
  secondary: { backgroundColor: palette.secondary, color: textColors.onDark },
  accent: { backgroundColor: palette.accent, color: textColors.onDark },
  success: { backgroundColor: palette.success, color: textColors.onDark },
  warning: { backgroundColor: palette.warning, color: textColors.onDark },
  danger: { backgroundColor: palette.danger, color: textColors.onDark }
};

const PaletteButton: React.FC<{ tone: ButtonTone; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  tone,
  label,
  ...props
}) => (
  <button
    {...props}
    aria-pressed={props['aria-pressed']}
    style={{
      ...buttonStyles[tone],
      padding: '12px 16px',
      fontWeight: 700,
      borderRadius: '12px',
      border: 'none',
      cursor: 'pointer',
      outlineOffset: '4px',
      outlineColor: palette.accent
    }}
  >
    {label}
  </button>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <article
    aria-label={title}
    style={{
      background: palette.surface,
      color: textColors.onLight,
      borderRadius: '16px',
      border: `1px solid ${palette.mutedSurface}`,
      padding: '16px',
      boxShadow: '0 14px 30px rgba(11, 16, 33, 0.12)'
    }}
  >
    <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>{title}</h3>
    <p style={{ margin: 0, color: textColors.subtle }}>{children}</p>
  </article>
);

const Alert: React.FC<{ tone: ButtonTone; message: string; description: string }> = ({ tone, message, description }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
      background: palette[tone],
      color: textColors.onDark,
      padding: '14px 16px',
      borderRadius: '14px'
    }}
  >
    <span aria-hidden>⚑</span>
    <div>
      <div style={{ fontWeight: 700 }}>{message}</div>
      <div style={{ opacity: 0.9 }}>{description}</div>
    </div>
  </div>
);

const meta = {
  title: 'Foundations/New Palette',
  component: PaletteButton,
  parameters: {
    layout: 'centered',
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/placeholder/palette'
    }
  }
} satisfies Meta<typeof PaletteButton>;

type Story = StoryObj<typeof meta>;

export default meta;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      <PaletteButton tone="primary" label="Primair actie" />
      <PaletteButton tone="secondary" label="Secundair" />
      <PaletteButton tone="accent" label="Uitgelicht" aria-pressed="true" />
      <PaletteButton tone="success" label="Bevestigen" />
      <PaletteButton tone="warning" label="Waarschuwing" />
      <PaletteButton tone="danger" label="Verwijderen" />
    </div>
  )
};

export const Cards: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <Card title="Surface card">Gebruik `surface` met donkere tekst voor leesbare panelen.</Card>
      <Card title="Neutral header">
        Neutral en accent kleuren werken samen voor navigatiebalken en call-to-action randen.
      </Card>
    </div>
  )
};

export const Alerts: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: '12px' }}>
      <Alert tone="success" message="Actie voltooid" description="De flow is zonder fouten afgerond." />
      <Alert tone="warning" message="Let op" description="Deze bewerking heeft impact op bestaande resultaten." />
      <Alert tone="danger" message="Mislukt" description="Controleer de invoer en probeer opnieuw." />
    </div>
  )
};
