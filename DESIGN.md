---
name: Website blocker
description: A small local-only Chrome utility using the shared theme
---

# Website blocker interface

Built with Svelte 5 and `@kenn-io/kit-ui`.
Theme and component styles come from the shared design system. Component
`<style>` blocks use theme tokens only. Charcoal (dark) is the default theme, toggled with
`ThemeToggle` and stored in the extension page's localStorage.

- Popup: 360px wide. Status line, current-site card (block button or mode selector), link to settings.
- Options: max 760px. "Sites" panel (rows with mode selector + Remove, add row) and a "Schedule"
  panel (start days, start/end times). Invalid input stays available for correction, and saved
  changes refresh other views without resetting an open schedule draft.
- System fonts and bundled assets only. No remote resources.
