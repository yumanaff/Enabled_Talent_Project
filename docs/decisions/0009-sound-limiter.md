# 9. A real sound limiter with tab capture

**Status:** accepted · October 2026

## Context
"Maximum volume" turns down `<video>` and `<audio>` elements on the page.
Testing showed three problems:
- Even at the lowest level, sound was too loud when the laptop volume was at full.
- It does not reach sound made with the Web Audio API (many games and some players).
- It does not stop sudden loud parts (an ad, a scream). Those hurt most for autism, migraine and PTSD.

A browser extension can not read or change the computer's own volume. So a true cap on the speakers is not possible.
A compressor inside the page does not work either: Chrome makes sound from other websites silent when a page script processes it.

## Decision
- The user presses "Limit" on Home while a tab plays sound.
- The popup gets a stream id with `chrome.tabCapture` (Chrome needs the user's click for this).
- A hidden offscreen page (`offscreen/sound.js`) plays the tab's sound through our own peak limiter (`limiter-worklet.js`).
- The limiter has a ceiling of -12 dB. Its envelope jumps up at once, so no sample gets past the ceiling. It falls back over 0.3 seconds, so the sound does not "pump".
- After the limiter, the level (A bit quieter ... Very quiet) turns everything down.
- While the limiter runs on a tab, "Maximum volume" gives the page its volume back, so the sound is not turned down twice.

## Why
- Test: a full-scale scream inside normal sound. Without the limiter the scream is 16.5 dB louder than the normal sound. With it, only 4.5 dB louder.
- It works on every website, because it uses the tab's sound, not the page's players.
- Everything stays on the device. Nothing is recorded or sent.

## Trade-offs
- The user must press "Limit" once on each tab. Chrome does not allow it without a click.
- Chrome shows its "sharing this tab" icon while it runs.
- Two new permissions: `tabCapture` and `offscreen`.
- The limiter adds no delay, but very sharp peaks can sound a little rough. A look-ahead limiter would fix this, but it adds delay, and then the sound would not match the video.
