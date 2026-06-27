# Autopilot Design System

## 1. Atmosphere & Identity

Autopilot should feel like a quiet operations console for active repository work. The signature is warm contrast: dark, low-glare surfaces paired with sand-toned text and a restrained amber accent so dense Git activity still reads calm instead of clinical.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | `--color-bg-primary` | `#FFFFFF` | `#000000` | App shell background |
| Surface/secondary | `--color-bg-secondary` | `#FAF9F9` | `rgba(20, 20, 20, 0.9)` | Panels and modal shells |
| Surface/tertiary | `--color-bg-tertiary` | `#F0EFED` | `rgba(26, 26, 26, 0.95)` | Raised cards and controls |
| Surface/hover | `--color-bg-hover` | `#EBEBEB` | `rgba(31, 31, 31, 0.95)` | Hover state |
| Surface/active | `--color-bg-active` | `#EBEBEB` | `rgba(37, 37, 37, 0.95)` | Selected state |
| Text/primary | `--color-text-primary` | `#262521` | `#E8E2D9` | Main copy |
| Text/secondary | `--color-text-secondary` | `rgba(38, 37, 33, 0.70)` | `#A89F91` | Supportive copy |
| Text/tertiary | `--color-text-tertiary` | `rgba(38, 37, 33, 0.55)` | `#6B6358` | Labels and metadata |
| Text/muted | `--color-text-muted` | `rgba(38, 37, 33, 0.38)` | `#4A453D` | Hints and inactive text |
| Border/default | `--color-border-default` | `rgba(221, 220, 216, 1)` | `rgba(42, 42, 42, 0.8)` | Main outlines |
| Border/subtle | `--color-border-subtle` | `rgba(221, 220, 216, 0.8)` | `rgba(31, 31, 31, 0.8)` | Low-contrast dividers |
| Accent/primary | `--color-accent-primary` | `#262521` | `#D4A574` | Primary actions |
| Accent/hover | `--color-accent-hover` | `#000000` | `#E0B585` | Primary action hover |
| Status/error | `--color-semantic-error` | `#DC2626` | `#DC2626` | Error text and outlines |
| Status/success | `--color-semantic-success` | `#22C55E` | `#22C55E` | Success states |
| Status/warning | `--color-semantic-warning` | `#F59E0B` | `#F59E0B` | Caution states |
| Status/info | `--color-semantic-info` | `#3B82F6` | `#3B82F6` | Informational states |

### Rules

- Surfaces step through tonal changes before adding stronger borders.
- Accent color is reserved for active controls, links, and focus treatment.
- New UI should use existing semantic muted backgrounds for inline alerts instead of ad hoc fills.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| H1 | 18px | 600 | 1.3 | 0 | Modal and page titles |
| H2 | 14px | 600 | 1.35 | 0 | Section labels |
| Body | 14px | 400 | 1.5 | 0 | Default text |
| Body/sm | 12px | 400 | 1.45 | 0 | Supporting text |
| Caption | 11px | 500 | 1.35 | 0.04em | Uppercase micro labels |

### Font Stack

- Primary: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif`
- Mono: `"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

### Rules

- Dense product UI defaults to 14px body copy.
- Uppercase labels stay small and use tertiary text color.
- Monospace is reserved for terminal, diff, and code-adjacent data.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of 4px.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight icon alignment |
| `--space-2` | 8px | Compact gaps |
| `--space-3` | 12px | Input padding, inline groups |
| `--space-4` | 16px | Standard component padding |
| `--space-5` | 20px | Larger control groups |
| `--space-6` | 24px | Modal body and card padding |

### Grid

- Max modal width: 800px for settings, 384px for lightweight dialogs
- Sidebar width range: 200px to 480px
- Breakpoints follow Tailwind defaults already in the app

### Rules

- Settings and utility panels prefer stacked cards over wide tables.
- Dense controls can use 12px padding; top-level sections should keep 24px breathing room.

## 5. Components

### Settings cards

- Structure: section heading, support copy, bordered card body
- Variants: informational, editable form, inline alert
- Spacing: `--space-3` inside rows, `--space-6` between sections
- States: default, hover for interactive rows, focus ring for all inputs
- Accessibility: labels remain visible; helper text explains side effects
- Motion: color-only transitions around 200ms

### Repository script editor

- Structure: repository heading, path caption, multiline command field
- Variants: empty, configured
- Spacing: 16px card padding, 12px field spacing
- States: default, focus, disabled
- Accessibility: textarea has a visible label and helper copy naming available env vars
- Motion: none beyond focus/hover transitions

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120ms | ease-out | Checkbox, icon button, press feedback |
| Standard | 200ms | ease-in-out | Dropdowns, panel state changes |

### Rules

- Use color and opacity transitions before adding movement.
- Keep modal and settings changes quiet; no decorative animation in utility flows.
- Focus styles must stay visible in both themes.

## 7. Depth & Surface

### Strategy

Mixed, with tonal shift doing most of the work and borders defining edges.

| Type | Value | Usage |
|------|-------|-------|
| Default | `1px solid var(--color-border-default)` | Cards, modals, inputs |
| Subtle | `1px solid var(--color-border-subtle)` | Nested rows and separators |

Rules:

- Avoid heavy shadows; existing modal shadows are enough for top-layer surfaces.
- Raised controls should look separated by tone first, border second.
