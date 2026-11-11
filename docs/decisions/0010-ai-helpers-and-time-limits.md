# 10. AI helpers that guide, and kind time limits

**Status:** accepted · October 2026

## Context
Three new helpers:
- **Show me how.** The user types what they want ("turn on captions"). Ease points to the right button.
- **Explain simply.** Selected text is explained in small steps, in a way that fits the user's profiles.
- **Time limits.** A daily limit for sites that are hard to stop using (helpful for ADHD).

The first two need a language model. Page text can be private (bank, health, email).

## Decision
- Use Chrome's built-in **Prompt API** (`LanguageModel`). It runs on the user's computer. Same idea as [decision 5](0005-on-device-ai.md).
- One small file, `shared/ai.js`, talks to the API. Content scripts can not use it directly, so they ask the
  background (`aiAsk`). The background uses the API itself, or the hidden helper page if it can not.
- Show me how gets JSON that must match a schema (`responseConstraint`), so Ease never runs free text.
- **Fast by design.** The AI runs in the hidden helper page (it stays open; the service worker does not).
  One warm session per set of rules is kept for 30 minutes, and each request uses a clone.
  Explain simply loads the AI when text is selected, starts the answer when the mouse reaches the button,
  streams the points as they are written, keeps answers, and prepares the next "Even simpler" level quietly.
- **Guide first.** Show me how puts a red outline on the button. A guide pointer glides from the user's
  mouse to it and says "Click here", and a bubble points at it, with the user's goal at the top.
  The user's real mouse is never moved (no extension can do that): the user clicks, or presses
  "Do it for me". It never types for the user. If something (like a pop-up) covers the button, the bubble says so.
- **Works in web apps.** Without AI, it knows where web apps keep things that are not on screen yet:
  "page header" is under the Insert tab (Word), "animation" under Animations (PowerPoint), "sort" under Data (Excel).
  Desktop programs (Word, Oracle) are outside Chrome, so they are out of reach. Their web versions work.
- **Easy to find.** Home has one row for the helpers: Show me how, Explain simply, and Time limits
  (with today's use for the current site).
- **Never auto-click risky buttons.** Buy, pay, delete, send, submit a form, sign in, and similar are blocked.
  The user must click them.
- **Works without AI.** Show me how falls back to simple word matching (one step at a time).
  Explain simply says plainly that it can not run.
- **Time limits are kind, not strict.** Time counts only while the user really uses the site. The cover
  says "you chose this limit". There is one "5 more minutes" a day after a 10-second wait. A caregiver
  can require the PIN. Changing a limit needs My Settings, on purpose (a small pause).

## Why
- Page text never leaves the computer. No backend, no API keys (see [decision 1](0001-no-backend-no-accounts.md)).
- Guiding (not doing) keeps the user in control and teaches them for next time.
- A blocked list of risky actions is simple to test and explain.

## Trade-offs
- The Prompt API needs Chrome 138+, 16 GB RAM (or a GPU with more than 4 GB), and 22 GB free disk.
  It downloads once, and only after a click (My Settings > AI helpers > Set up AI).
- The model writes English, Spanish and Japanese. Other languages are translated after with the Translator API.
- Small models can be wrong. → a footer says so, and money, health or law text gets a warning to check the original.
- Show me how only sees what the page shows. Canvas apps (like Figma's drawing area) have few named buttons.
- Time limits can be bypassed in another browser. They are a helper for the user, not parental control.
