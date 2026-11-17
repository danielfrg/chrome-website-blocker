---
name: Website blocker
description: A small local-only Chrome utility using the shared Cadence theme
---

# Website blocker interface

Built with Svelte 5 and `@ui-sdk/svelte` (pinned exact, with `@ui-sdk/core`).
The look is the shared Cadence theme, synced into `src/design-system/` (`theme/` and the
`theme-toggle` component). That folder is never edited by hand: change it in the design-system repo
and run `pnpm sync` there. `src/app.css` starts with `@layer ui-sdk;` and holds only layout and
extension-specific pieces; it may adjust a control's layout, never its look, and uses tokens
(`--ink`, `--muted`, `--line`, `--space-*`). Style custom wrappers with a class, not `data-slot`.
Dark is the default; a saved light, dark or system choice wins (shared `color-scheme` localStorage
key, applied in `lib/boot.ts` because extension pages allow no inline script).

- Popup: 360px wide. Status line, current-site card (block button or mode selector), link to settings.
- Options: max 760px. "Sites" panel (rows with mode selector + Remove, add row) and a "Schedule"
  panel (start days, start/end times). Invalid input stays available for correction, and saved
  changes refresh other views without resetting an open schedule draft.
- System fonts and bundled assets only. No remote resources.
