# Settings format

This is the contract for the whole team.
Every feature reads its settings from this format.

## Where data is saved

All data stays on the user's device in `chrome.storage.local`.
Only `extension/shared/storage.js` reads or writes it.

| Key | What it holds |
|---|---|
| `mySettings` | The user's settings for all websites |
| `siteSettings` | Settings for one website only: `{ "example.com": { ... } }` |
| `sitesOff` | Websites where Ease is turned off: `{ "example.com": true }` |
| `formDrafts` | Form Saver text, per page, deleted after 24 hours or when the form is sent |
| `readingLog` | Reading goals: finished pages per day (last 14 days) and the last celebration date. Never synced or backed up. |
| `readingSpots` | Resume Reading: how far you read each long page. Deleted after 30 days. At most 100 pages. Never in backups. |

## How the final settings are built

1. Start with `DEFAULT_SETTINGS` (in `shared/defaults.js`).
2. Add all active profiles on top (`shared/profiles.js`). If two profiles disagree, the stronger value wins.
3. Add the user's manual changes from `mySettings` on top. Manual changes always win over profiles.
4. Add this site's `siteSettings` on top.
5. Run `Ease.profiles.expand()`:
   - Low-energy day (if `lowEnergyDate` is today): Calm Mode on, text one step bigger, wide lines, soft contrast.
   - Check-in mood "okay" today: Calm Mode on. ("tired" sets Low-energy day instead.)
   - Calm Mode on: also turns on `pauseAnimations`.
6. If the site is in `sitesOff`, apply nothing.

## Current settings

| Setting | Type | Default | Values | Module |
|---|---|---|---|---|
| `version` | number | `1` | | |
| `profiles` | array | `[]` | profile ids from shared/profiles.js | |
| `lowEnergyDate` | string or null | `null` | "YYYY-MM-DD" | profiles.js expand() |
| `onboardingDone` | boolean | `false` | | onboarding |
| `dailyCheckin` | boolean | `false` | | popup check-in |
| `checkinDate` | string or null | `null` | "YYYY-MM-DD" | popup check-in |
| `checkinMood` | string or null | `null` | good, okay, tired | profiles.js expand() |
| `language` | string | `"en"` | `en`, `fr`, `zh_CN`, `pa`, `es`, `ar`, `tl`, `zh_HK`, `hi`, `it` | |
| `translatePage` | boolean | `false` | turned on when a non-English language is picked | page-translate.js |
| `textSize` | number | `100` | 100, 125, 150, 175, 200 | text-size.js |
| `lineHeight` | string | `"normal"` | normal, wide, extra | line-height.js |
| `letterSpacing` | string | `"normal"` | normal, wide, extra | letter-spacing.js |
| `fontFamily` | string | `"default"` | default, readable, atkinson, dyslexic | font-family.js |
| `readingGuide` | string | `"off"` | off, line, mask | reading-guide.js |
| `readAloud` | string | `"off"` | off, slow, normal, fast | read-aloud.js |
| `skipToContent` | boolean | `false` | | skip-to-content.js |
| `contrast` | string | `"normal"` | normal, dark, high, soft | contrast.js |
| `monochrome` | boolean | `false` | | monochrome.js |
| `highlightLinks` | boolean | `false` | | highlight-links.js |
| `highlightTitles` | boolean | `false` | | highlight-titles.js |
| `hideImages` | boolean | `false` | | hide-images.js |
| `bigCursor` | boolean | `false` | | big-cursor.js |
| `focusIndicator` | boolean | `false` | | focus-indicator.js |
| `pauseAnimations` | boolean | `false` | | pause-animations.js |
| `biggerTargets` | boolean | `false` | | bigger-targets.js |
| `tremorFilter` | string | `"off"` | off, light, strong | tremor-filter.js |
| `calmMode` | boolean | `false` | | calm-mode.js |
| `pressureRemover` | boolean | `false` | | pressure-remover.js |
| `triggerBlur` | boolean | `false` | | trigger-blur.js |
| `triggerWords` | array of strings | `[]` | words or phrases the user typed | trigger-blur.js |
| `formSaver` | boolean | `true` | | form-saver.js |
| `triggerBlurSize` | string | `"sentence"` | word, sentence, paragraph | trigger-blur.js |
| `translateTo` | string | `""` | Language websites are translated into. Empty = same as `language`. | page-translate.js, popup |
| `homeTools` | array of strings | `[]` | The 3 tools on Home. Empty = chosen from the user's profiles. | popup |
| `quizNudge` | boolean | `false` | true after "Skip for now" in setup | popup (Home) |
| `lockHash` | string or null | `null` | "salt:sha256" of the caregiver PIN. Never the PIN itself. | shared/lock.js, popup |
| `readingGoals` | boolean | `false` | | reading-goals.js |
| `readingGoal` | string | `"3"` | 1, 3, 5 (articles a day, halved on a Low-energy day) | reading-goals.js |
| `celebrateStyle` | string | `"confetti"` | confetti, calm, none (calm is forced with Pause animations or Calm Mode) | reading-goals.js |
| `bigTooltips` | boolean | `false` | | big-tooltips.js |
| `safeLinks` | boolean | `false` | Scam guard: links, look-alike sites, password warnings, fake warning pages | safe-links.js, scam-guard.js |
| `hidePopups` | boolean | `false` | | hide-popups.js |
| `sameTab` | boolean | `false` | | same-tab.js |
| `scrollButtons` | boolean | `false` | | scroll-buttons.js |
| `typingFilter` | string | `"off"` | off, light (150 ms), strong (300 ms) | typing-filter.js |
| `resumeReading` | boolean | `false` | | resume-reading.js |
| `iconLabels` | boolean | `false` | | icon-labels.js |
| `soundAlert` | boolean | `false` | | sound-alert.js |
| `volumeLimit` | string | `"off"` | off, 70, 50, 30, 15 (A bit quieter, Quieter, Quiet, Very quiet). The number is squared before use, so it matches how loud it sounds. Calm mode uses 30 or lower. | volume-limiter.js |
| `timeLimits` | string[] | `[]` | Time limits. Each item is `"site|minutes"`, for example `"instagram.com|60"`. Minutes: 15, 30, 45, 60, 90, 120, 180. Kept on reset. | time-limits.js |
| `timeLimitExtra` | boolean | `true` | Offer "5 more minutes" once a day, after a 10-second wait. Kept on reset. | time-limits.js |
| `timeLimitPin` | boolean | `false` | More time needs the caregiver PIN (only works when a PIN is set). Kept on reset. | time-limits.js |
| `explainSimply` | boolean | `true` | "Explain simply" button on selected text. Needs Chrome's on-device AI. | explain.js |
| `handsFree` | boolean | `false` | Hands-free: big pointer, hold-to-click and the big side buttons on every page. Camera and voice run in the side panel. | hands-free.js |
| `handsFreeHead` | boolean | `true` | Move the pointer with the head (side panel camera). | handsfree/panel.js |
| `handsFreeVoice` | boolean | `true` | Voice commands (English words for now). | handsfree/panel.js |
| `handsFreeClick` | string | `"dwell"` | How to click: `"dwell"` (hold still), `"mouth"` (open the mouth), `"brows"` (raise the eyebrows). | hands-free.js, panel.js |
| `handsFreeHold` | string | `"1.5"` | Seconds to hold still for a click: `"1"`, `"1.5"`, `"2"`, `"3"`. | hands-free.js |
| `handsFreeSpeed` | string | `"normal"` | Pointer speed for a head move, and how fast looking at the edge scrolls: `"slow"`, `"normal"`, `"fast"`. | handsfree/panel.js, hands-free.js |
| `handsFreeDock` | boolean | `true` | Big buttons on the side: Up, Down, Play / Pause, Next, Back, Tabs, Type, Rest. | hands-free.js |
| `handsFreePreview` | boolean | `false` | Show the camera picture in the panel (button above the camera box). Off at first. The face is still followed when the picture is hidden. | handsfree/panel.js |

## Page filters

Contrast and Monochrome both change the CSS `filter` of the page.
They must use `Ease.engine.setFilter()`, not their own style.
The engine joins all filters into one rule.

## Adding a new setting

1. Add it to `DEFAULT_SETTINGS` in `shared/defaults.js`.
2. Add a row to the table above.
3. Use a clear name in camelCase, like `readingGuide`.
4. Off by default, unless the team agrees.

## Page translation

`page-translate.js` uses Chrome's built-in Translator API (Chrome 138+, desktop).
It runs on the user's computer: page text is never sent anywhere.
The API lives in the page's own JavaScript world, so `content/translate-bridge.js`
runs there ("world": "MAIN" in manifest.json) and talks to page-translate.js with `window.postMessage`.

Supported on-device: en, fr, zh (Simplified), zh-Hant (Traditional), es, ar, hi, it.
Not supported yet: Punjabi and Tagalog. For these, Ease offers Google Translate and says it sends the page to Google.

## Backup file

"Back up or move my settings" saves a file like `ease-settings-2026-10-15.json`:

```json
{ "app": "Ease", "type": "settings-backup", "format": 1, "savedAt": "...",
  "mySettings": { ... }, "siteSettings": { ... }, "sitesOff": { ... } }
```

When a file is loaded, Ease keeps only settings listed in `shared/defaults.js`, with the right type.
Anything else in the file is ignored. Form drafts and reading spots are never saved in the file.

## Site-only keys

`siteSettings[host].scamOk = true` is saved when the user presses "This page is fine" on a scam warning.

## Other storage keys

| Key | What it holds |
|---|---|
| `timeUsage` | `{date, used: {site: seconds}, extra: {site: seconds}}`. Starts again each day. Kept per computer, never synced or backed up. |
| `syncOn` | true when "Same settings on all my computers" is on. Kept per computer, never synced. |

While `syncOn` is true, `background.js` copies `mySettings`, `siteSettings` and `sitesOff`
between `chrome.storage.local` and `chrome.storage.sync`. Form drafts and reading spots are never synced.

## Setup file for someone else

"Set up Ease for someone else" makes the same file format as a backup, with `"forSomeoneElse": true`.
It can include `lockHash` if the caregiver chose a PIN.
On the other computer, "I have a setup file" on the welcome page loads it.
