# 5. On-device AI, and a bridge to the page's world

**Status:** accepted · October 2026

## Context
Users want websites in their language, and short summaries. Cloud AI would send page text
(maybe health or bank pages) to a server, and needs a backend and API keys.

## Decision
Use Chrome's built-in **Translator** and **Summarizer** APIs, which run on the user's computer.
The Translator API lives in the page's main JavaScript world, so a small bridge
(`translate-bridge.js`, `"world": "MAIN"`) talks to Ease's isolated content scripts with `postMessage`.

## Why
- Page text never leaves the computer.
- Free: no API keys, no server costs.
- Works offline once the language or model is downloaded.

## Trade-offs
- Chrome must download each language once, and only after a click. → Ease starts the download on clicks
  the user already makes (choosing a language, any click on the page).
- Some languages (Punjabi, Tagalog) are not supported yet. → a clearly labelled Google Translate link.
- The Summarizer needs a strong computer. → a plain message on weaker computers.
- The bridge runs in the page's world, so it only accepts Ease's own message types.
