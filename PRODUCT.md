# Website blocker

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Chrome Manifest V3 built with WXT, Svelte 5 and kit-ui (shared theme). Background service worker is plain JavaScript with no UI dependencies.

## Users

The user wants to block distracting websites in Chrome continuously or on a weekly schedule.

## Product Purpose

Simple website blocking with no tracking or sync. Success is adding a domain and having subsequent visits blocked during the chosen hours.

## Capabilities and Constraints

One site table with an independent Block, Schedule, or Unblocked selector per site; one shared weekly schedule including overnight ranges. Configuration stays in local extension storage. No browsing-history collection, accounts, servers, remote assets or analytics. System fonts and bundled assets, accessible controls.

## Product Principles

- Keep actions direct and settings easy to inspect.
- Store only the configuration needed for blocking.
- Explain current blocking status and errors truthfully.
- Keep permissions and code small.
