---
name: Website blocker
description: A small local-only Chrome utility using the shared homelab Linear-style theme
---

# Website blocker interface

Built with Svelte 5 and `@kenn-io/kit-ui`, like the other homelab apps (golinks, ciview, things).
`assets/theme.css` and `assets/components.css` are copies of the shared files and must stay
identical to the ones in those apps. App-specific styling lives in `assets/app.css` and component
`<style>` blocks, using theme tokens only. Charcoal (dark) is the default theme, toggled with
`ThemeToggle` and stored in the extension page's localStorage.

- Popup: 360px wide. Status line, current-site card (block button or mode selector), link to settings.
- Options: max 760px. "Sites" panel (rows with mode selector + Remove, add row) and a "Schedule"
  panel (start days, start/end times). Invalid input stays available for correction, and saved
  changes refresh other views without resetting an open schedule draft.
- System fonts and bundled assets only. No remote resources.
