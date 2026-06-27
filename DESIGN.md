# Design System

## 1. Product feeling

Autopilot should feel like a control room, not a generic dashboard. The right sidebar is dense and operational, so the UI should read as precise, calm, and inspection-friendly rather than playful or glossy.

Keywords:
- quiet confidence
- forensic clarity
- restrained emphasis
- tactile, not decorative

## 2. Foundations

### Color

Use the existing semantic and surface tokens already defined in the app:
- `bg-primary`, `bg-secondary`, `bg-tertiary`
- `text-primary`, `text-secondary`, `text-tertiary`
- `text-semantic-success`, `text-semantic-warning`, `text-semantic-error`
- matching semantic muted backgrounds for status emphasis

Rules:
- status color appears as a controlled accent, never as a full saturated background
- neutral surfaces should do most of the work
- bordered containers should feel like instrumentation panels, not cards in a marketing page

### Typography

Use the app’s existing type stack, but create stronger hierarchy through weight and spacing:
- section labels: `text-[11px]`, uppercase, tracked
- entity labels: `text-sm` to `text-[15px]`, medium or semibold
- metadata: `text-xs`
- machine-like values such as durations or step counts should use monospace

### Spacing

Base rhythm is 4px.

Rules:
- compact surfaces use 8px and 12px padding
- primary grouped panels use 16px padding
- vertical stacking between related blocks should be 8px
- vertical stacking between separate sections should be 16px

## 3. Surfaces

The checks tab uses three surface levels:
- shell: the panel background
- module: grouped areas like overview, deployments, checks
- inset: expanded internals like logs and job steps

Rules:
- module surfaces use subtle tonal separation, not heavy borders everywhere
- insets can use stronger borders and darker/denser backgrounds
- large rounded rectangles are preferred over many tiny pills

## 4. Motion

Motion should communicate reveal and inspection state only.

Rules:
- expansion affordances rotate or fade in under 200ms
- hover states can shift background and border subtly
- no bouncing, springy, or decorative motion in the right sidebar

## 5. Components

### Overview block

Shows mergeability and check totals as a compact operations summary.

Rules:
- merge state is the lead signal
- check counts appear as compact stat tiles, not badges

### Check row

Represents one external system report.

Rules:
- row header must be scannable collapsed
- expanded state must expose all actionable details without leaving the panel
- failed outputs must be copyable directly

### Step list

Represents ordered execution detail for a job.

Rules:
- use a vertical rhythm with a clear left alignment
- each step shows name, outcome, and duration without visual clutter

## 6. Content rules

- prefer direct language: `failed`, `running`, `ready to merge`
- keep status labels short
- avoid decorative filler copy

## 7. Accessibility

- every actionable control needs visible hover and focus treatment
- color is never the only state indicator
- dense metadata must keep sufficient contrast against the surface
