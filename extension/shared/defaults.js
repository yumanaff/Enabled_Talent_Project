// Default settings for a new user.
// Every setting in the extension must be listed here.
// See docs/settings-format.md before adding a new one.

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  Ease.DEFAULT_SETTINGS = {
    version: 1,
    language: "en",

    // Profiles the user turned on (ids from shared/profiles.js)
    profiles: [],

    // Low-energy day: the date it was turned on, like "2026-10-15".
    // It turns itself off the next day.
    lowEnergyDate: null,

    // Setup and daily check-in
    onboardingDone: false,
    lockHash: null, // "salt:hash" of the caregiver PIN (see shared/lock.js). null = not locked.
    homeTools: [], // the 3 tools on Home. Empty = chosen from the user's profiles.
    quizNudge: false, // true after "Skip for now": Home offers the quiz until the user takes it or says "Not now"
    dailyCheckin: false, // ask "How are you feeling today?" once a day
    checkinDate: null, // last day the user answered, like "2026-10-15"
    checkinMood: null, // "good" | "okay" | "tired"

    // Translate websites into "language" (turned on when the user picks a non-English language)
    translatePage: false,
    translateTo: "", // language websites are translated into. Empty = same as "language".

    // Reading
    textSize: 100, // percent: 100, 125, 150, 175, 200
    lineHeight: "normal", // "normal" | "wide" | "extra"
    letterSpacing: "normal", // "normal" | "wide" | "extra"
    fontFamily: "default", // "default" | "readable" | "atkinson" | "dyslexic"
    readingGuide: "off", // "off" | "line" | "mask"
    readAloud: "off", // "off" | "slow" | "normal" | "fast"

    // Seeing
    contrast: "normal", // "normal" | "dark" | "high" | "soft"
    monochrome: false,
    highlightLinks: false,
    highlightTitles: false,
    hideImages: false,

    // Moving and clicking
    bigCursor: false,
    focusIndicator: false,
    skipToContent: false,
    pauseAnimations: false,
    biggerTargets: false, // click magnet for small links and buttons
    tremorFilter: "off", // "off" | "light" | "strong"
    typingFilter: "off", // "off" | "light" | "strong": ignores a key pressed twice by accident
    scrollButtons: false, // big floating "up" and "down" buttons
    sameTab: false, // links open in the same tab, not a surprise new tab
    hidePopups: false, // hides pop-up boxes and cookie banners that cover the page

    // Special features
    calmMode: false,
    pressureRemover: false,
    triggerBlur: false,
    triggerWords: [], // words or phrases chosen by the user
    triggerBlurSize: "sentence", // "word" | "sentence" | "paragraph"
    formSaver: true, // ON for everyone. Never saves passwords or card numbers.
    safeLinks: false, // scam guard: where links go, look-alike sites, password warnings, fake virus warnings
    resumeReading: false, // offers "Continue where you left off" on long pages
    readingGoals: false, // progress bar on articles, daily goal, celebration
    readingGoal: "3", // "1" | "3" | "5" articles a day (smaller on a Low-energy day)
    celebrateStyle: "confetti", // "confetti" | "calm" | "none"
    iconLabels: false, // shows a small word under icon-only buttons
    bigTooltips: false, // big, easy-to-read names for icons and images on hover
    explainSimply: true, // "Explain simply" button on selected text (uses Chrome's on-device AI)

    // Time limits (ADHD, focus): daily limits for websites that pull you in.
    timeLimits: [], // ["instagram.com|60", "youtube.com|45"] = website | minutes per day
    timeLimitExtra: true, // when time is up, offer "5 more minutes" once a day (after a 10-second pause)
    timeLimitPin: false, // "5 more minutes" needs the caregiver PIN

    // Hands-free (for people who can not hold a phone or use a mouse; see content/modules/hands-free.js)
    handsFree: false, // big pointer, hold-to-click and the dock on every page
    handsFreeHead: true, // move the pointer with the head (camera, in the Hands-free panel)
    handsFreeVoice: true, // voice commands (microphone, in the Hands-free panel)
    handsFreeClick: "dwell", // "dwell" (hold still) | "mouth" (open the mouth) | "brows" (raise the eyebrows)
    handsFreeHold: "1.5", // seconds to hold still for a click: "1" | "1.5" | "2" | "3"
    handsFreeSpeed: "normal", // how far the pointer moves for a small head move: "slow" | "normal" | "fast"
    handsFreeDock: true, // big buttons on the side: Scroll, Play, Next, Back, Tabs, Type, Rest
    handsFreePreview: false, // show the camera picture in the panel. Off at first: many people do not want to see their face.

    // Hearing and sound
    soundAlert: false, // glow while the tab plays sound
    volumeLimit: "off" // "off" | "70" | "50" | "30" | "15" (A bit quieter … Very quiet; see volume-limiter.js)
  };

  Ease.TEXT_SIZE_STEPS = [100, 125, 150, 175, 200];
})();
