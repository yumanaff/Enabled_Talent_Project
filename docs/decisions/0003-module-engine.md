# 3. A module engine with apply and remove

**Status:** accepted · October 2026

## Context
Ease has 35 tools. Each one can be turned on, changed, or turned off at any time, on any website.
Websites are unpredictable: a tool can fail on one site.

## Decision
Every tool is one file that calls `Ease.engine.register({ id, observe, apply, remove })`.
The engine applies all tools when settings change, and runs `observe` tools again when new content loads.

## Why
- **Fault isolation.** Each tool runs inside `try/catch`. One broken tool can not break the page or the others.
- **Undo is required.** Every tool must clean up after itself, so "turn off on this site" always works.
- **Easy to add a tool.** Copy `_template.js`, write `apply` and `remove`, add one line to the manifest.
- **Shared helpers.** One place for styles, combined filters, text scanning and "Hidden · Show" chips.

## Trade-offs
- Tools that change the same thing can fight. → shared helpers (like combined `filter`) and clear rules in each file.
