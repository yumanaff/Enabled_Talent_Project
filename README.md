# Ease

A Chrome extension that makes every website easier to use.
The user sets up their needs once.
Ease then changes every website they visit.

All data stays on the user's device. There is no account and no server.

## Try it in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `extension` folder in this project.
5. Open any website. Click the Ease icon in the toolbar.

After you change code, click the reload button on the Ease card in `chrome://extensions`. Then refresh the website.

## Folder structure

```
site/                    The Ease website (one page, llms.txt for AI assistants). See site/README.md
extension/
  manifest.json          Extension settings for Chrome
  background.js          Runs on install, reports when a tab plays sound, runs the sound limiter
  offscreen/
    helper.html          Hidden helper page (only one is allowed per extension)
    sound.js             Plays a tab's sound through the sound limiter
    ai-host.js           Answers AI requests when the service worker cannot
    limiter-worklet.js   The peak limiter (runs on the audio thread)
  shared/
    defaults.js          Default value for every setting
    profiles.js          The 15 profiles, Low-energy day, Calm Mode extras
    storage.js           Saves and loads settings (only file that uses chrome.storage)
    i18n.js              Loads language files (popup and websites)
    translator-setup.js  Downloads the user's language for Chrome's translator after a click
    lock.js              Caregiver PIN lock (saves a salted hash, never the PIN)
    time-rules.js        Reads and checks time limits ("site|minutes")
    ai.js                Chrome's on-device AI (Prompt API), with set-up and status
  content/
    engine.js            Runs feature modules on each page
    main.js              Starts everything on each page (load last)
    modules/
      _template.js       Copy this to make a new feature
      text-size.js       Text Size
      line-height.js     Line spacing
      letter-spacing.js  Letter and word spacing
      font-family.js     Clear, Atkinson or OpenDyslexic font
      reading-guide.js   Line or mask that follows the mouse
      read-aloud.js      Reads selected text, highlights each word
      skip-to-content.js Link that jumps to the main content
      contrast.js        Dark, high contrast or soft
      monochrome.js      Grey colours
      highlight-links.js
      highlight-titles.js
      big-cursor.js
      focus-indicator.js Strong ring for keyboard users
      bigger-targets.js  Click magnet for small links and buttons
      tremor-filter.js   Ignores clicks made twice by mistake
      hide-images.js     Hides images, shows alt text
      pause-animations.js Stops animations, freezes GIFs
      calm-mode.js       Calm Mode: quiet media, calm ads, softer colours
      pressure-remover.js Hides fake urgency and countdown timers
      trigger-blur.js    Blurs text with words the user chose
      form-saver.js      Keeps typed text if a page reloads (never passwords)
      sound-alert.js     Soft glow while the tab plays sound
      volume-limiter.js  Caps the volume of videos and audio
      safe-links.js      Shows where links go, warns about scam look-alikes
      scam-guard.js      Password warnings on unsafe pages, fake virus and gift-card scam pages
      hide-popups.js     Hides newsletter pop-ups and cookie banners (not boxes the user opened)
      same-tab.js        Links open in the same tab
      scroll-buttons.js  Big up and down buttons for shaky hands
      typing-filter.js   Ignores keys pressed twice by accident ("bounce keys")
      icon-labels.js     Shows the hidden name under icon-only buttons
      big-tooltips.js    Big, easy-to-read names for icons and images on hover
      resume-reading.js  "Continue where you left off?" on long pages
      reading-view.js    Clean reading page (uses lib/readability)
      reading-goals.js   Progress bar, daily reading goal, gentle celebration
      page-translate.js  Translates websites into the user's language, on the device
      time-limits.js     Daily time limits for chosen sites (kind cover when time is up)
      explain.js         "Explain simply": selected text in small steps, shaped by profile
      show-me-how.js     "Show me how": points to the right button, step by step
    translate-bridge.js  Runs in the page's world to reach Chrome's built-in translator
  popup/                 Toolbar window: daily check-in, Home, My Settings, This Site
    summarize.js         "Summarize" with Chrome's on-device Summarizer
    sound-limit.js       The "Limit" bar on Home while a tab plays sound
    tile-icons.js        Icons for the Home tiles (tap a tile to change its level)
  backup/                Page to save settings to a file, or load them on a new computer
  lib/readability/       Mozilla Readability 0.6.0 (Apache 2.0), finds the article on a page
  onboarding/            Setup page with the try-it quiz (opens on first install)
  locales/               One file per language (10). Only en and fr are checked.
                         The other 8 are AI drafts. Native speakers must review them.
  fonts/                 Reading fonts and their licenses
docs/
  settings-format.md     The settings contract. Read before adding a setting.
  performance.md         Benchmark results and what we fixed
  architecture.md        How Ease is built (diagrams), messages, storage, privacy
  decisions/             8 short decision records: why we built it this way
tests/
  accessibility/         axe-core audit of every Ease screen (npm run audit)
  performance/           Speed and memory benchmark on a heavy page (npm run bench)
```

## Architecture

How Ease is built, with diagrams: [docs/architecture.md](docs/architecture.md).
Why we made the big choices (no backend, plain JavaScript, on-device AI, Shadow DOM, and more):
[docs/decisions/](docs/decisions/).

## Accessibility audit

Ease checks its own accessibility with [axe-core](https://github.com/dequelabs/axe-core)
(WCAG 2.2 A and AA, plus best practices) in Chromium.

It checks 27 screens and states: the popup (Home, My Settings and its groups, For me, This Site, PIN, check-in,
search, Arabic right-to-left), the setup pages, the backup page, and the boxes Ease adds to websites
(Safe links, scam warning, Reading view, Big tooltips, Resume reading, Trigger blur, scroll buttons).

Last result: **0 problems on all 23.**

```
cd tests/accessibility
npm install
npx playwright install chromium   # first time only
npm run audit
```

The command exits with an error if any problem is found, so it can run in CI.

## Performance

On a long test page (36,000 words, 3,000 links) with **all 35 tools on**:
tools set up in **95 ms**, new content is handled in **4.5 ms**, and Ease uses about **3 MB** of memory.
One profile adds 0 to 217 ms. Details, before/after numbers and fixes: [docs/performance.md](docs/performance.md).

## How to add a feature

1. Copy `extension/content/modules/_template.js`.
2. Add your setting to `extension/shared/defaults.js`.
3. Add your file to `manifest.json`, before `content/main.js`.
4. Add your setting to `docs/settings-format.md`.

## Rules

- Every feature has `apply(settings)` and `remove()`.
- No text written directly in code. Use the files in `locales/`.
- Only `storage.js` touches `chrome.storage`.
- Never save password or payment fields.

## Credits

Some tool ideas are based on
[accessibility-preference-widget](https://github.com/Azkhar/accessibility-preference-widget) (MIT)
and [react-accessibility-widget](https://github.com/emranio/react-accessibility-widget) (MIT).

Fonts:
- Atkinson Hyperlegible, Braille Institute of America, SIL Open Font License 1.1
- OpenDyslexic, Abbie Gonzalez, see `extension/fonts/LICENSE-opendyslexic.txt`

Libraries:
- Readability.js 0.6.0, Mozilla, Apache License 2.0, see `extension/lib/readability/LICENSE.md`
