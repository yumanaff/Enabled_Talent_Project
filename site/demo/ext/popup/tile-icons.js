// Icons for the Home tiles. Simple line icons (24 x 24), drawn in the accent colour.
// Every tool can be a tile, because the user picks their own 3 "My tools".
// A tool with no icon here gets the plain "dot" icon.

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});
  const p = (d) => `<path d="${d}"/>`;

  Ease.TILE_ICONS = {
    textSize: p("M4 18l5-12 5 12") + p("M5.8 14h6.4") + p("M16 18l3-7 3 7"),
    contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    lineHeight: p("M4 7h16") + p("M4 12h16") + p("M4 17h10"),
    letterSpacing: p("M3 17l3-9 3 9") + p("M15 17l3-9 3 9") + p("M10 20h4"),
    fontFamily: p("M6 19l6-14 6 14") + p("M8.5 13h7"),
    readingGuide: p("M3 9h18") + '<path d="M3 15h18" opacity=".35"/>',
    readAloud: p("M4 10v4h4l5 4V6L8 10z") + p("M16 9a4 4 0 0 1 0 6") + p("M18.5 6.5a8 8 0 0 1 0 11"),
    resumeReading: p("M6 3h12v18l-6-4-6 4z"),
    readingGoals: p("M4 19V5") + p("M4 5h12l-2 4 2 4H4"),
    monochrome: '<circle cx="12" cy="12" r="8"/>' + p("M12 4v16"),
    highlightLinks: p("M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1") + p("M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"),
    highlightTitles: p("M6 4v16") + p("M18 4v16") + p("M6 12h12"),
    iconLabels: '<rect x="7" y="3" width="10" height="8" rx="2"/>' + p("M6 17h12") + p("M8 21h8"),
    bigTooltips: p("M4 5h16v10H10l-4 4v-4H4z"),
    hideImages: '<rect x="3" y="5" width="18" height="14" rx="2"/>' + p("M3 3l18 18"),
    bigCursor: p("M5 3l14 7-6 2-2 6z"),
    focusIndicator: '<rect x="3" y="6" width="18" height="12" rx="3"/><rect x="6.5" y="9.5" width="11" height="5" rx="1.5" stroke-dasharray="2 2"/>',
    skipToContent: p("M5 5l7 7-7 7") + p("M13 5l7 7-7 7"),
    pauseAnimations: '<circle cx="12" cy="12" r="9"/>' + p("M10 9v6") + p("M14 9v6"),
    biggerTargets: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>',
    tremorFilter: p("M4 12h3l2-5 3 10 2-5h6"),
    typingFilter: '<rect x="3" y="7" width="18" height="10" rx="2"/>' + p("M7 11h1") + p("M11 11h2") + p("M16 11h1") + p("M8 14h8"),
    scrollButtons: p("M12 3v14") + p("M7 12l5 5 5-5") + p("M5 21h14"),
    sameTab: '<rect x="3" y="5" width="18" height="14" rx="2"/>' + p("M3 9h18"),
    hidePopups: '<rect x="4" y="4" width="16" height="16" rx="2"/>' + p("M9 9l6 6") + p("M15 9l-6 6"),
    safeLinks: p("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z") + p("M9 12l2 2 4-4"),
    pressureRemover: '<circle cx="12" cy="13" r="8"/>' + p("M12 9v4l2 2") + p("M10 2h4"),
    formSaver: p("M5 3h11l3 3v15H5z") + p("M8 3v5h7V3") + '<rect x="8" y="13" width="8" height="5"/>',
    triggerBlur: p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z") + p("M3 3l18 18"),
    triggerBlurSize: p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"),
    soundAlert: p("M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8") + p("M10 20a2 2 0 0 0 4 0"),
    volumeLimit: p("M4 10v4h4l5 4V6L8 10z") + p("M17 10l4 4") + p("M21 10l-4 4"),
    dailyCheckin: '<circle cx="12" cy="12" r="9"/>' + p("M8.5 14a4 4 0 0 0 7 0") + p("M9 9.5h.01") + p("M15 9.5h.01"),
    calmMode: p("M3 12c3-4 6-4 9 0s6 4 9 0"),
    dot: '<circle cx="12" cy="12" r="4"/>'
  };
})();
