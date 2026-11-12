// Calm Mode.
// One switch that makes a busy page quiet.
//
// What it does:
//   1. Pauses animations and freezes GIFs
//      (profiles.expand() turns on pauseAnimations when Calm Mode is on)
//   2. Pauses and mutes videos and audio that start by themselves
//   3. Calms ads: grey, faded, and their videos are hidden
//   4. Softens bright colours a little
//
// Note: we do not block ads. We remove their harmful behaviour.

(function () {
  const Ease = globalThis.Ease;

  // Common ad containers. Kept specific, so we do not hit normal content.
  const AD_SELECTORS = [
    "ins.adsbygoogle",
    '[id^="google_ads"]',
    '[id^="div-gpt-ad"]',
    "[data-ad-slot]",
    "[data-ad-unit]",
    "[data-google-query-id]",
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'iframe[id^="google_ads_iframe"]',
    '[id^="taboola"]',
    ".trc_related_container",
    '[id^="outbrain"]',
    ".OUTBRAIN",
    ".ad-slot",
    ".ad-container",
    ".advertisement"
  ].join(",");

  const CALM_CSS = `
    :is(${AD_SELECTORS}) {
      filter: grayscale(1) opacity(0.45) !important;
      transition: none !important;
    }
    :is(${AD_SELECTORS}) video {
      visibility: hidden !important;
    }`;

  // Pause and mute media that is playing by itself.
  // We mark each item once. If the user presses play later, we leave it alone.
  function quietMedia() {
    for (const item of document.querySelectorAll("video, audio")) {
      if (item.dataset.easeCalmed === "yes") {
        continue;
      }
      item.dataset.easeCalmed = "yes";
      item.autoplay = false;
      item.muted = true;
      if (!item.paused) {
        item.pause();
      }
    }
  }

  Ease.engine.register({
    id: "calm-mode",
    observe: true, // new videos and ads can load later

    apply(settings) {
      if (!settings.calmMode) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, CALM_CSS);
      Ease.engine.setFilter(this.id, "saturate(0.8)");
      quietMedia();
    },

    remove() {
      Ease.engine.removeStyle(this.id);
      Ease.engine.removeFilter(this.id);
      // We do not restart videos. The user can press play.
      for (const item of document.querySelectorAll("[data-ease-calmed]")) {
        delete item.dataset.easeCalmed;
      }
    }
  });
})();
