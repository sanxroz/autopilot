# Autopilot Design System

## 1. Atmosphere & Identity

Autopilot should feel like a focused operator console: quiet, dense, and deliberate. The right sidebar should read as precise, calm, and inspection-friendly rather than playful or glossy. The signature is warm monochrome contrast, where dark and light tonal layers carry most of the hierarchy and the sand-toned accent appears only when the UI needs to guide attention or confirm agency.

### Keywords

- quiet confidence
- forensic clarity
- restrained emphasis
- tactile, not decorative

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | `--color-bg-primary` | `#FFFFFF` | `#000000` | App frame, main background |
| Surface/secondary | `--color-bg-secondary` | `#FAF9F9` | `rgba(20, 20, 20, 0.9)` | Panels, cards |
| Surface/tertiary | `--color-bg-tertiary` | `#F0EFED` | `rgba(26, 26, 26, 0.95)` | Elevated surfaces, tab rails |
| Surface/hover | `--color-bg-hover` | `#EBEBEB` | `rgba(31, 31, 31, 0.95)` | Hover states |
| Surface/active | `--color-bg-active` | `#EBEBEB` | `rgba(37, 37, 37, 0.95)` | Selected states |
| Surface/solid | `--color-bg-solid` | `#F2F1ED` | `#0D0D0D` | Solid overlays |
| Text/primary | `--color-text-primary` | `#262521` | `#E8E2D9` | Headings, active labels |
| Text/secondary | `--color-text-secondary` | `rgba(38, 37, 33, 0.70)` | `#A89F91` | Body, inactive labels |
| Text/tertiary | `--color-text-tertiary` | `rgba(38, 37, 33, 0.55)` | `#6B6358` | Metadata, icons |
| Text/muted | `--color-text-muted` | `rgba(38, 37, 33, 0.38)` | `#4A453D` | Disabled states, hints |
| Border/subtle | `--color-border-subtle` | `rgba(221, 220, 216, 0.8)` | `rgba(31, 31, 31, 0.8)` | Soft separators |
| Border/default | `--color-border-default` | `rgba(221, 220, 216, 1)` | `rgba(42, 42, 42, 0.8)` | Standard outlines |
| Border/strong | `--color-border-strong` | `rgba(200, 199, 195, 1)` | `rgba(51, 51, 51, 0.9)` | Resize handles, stronger dividers |
| Accent/primary | `--color-accent-primary` | `#262521` | `#D4A574` | Primary emphasis, active affordances |
| Accent/secondary | `--color-accent-secondary` | `rgba(38, 37, 33, 0.85)` | `#C9956B` | Secondary emphasis |
| Accent/hover | `--color-accent-hover` | `#000000` | `#E0B585` | Accent hover state |
| Status/success | `--color-semantic-success` | `#22C55E` | `#22C55E` | Successful actions |
| Status/warning | `--color-semantic-warning` | `#F59E0B` | `#F59E0B` | Warnings |
| Status/error | `--color-semantic-error` | `#DC2626` | `#DC2626` | Errors, destructive actions |
| Status/info | `--color-semantic-info` | `#3B82F6` | `#3B82F6` | Informational UI |

### Rules

- Use accent color for active state, focus, or action only. Never for decorative fills.
- Surface separation should come from tonal shifts first and borders second.
- New colors must be added here before they appear in code.
- Status color appears as a controlled accent, never as a full saturated background.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| H1 | 30px / 1.875rem | 700 | 1.2 | -0.02em | Modal titles, major headings |
| H2 | 23px / 1.4375rem | 600 | 1.25 | -0.015em | Section headers |
| H3 | 19px / 1.1875rem | 600 | 1.3 | -0.01em | Panel titles |
| Body/lg | 16px / 1rem | 400 | 1.6 | 0 | Primary body copy |
| Body | 14px / 0.875rem | 400 | 1.55 | 0 | Default UI copy |
| Body/sm | 13px / 0.8125rem | 400 | 1.5 | 0 | Dense panel content |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0.02em | Metadata, labels |
| Micro | 11px / 0.6875rem | 600 | 1.3 | 0.06em | Overlines, badges |

### Font Stack

- Primary: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif`
- Mono: `"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

### Rules

- Body copy never drops below 13px inside dense panels.
- Mono is reserved for terminal content, code, and user-authored markdown input.
- Uppercase labels use micro size with added tracking rather than heavier weight.
- Machine-like values such as durations or step counts should use mono for quick scanning.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of 4px.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight icon gaps |
| `--space-2` | 8px | Compact inline groups |
| `--space-3` | 12px | Dense control padding |
| `--space-4` | 16px | Standard panel spacing |
| `--space-5` | 20px | Comfortable inner spacing |
| `--space-6` | 24px | Section spacing |
| `--space-8` | 32px | Larger separations |

### Grid

- App layout: fixed top bar plus left sidebar, center workspace, and optional right panel
- Right panel width: 300px minimum, 450px default, 800px maximum
- Breakpoints: `sm 640px`, `md 768px`, `lg 1024px`, `xl 1280px`

### Rules

- Dense controls should align to 35px header rows and 32px segmented rails where already established.
- New layout values should stay on the 4px grid.
- Vertical rhythm inside panels should be compact by default and open up only for content-heavy sections.
- Compact surfaces use 8px and 12px padding, while grouped panels use 16px padding.

## 5. Components

### App Header

- Structure: left utility toggle, centered branch/worktree identity, right utility toggles
- Spacing: `--space-2` and `--space-3`
- States: default, hover, active
- Accessibility: buttons require `aria-label`
- Motion: subtle scale on hover/tap only

### Segmented Tab Rail

- Structure: rounded container with sliding active indicator and icon-only tab triggers
- Spacing: 32px height with 3px inset padding
- States: default, hover, active, focus
- Accessibility: keyboard navigable through Radix Tabs
- Motion: 150-200ms horizontal indicator slide

### Right Sidebar Panel

- Structure: 35px header, optional action controls, scrollable content body
- Spacing: 12px to 16px content padding
- States: empty, loading, error, active content
- Accessibility: content areas keep visible focus and readable contrast
- Motion: panel enters from the right with standard timing

### Markdown Workspace

- Structure: single editor region inside the right sidebar panel
- Spacing: 12px editor padding, 16px section padding
- States: empty placeholder, editing
- Accessibility: textarea labels are explicit and the editor preserves text selection
- Motion: none beyond standard tab transitions

### Checks Surfaces

- Shell: panel background
- Module: grouped areas like overview, deployments, checks
- Inset: expanded internals like logs and job steps

Rules:
- Module surfaces use subtle tonal separation, not heavy borders everywhere.
- Insets can use stronger borders and denser backgrounds.
- Large rounded rectangles are preferred over many tiny pills.

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
- Motion: none beyond focus and hover transitions

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100-150ms | `ease-out` | Hover, press feedback |
| Standard | 150-250ms | `cubic-bezier(0.215, 0.61, 0.355, 1)` | Tab switches, panel transitions |
| Emphasis | 250-350ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Larger panel reveals |

### Rules

- Animate `transform` and `opacity` only.
- Respect reduced-motion settings by removing non-essential translation.
- State changes should feel immediate; motion is for continuity, not decoration.
- Expansion affordances should rotate or fade in under 200ms.
- Avoid bouncing, springy, or decorative motion in the right sidebar.

## 7. Depth & Surface

### Strategy

`mixed`

Primary depth comes from tonal shifts plus hairline borders. Shadows stay minimal and are reserved for floating indicators or modal surfaces.

| Type | Value | Usage |
|------|-------|-------|
| Border/subtle | `1px solid var(--color-border-subtle)` | Low-emphasis separators |
| Border/default | `1px solid var(--color-border-default)` | Panels and containers |
| Shadow/subtle | `0 1px 2px rgb(0 0 0 / 0.05)` | Sliding tab indicator, light elevated detail |

### Rules

- Avoid heavy shadow stacks in the main workspace.
- Prefer tonal surfaces plus borders for hierarchy inside sidebars and panels.

## 8. Content & Accessibility

- Prefer direct language such as `failed`, `running`, and `ready to merge`.
- Keep status labels short and avoid decorative filler copy.
- Every actionable control needs visible hover and focus treatment.
- Color is never the only state indicator.
- Dense metadata must keep sufficient contrast against the surface.
