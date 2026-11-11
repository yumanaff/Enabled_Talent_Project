# Ease performance

Ease runs on every website, so it must stay fast. We measure it with a benchmark in
`tests/performance` (Playwright + Chromium). Every number is the median of several runs.

## Test page

A generated page like a long Wikipedia article: 600 paragraphs (about 36,000 words),
3,000 links, 60 icon buttons, 80 images, tables and a form (322 KB of HTML).

## What we measure

| Measure | What it means |
|---|---|
| Load Ease's scripts | Time to run all of Ease's files when a page opens |
| Apply all tools at start | Time all tools take to set up on the page |
| 100 new paragraphs | Time to handle new content (like infinite scroll or new comments) |
| Page blocked | Extra "long tasks" (over 50 ms) the browser has while Ease changes the page, compared with the same page without Ease |
| Memory | JavaScript memory Ease uses |

## Results: all 35 tools on

| Measure | Before | After |
|---|---|---|
| Load Ease's scripts | 8 ms | 8 ms |
| Apply all tools at start | **1,248 ms** | **95 ms** (13x faster) |
| 100 new paragraphs | **526 ms** | **4.5 ms** (over 100x faster) |
| Page blocked (extra) | over 3,000 ms | **496 ms** |
| Memory | 2.4 MB | 3.0 MB |

## Results: one profile (how most people use Ease)

| Profile | Extra page blocking |
|---|---|
| Steady hands | 0 ms |
| Focus support (ADHD) | 58 ms |
| Seizure safe | 61 ms |
| Older adults | 132 ms |
| Readable text (dyslexia) | 217 ms (the browser re-draws 36,000 words in a new font and spacing) |

## What we fixed

1. **The engine now tells tools what changed.** Before, every change on the page (one new comment)
   made Trigger blur, Pressure remover and Icon names scan the whole page again.
   Now they scan only the new parts. (`Ease.engine.roots()` in `content/engine.js`)
2. **No forced page layout while the page loads.** Hide pop-ups and Icon names read `innerText`
   and element sizes, which makes the browser lay out the whole page right away (about 1 second on this page).
   They now use `textContent` (cheap) and measure sizes later, when the browser is idle (`requestIdleCallback`).
3. **Pressure remover reads each element's text only once per scan**, and skips big containers
   (like the whole article) that can never be a "Only 2 left!" badge.
4. **Pause animations bug.** It set every transition to 0.001 s instead of 0 s. That turned every later
   style change (a new font, new colours) into a tiny animation on every element: over 1.1 seconds of
   extra work on this page when combined with text tools. Transitions are now 0 s.

## Run it

```
cd tests/performance
npm install
npx playwright install chromium   # first time only
npm run bench                      # all tools on
node per-tool.js                   # each tool alone (finds slow tools)
```
