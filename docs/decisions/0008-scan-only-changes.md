# 8. Tools only scan what changed

**Status:** accepted · October 2026

## Context
Some tools read page text: Trigger blur, Pressure remover, Icon names, Page translate.
Websites add content all the time (infinite scroll, comments, live timers).
Our benchmark showed that one new batch of comments made tools re-scan the whole page:
526 ms on a long page. Two tools also forced a full page layout while the page loaded (about 1 second).

## Decision
- The engine records which elements were added or changed, and gives tools only those parts
  through `Ease.engine.roots()`. A full apply still scans the whole page.
- Tools never read layout (`innerText`, sizes) while the page loads. They use `textContent`,
  and measure sizes later with `requestIdleCallback`.

## Why
- New content: 526 ms → 4.5 ms. Start-up with all tools: 1,248 ms → 95 ms.
- The page stays smooth while it loads.

## Trade-offs
- Tools must use `roots()` or `textNodes()` instead of scanning `document.body` directly.
  The template and this record explain it for new tools.
- More than 300 changes at once falls back to a full scan, to stay simple and correct.
