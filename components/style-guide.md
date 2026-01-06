# Component Style Guide

Deze gids beschrijft componentregels en herbruikbare tokens voor buttons, links, cards, inputs en alerts. Gebruik de tokens als CSS-variabelen of themewaarden zodat stijlen consistent blijven.

## Kleurpalet
- **Primary:** `#3b82f6` (hover: `#2563eb`, focus ring: `#1d4ed8`)
- **Accent / Secondary:** `#8b5cf6` (hover: `#7c3aed`)
- **Neutral:** `#0f172a` (koppen), `#1e293b` (body), `#e2e8f0` (oppervlak licht), `#cbd5e1` (borders)
- **Success:** `#22c55e`
- **Warning:** `#eab308`
- **Danger:** `#ef4444`
- **Info:** `#06b6d4`
- **Disabled:** `#94a3b8` tekst, `#e2e8f0` achtergrond

## Tokens
Gebruik consistent per component en definieer bijvoorbeeld als `--space-md` of `theme.spacing.md`.

### Spacing & Padding
- `pad-sm`: `8px 12px`
- `pad-md`: `12px 16px`
- `pad-lg`: `16px 20px`

### Radii
- `radius-sm`: `4px`
- `radius-md`: `8px`
- `radius-round`: `999px` (pill)

### Border Width
- `border-hairline`: `1px`
- `border-strong`: `2px`

### Shadow
- `shadow-soft`: `0 1px 3px rgba(15, 23, 42, 0.12)`
- `shadow-card`: `0 8px 24px rgba(15, 23, 42, 0.12)`
- `shadow-elevated`: `0 12px 32px rgba(15, 23, 42, 0.16)`

### Focus Ring
- `focus-ring`: `0 0 0 3px rgba(37, 99, 235, 0.35)` (combineer met basisborder in primaire kleur)

## Buttons
- **Layout:** radius `radius-md`, padding `pad-sm` (compact) of `pad-md` (default), border `border-hairline` in varianten.
- **Primary:** achtergrond `Primary`, tekst `#ffffff`, border `Primary`.
  - Hover: achtergrond `#2563eb`, shadow `shadow-soft`.
  - Focus: ring `focus-ring`, border `#1d4ed8`.
  - Disabled: tekst `#ffffff`, achtergrond `Disabled`, border `Disabled`, geen shadow.
- **Secondary:** achtergrond `#ffffff`, tekst `Primary`, border `#cbd5e1`.
  - Hover: achtergrond `#e2e8f0`, tekst `#1d4ed8`.
  - Focus: ring `focus-ring`.
  - Disabled: tekst `Disabled`, achtergrond `#f8fafc`, border `#e2e8f0`.
- **Ghost / Text:** transparant, tekst `Primary`.
  - Hover: achtergrond `rgba(59, 130, 246, 0.08)`.
  - Focus: ring `focus-ring`.
  - Disabled: tekst `Disabled`, geen hover-effect.

## Links
- **Default:** kleur `Primary`, underline bij hover, font-weight medium.
- Hover: kleur `#2563eb`.
- Focus: ring `focus-ring` of underline plus outline `1px solid #1d4ed8`.
- Visited: kleur `#7c3aed` (Accent) optioneel.
- Disabled/Muted: kleur `Disabled`, geen hover/underline.

## Cards
- **Container:** achtergrond `#ffffff`, tekst `#1e293b`, radius `radius-md`, border `border-hairline` in `#e2e8f0`, shadow `shadow-card`, padding `pad-lg`.
- Hover: shadow `shadow-elevated`, optioneel translateY(-2px).
- Focus (bij focusable cards): ring `focus-ring`, border `#2563eb`.
- Disabled: achtergrond `#f8fafc`, tekst `Disabled`, shadow verwijderd.

## Inputs (Text/Select/Textarea)
- **Base:** achtergrond `#ffffff`, tekst `#0f172a`, placeholder `#94a3b8`, border `border-hairline` in `#cbd5e1`, radius `radius-sm`, padding `pad-sm` verticaal compact.
- Hover: border `#94a3b8`.
- Focus: border `Primary`, ring `focus-ring`.
- Disabled/Readonly: achtergrond `#f8fafc`, tekst `Disabled`, border `#e2e8f0`, geen shadow.
- Error-state: border en focus-ring `Danger` (`#ef4444`), helper-tekst `Danger`.

## Alerts
Gebruik layout met `radius-md`, padding `pad-md`, icon links en sterke koptekst.

- **Info:** achtergrond `rgba(6, 182, 212, 0.1)`, tekst `#0f172a`, border `border-hairline` in `#06b6d4`.
- **Success:** achtergrond `rgba(34, 197, 94, 0.1)`, tekst `#0f172a`, border `#22c55e`.
- **Warning:** achtergrond `rgba(234, 179, 8, 0.12)`, tekst `#0f172a`, border `#eab308`.
- **Danger:** achtergrond `rgba(239, 68, 68, 0.1)`, tekst `#0f172a`, border `#ef4444`.
- Hover (dismissable alerts): licht donkerder achtergrond (10–15% meer opacity), cursor pointer voor header of close-icoon.
- Focus (voor focusable container): ring `focus-ring`.

## States samengevat
- **Hover:** maak kleur donkerder (`Primary` → `#2563eb`, `Accent` → `#7c3aed`), voeg `shadow-soft` toe bij buttons/cards.
- **Focus:** gebruik `focus-ring` en accentueer border met `Primary` of kleur van variant.
- **Disabled:** verminder contrast (`Disabled`-tekst), gebruik `#e2e8f0` achtergrond en verwijder shadow/hover.
