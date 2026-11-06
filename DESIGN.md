---
name: SiteBlocker
description: A small local-only Chrome utility
colors:
  canvas: "#f7f8f5"
  surface: "#ffffff"
  ink: "#192c25"
  muted: "#526159"
  primary: "#245c42"
  primary-hover: "#1a4933"
  line: "#d9e0d8"
  tint: "#e9f0e8"
  error: "#9c302b"
  input-border: "#aebcb2"
  selection: "#d0e5d5"
typography:
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  compact-title:
    fontSize: "23px"
  popup-title:
    fontSize: "19px"
  label:
    fontSize: "13px"
  footnote:
    fontSize: "12px"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "8px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
---

# SiteBlocker interface

## Overview

The approved scope is a simple utility, using bundled system fonts and native form semantics. Operate mode: quick actions in a compact popup, full configuration in one settings page.

## Colors

Use a warm neutral canvas (#f7f8f5), white form surfaces, dark forest text (#192c25), muted readable text (#526159), and a restrained deep green action color (#245c42). Hairline separators organize lists without nested cards. Use system UI typography at 15px with 1.5 line height, 26px settings heading, and tabular schedule numerals. Spacing follows 4/8/12/16/24/32px increments. Controls use 8px corners and at least 40px hit targets. Error text uses #9c302b. Focus rings use the action green with an offset. A status dot always accompanies explicit text. No remote fonts, decorative imagery, animation, or external assets.

## Layout

Popup width is 360px. Options content is at most 760px wide and collapses to the available window width. Sites use a single table with per-row mode selects, a Remove action, and an add row. Schedule is an always-visible section beneath the table. Weekly days use labeled checkboxes. The table has an empty state. Keep invalid user input available for correction. A saved change refreshes other extension views without resetting an open schedule draft.
