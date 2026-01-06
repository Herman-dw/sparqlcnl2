# ARIA- en focusrichtlijnen voor interactieve elementen

1. **Semantiek eerst**: gebruik `<button>`, `<a>`, `<input>` enz. in plaats van `div`/`span`. Vermijd `role="button"` tenzij het element niet anders kan.
2. **Toegankelijke namen**: zorg voor een `aria-label`, `aria-labelledby` of zichtbare tekst die de actie beschrijft (bijvoorbeeld: "Open resultatenfilter"). Vermijd redundante labels.
3. **Rol en status**: gebruik `aria-pressed` voor toggle-knoppen, `aria-expanded` + `aria-controls` voor uitklapbare secties en `role="status"` of `aria-live="polite"` voor niet-blokkerende updates.
4. **Focusvolgorde**: handhaaf de logische tabvolgorde van de DOM. Gebruik `tabIndex` alleen om custom componenten focusable te maken (`tabIndex={0}`) en vermijd positieve waarden.
5. **Focusstijl**: verwijder focus outlines niet. Accentueer focus met een zichtbare rand/outline (bv. `outline: 3px solid #B83207; outline-offset: 3px;`). Zorg dat de focuskleur voldoet aan contrast-eisen tegen de achtergrond.
6. **Toetsenbord interacties**:
   - Knoppen en links reageren op `Enter` en `Space` (indien van toepassing).
   - Custom lijst/selectie: pijltjestoetsen voor navigatie, `Enter`/`Space` voor selectie, `Esc` om dialoog/menus te sluiten.
   - Sluitbare elementen (modals, banners) moeten met `Esc` sluiten en focus terugplaatsen op het trigger-element.
7. **Dialoogvensters**: zet focus op het eerste interactieve element bij openen, houd focus binnen het dialoogvenster (focus trap), en gebruik `aria-modal="true"` plus `role="dialog"` of `role="alertdialog"`.
8. **Status- en foutmeldingen**: gebruik `role="status"` of `role="alert"` voor inline updates. Combineer met duidelijke tekst; verlaat je niet alleen op kleur.
9. **Toggle en switches**: geef `aria-pressed` of `aria-checked` weer; vermeld de huidige status in de tekst (bijvoorbeeld "Notificaties aan").
10. **Snelkoppelingen**: documenteer beschikbare sneltoetsen in tooltips of hulptekst en zorg dat ze niet conflicteren met OS/browser shortcuts.

Pas deze richtlijnen toe in Storybook stories (zie `PaletteStories.stories.tsx`) zodat de voorbeelden toetsenbord- en screenreader-vriendelijk zijn.
