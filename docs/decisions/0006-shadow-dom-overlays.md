# 6. Shadow DOM for everything Ease adds to a page

**Status:** accepted · October 2026

## Context
Ease adds boxes to websites: the translate bar, scam warnings, Safe links notes, scroll buttons,
tooltips, the form restore bar. Website CSS is unpredictable. A rule like `div { display: none }`
or `button { color: white }` could break our boxes, and our CSS could break the website.

## Decision
Every box Ease adds is a host element with an **open Shadow DOM**, its own `<style>`, and a fixed position.
Hosts use ids that start with `ease-`, so tools can skip them.

## Why
- Website CSS can not reach inside, and our CSS can not leak out.
- Boxes look the same on every website.
- Screen readers still read them (we use roles like `status`, `alert` and `alertdialog`).
- The accessibility audit checks inside Shadow DOM too: 0 problems.

## Trade-offs
- Reading View is the exception: it is normal page content, so the user's other tools
  (font, spacing, contrast, Read aloud, translation) work inside it.
