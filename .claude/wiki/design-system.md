# Design System

Everything global lives in one file: **`src/styles.css`**. Component-local
`.css`/`styles: []` only add layout specific to that component — shared
visual language (color, radius, shadow, buttons, cards, form fields) is
never redefined locally. Before adding a new button/card/form style, check
`styles.css` first — it's very likely already there.

## Design tokens (CSS custom properties)

Defined on `:root` (palette-independent constants) and then overridden per
theme:

```css
:root {
  --primary / --primary-hover / --primary-light / --primary-dark / --primary-glow
  --primary-gradient / --primary-gradient-hover
  --radius-sm (8px) / --radius-md (14px) / --radius-lg (20px) / --radius-xl (28px)
  --shadow-sm / --shadow-md / --shadow-lg / --shadow-glow
  --transition-fast (.15s) / --transition-normal (.3s) / --transition-slow (.5s)
  --font-family  /* Inter, loaded from Google Fonts */
}
```

Theme-dependent tokens (`--bg-*`, `--text-*`, `--border-*`, `--glass-*`,
`--error`/`--success`/`--warning`, `--scrollbar-*`) are defined twice, once
under `[data-theme='dark']` and once under `[data-theme='light']` — **dark
is the default** (`html { color-scheme: dark }`), light is the explicit
override. Always reach for a token (`var(--text-secondary)`, etc.) rather
than a literal color, so components stay correct in both themes for free.

## Theming mechanism

`ThemeService` sets the `data-theme` attribute on `<html>` (see
[Features → Theming](./features.md#theming)) — that's the only hook; there
is no `[class]` binding or Angular `@if` involved in switching themes, it's
pure CSS attribute-selector cascading. A component that needs to know the
current theme reactively (rare — most just use CSS vars) reads
`ThemeService.theme()` directly.

## Shared utility classes

These are global and reused across nearly every page — don't recreate them
as component-scoped styles:

- **Buttons**: `.btn` + one of `.btn-primary` / `.btn-secondary` /
  `.btn-google` / `.btn-ghost`; `.btn-full` for 100%-width. Disabled state is
  handled by the `.btn:disabled` selector, not a separate class.
- **Cards**: `.glass-card` — the frosted-glass card look (`backdrop-filter:
  blur`) used for the dashboard welcome card, list rows, empty states, etc.
- **Forms**: `.form-group` / `.form-label` / `.form-input` / `.form-error` /
  `.form-row` (two fields side by side). **`.form-hint` is *not* global** despite
  looking like it — it's duplicated locally in `pages/weights/weights.css` and
  `pages/weeks/weeks.css`. Promote it to `styles.css` if a third page needs it.
- **Page shell**: `.page` (max-width wrapper) / `.page-title` /
  `.page-subtitle` — every routed page (except auth pages, which use
  `AuthLayoutComponent` instead) opens with `<section class="page">`.
- **List pages** (Workouts, Weights, and similarly-shaped future pages):
  `.list-header`, `.list`, `.list-card`, `.list-info`, `.list-name`,
  `.list-meta`, `.list-stats`, `.list-date`, `.list-actions`, `.list-action`
  / `.list-delete` (hover states), `.list-empty`, `.list-loading`. This is
  the single biggest reusable block — a new list-shaped page should compose
  these rather than inventing new class names.
- **Modals**: `.modal-overlay` / `.modal-content` / `.modal-header` /
  `.modal-close` — used by `ModalComponent` and also hand-rolled once
  (Login's password-reset modal doesn't use `ModalComponent`, it duplicates
  the same classes inline — worth reusing `ModalComponent` there if that
  code is touched again).
- **Settings rows**: `.setting-item` / `.setting-label` / `.setting-icon` /
  `.theme-switch` / `.switch-knob` — shared between the Settings page and
  `ThemeToggleComponent`.
- **Toast**: `.toast` + `.visible` / `.success` / `.error`.
- **Segmented control**: `.segmented` + `.segmented button.active` — a small set of
  mutually exclusive options. Shared by the Settings unit toggle and the Analytics
  range selector. Prefer it over a `<select>` for ≤ 5 options worth seeing at a glance.
- **Screen-reader only**: `.sr-only` — visually hidden, still in the accessibility
  tree. Used for the chart's table twin (see Charts below).
- **Misc**: `.divider` (the "or continue with" style rule), `.spinner`
  (loading spinner, used both standalone and inside disabled buttons),
  `.text-muted`/`.text-center`, `.mt-1`…`.mt-3`/`.mb-1`…`.mb-3` spacing
  utilities.

## Charts

Chart colours are the one part of the design system that does **not** live in CSS.
`CHART_PALETTE` in `components/charts/chart-palette.ts` defines them in TypeScript,
keyed by theme, and `ChartThemeService.palette()` exposes them as a computed signal.

Two reasons, both load-bearing:

1. Chart.js renders to a `<canvas>`, which **cannot read CSS custom properties**.
2. The obvious workaround — `getComputedStyle(document.documentElement)` on theme
   change — races `ThemeService`, which sets `data-theme` inside an `effect()`.
   Effect-vs-computed ordering across injectors isn't guaranteed, so the palette can
   read the *previous* theme's values. That's a correctness bug, not a style nit.

The values mirror `styles.css` tokens. **There is no automatic link — change a token
there and you must change it here too.** Legend swatches bind from the same object, so
the TS palette stays the single source of truth for anything chart-shaped.

### Emphasis, not categories

The burndown's four marks are all the same measure (body weight) differently derived,
so they're encoded with **one accent hue plus gray**, varied by dash, opacity and mark
type — not four hues. The app's palette has exactly one accent (purple 270°) plus
semantic `--error`/`--success`/`--warning`, and that's sufficient here.

**There is deliberately no categorical series scale yet.** Build one when a genuinely
categorical analytic lands (volume per muscle group), and validate it for
colour-vision deficiency at that point — don't invent one speculatively.

Other chart rules worth not relearning: gridlines and axes are **solid** hairlines
(dashing means "projection" on these charts); the y-axis is **not** zero-based (length
doesn't encode magnitude on a line, and a 0-based axis flattens every real bodyweight
change into noise); a toned `StatTileComponent` always ships an arrow + words, never
colour alone; and every chart carries an `.sr-only` table twin, because a canvas is
opaque to assistive tech and a tooltip must never be the only way to read a value.

## Component styling convention

- Small, purely presentational components (`ModalComponent`,
  `ThemeToggleComponent`, `BrandLogoComponent`, `GoogleButtonComponent`,
  `ToastComponent`, `ChangelogEntryComponent`) use an **inline `template` +
  `styles: []`** in the `@Component` decorator — no separate `.html`/`.css`
  files.
- Larger, page-level or form-heavy components (`WeeksComponent`,
  `SettingsComponent`, `WorkoutFormModalComponent`, every page) use
  **`templateUrl` + `styleUrl`** pointing at sibling `.html`/`.css` files.
- All inputs/outputs use the signal APIs — `input()`, `input.required<T>()`,
  `output<T>()`, `model()` — never the `@Input()`/`@Output()` decorators.
- SVG icons are inlined directly in templates (stroke-based, `currentColor`,
  `stroke-width="2"` or `2.5`), not an icon font or sprite sheet — there's no
  shared icon component. Copy an existing inline SVG when you need a new
  icon rather than introducing a new icon system.
