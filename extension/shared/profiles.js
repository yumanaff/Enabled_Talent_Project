// Profiles.
// A profile is a ready-made group of settings for one kind of need.
// The user can turn on more than one profile.
//
// How the final settings are built (see storage.js):
//   1. DEFAULT_SETTINGS
//   2. + all active profiles combined
//   3. + the user's own manual changes (these always win)
//   4. + settings for this website only
//   5. then expand(): Low-energy day and Calm Mode add their extra settings
//

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  Ease.PROFILES = [
    {
      id: "readableTypography", // dyslexia
      settings: { fontFamily: "atkinson", letterSpacing: "wide", lineHeight: "wide", readingGuide: "line" }
    },
    {
      id: "largeTextContrast", // low vision
      settings: { textSize: 150, contrast: "high", bigCursor: true, focusIndicator: true, highlightLinks: true }
    },
    {
      id: "colorDifferentiation", // colour blindness
      settings: { highlightLinks: true, highlightTitles: true }
    },
    {
      id: "readingFocus",
      settings: { readingGuide: "mask", lineHeight: "wide" }
    },
    {
      id: "focusSupport", // ADHD
      settings: { readingGuide: "line", calmMode: true, resumeReading: true, hidePopups: true }
    },
    {
      id: "reducedMotion",
      settings: { pauseAnimations: true }
    },
    {
      id: "seizureSafe", // photosensitive epilepsy
      settings: { calmMode: true, pauseAnimations: true }
    },
    {
      id: "sensoryCalm", // autism, sensory overload
      settings: { calmMode: true, contrast: "soft", volumeLimit: "50", hidePopups: true }
    },
    {
      id: "lightSensitivity", // migraine, light sensitivity
      settings: { contrast: "dark" }
    },
    {
      id: "lowStress", // anxiety
      settings: { calmMode: true, pressureRemover: true, safeLinks: true }
    },
    {
      id: "hearingSupport", // Deaf and hard of hearing
      settings: { soundAlert: true }
    },
    {
      id: "steadyHands", // tremor, Parkinson's, arthritis
      settings: { biggerTargets: true, tremorFilter: "light", bigCursor: true, focusIndicator: true, scrollButtons: true, typingFilter: "light" }
    },
    {
      id: "cognitiveSupport", // memory, brain injury
      settings: {
        textSize: 125,
        lineHeight: "wide",
        highlightTitles: true,
        readingGuide: "line",
        readAloud: "normal",
        pressureRemover: true,
        safeLinks: true,
        resumeReading: true,
        iconLabels: true,
        bigTooltips: true,
        sameTab: true,
        hidePopups: true
      }
    },
    {
      id: "olderAdults", // older adults: simpler, bigger, safer pages
      settings: {
        textSize: 125,
        bigCursor: true,
        biggerTargets: true,
        highlightLinks: true,
        iconLabels: true,
        safeLinks: true,
        pressureRemover: true,
        hidePopups: true,
        sameTab: true,
        scrollButtons: true,
        bigTooltips: true
      }
    },
    {
      id: "scamSafety", // anyone worried about online scams
      settings: { safeLinks: true, pressureRemover: true, sameTab: true }
    }
  ];

  // For these settings, two profiles can ask for different values.
  // We keep the STRONGER one (later in the list = stronger).
  const RANK = {
    lineHeight: ["normal", "wide", "extra"],
    letterSpacing: ["normal", "wide", "extra"],
    readingGuide: ["off", "line", "mask"],
    tremorFilter: ["off", "light", "strong"],
    typingFilter: ["off", "light", "strong"],
    volumeLimit: ["off", "70", "50", "30", "15"] // lower volume = stronger
  };

  function stronger(key, a, b) {
    if (a === undefined) {
      return b;
    }
    if (key === "textSize") {
      return Math.max(a, b);
    }
    if (typeof a === "boolean") {
      return a || b;
    }
    if (RANK[key]) {
      return RANK[key].indexOf(b) > RANK[key].indexOf(a) ? b : a;
    }
    return a; // other choices (like contrast): the first profile wins
  }

  // Today's date as "YYYY-MM-DD", in the user's own time zone.
  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  Ease.profiles = {
    today,

    // Combine the settings of all active profiles into one object.
    combine(activeIds) {
      const result = {};
      for (const profile of Ease.PROFILES) {
        if (!activeIds.includes(profile.id)) {
          continue;
        }
        for (const [key, value] of Object.entries(profile.settings)) {
          result[key] = stronger(key, result[key], value);
        }
      }
      return result;
    },

    // Add the extra settings that some features switch on.
    expand(settings) {
      const s = { ...settings };

      // Low-energy day: stronger settings, for today only.
      if (s.lowEnergyDate === today()) {
        s.calmMode = true;
        const steps = Ease.TEXT_SIZE_STEPS;
        const index = Math.max(0, steps.indexOf(s.textSize));
        s.textSize = steps[Math.min(steps.length - 1, index + 1)];
        if (s.lineHeight === "normal") {
          s.lineHeight = "wide";
        }
        if (s.contrast === "normal") {
          s.contrast = "soft";
        }
      }

      // Daily check-in answered "okay" today: a little calmer.
      // ("tired" turns on Low-energy day instead. See popup.js.)
      if (s.checkinDate === today() && s.checkinMood === "okay") {
        s.calmMode = true;
      }

      // Calm Mode always pauses animations, and keeps sound at "Quiet" or lower.
      if (s.calmMode) {
        s.pauseAnimations = true;
        s.volumeLimit = stronger("volumeLimit", s.volumeLimit || "off", "30");
      }

      return s;
    }
  };
})();
