# Contrast-check: nieuw palette

Gecontroleerd met WCAG AA (normale tekst, ratio ≥ 4.5). Voor elke tint staat de geteste tekstkleur en de berekende contrastverhouding. Aanbevolen combinaties voldoen aan AA.

| Token (achtergrond) | Tekstkleur | Ratio | Resultaat |
| --- | --- | --- | --- |
| `primary` (#0F4C81) | wit (#FFFFFF) | 8.86 | ✅ AA/AAA
| `secondary` (#1E6F5C) | wit (#FFFFFF) | 6.03 | ✅ AA/AAA
| `accent` (#B83207) | wit (#FFFFFF) | 6.00 | ✅ AA/AAA
| `success` (#1D713D) | wit (#FFFFFF) | 6.03 | ✅ AA/AAA
| `warning` (#B85C00) | wit (#FFFFFF) | 4.60 | ✅ AA (grens), ⚠️ AAA
| `danger` (#A4161A) | wit (#FFFFFF) | 7.75 | ✅ AA/AAA
| `neutral` (#0B1021) | wit (#FFFFFF) | 18.91 | ✅ AA/AAA
| `surface` (#F5F7FA) | inkt (#0B1021) | 17.62 | ✅ AA/AAA

> Niet aanbevolen: donkere tekst op de gekleurde tokens (ratio 2–4), witte tekst op `surface` (1.07) en inkt op `neutral` (1.00). Gebruik voor badge-varianten eventueel grotere tekst (≥18px/14px bold) om aan AA-large te voldoen als kleurcontrast lager is.

## Meetmethode

Contrast berekend met een Node-script (`luminance` + `contrast` uit WCAG 2.1 formule). Zie `examples/newPalette.ts` voor de bronwaarden.
