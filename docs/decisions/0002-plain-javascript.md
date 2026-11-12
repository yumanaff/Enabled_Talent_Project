# 2. Plain JavaScript, no framework, no build step

**Status:** accepted · October 2026

## Context
Most of the team knows HTML, CSS and JavaScript, but not React or bundlers.
Chrome extensions load files directly. A content script runs on every website.

## Decision
Plain JavaScript, HTML and CSS. No framework, no bundler, no npm packages in the extension.
One third-party file: Mozilla Readability (Apache 2.0) for Reading View.

## Why
- Everyone on the team can read and change the code.
- Nothing to install to work on it: load the folder in Chrome and reload.
- Small and fast: Ease's scripts load in about 8 ms on a heavy page.
- Fewer dependencies = fewer security updates to chase.

## Trade-offs
- No type checking. → simple naming rules, comments in every file, and many tests.
  (JSDoc types with `tsc --checkJs` would add checking later without a rewrite.)
- The popup UI is built by hand with DOM code instead of components.
