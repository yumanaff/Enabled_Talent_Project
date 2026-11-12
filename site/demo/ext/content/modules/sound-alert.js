// Visual Sound Alert.
// Shows a soft, steady glow around the page and a "Sound playing" label
// while this tab plays sound. Helps Deaf and hard-of-hearing users know
// a video, ad or call is making noise.
//
// The background script tells us when the tab starts or stops making sound
// (see background.js and main.js: event "ease:audible").
//
// SAFETY: the glow NEVER flashes or blinks. Flashing can cause seizures.

(function () {
  const Ease = globalThis.Ease;

  let enabled = false;
  let overlay = null;
  let audible = false;

  function draw() {
    if (!enabled || !audible) {
      if (overlay) {
        overlay.style.display = "none";
      }
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "ease-sound-alert";
      overlay.setAttribute("aria-hidden", "true"); // screen readers do not need this
      overlay.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:2147483645;" +
        "box-shadow:inset 0 0 0 4px rgba(74,90,140,0.55), inset 0 0 28px 6px rgba(74,90,140,0.35);";
      const label = document.createElement("div");
      label.style.cssText =
        "position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:6px;" +
        "padding:6px 10px;border-radius:14px;background:#4A5A8C;color:#FBFBF9;" +
        "font:700 13px/1 system-ui,sans-serif;";
      label.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a10 10 0 0 1 0 14"></path></svg>';
      const text = document.createElement("span");
      text.className = "ease-sound-text";
      label.appendChild(text);
      overlay.appendChild(label);
      document.documentElement.appendChild(overlay);
    }
    overlay.querySelector(".ease-sound-text").textContent = Ease.i18n.t("soundPlaying");
    overlay.style.display = "block";
  }

  function onAudible(event) {
    audible = Boolean(event.detail && event.detail.audible);
    draw();
  }

  // When the page loads, check if a video or audio is already playing with sound.
  function mediaPlayingNow() {
    return [...document.querySelectorAll("video, audio")].some(
      (m) => !m.paused && !m.muted && m.volume > 0
    );
  }

  Ease.engine.register({
    id: "sound-alert",
    observe: false,

    apply(settings) {
      if (!settings.soundAlert) {
        this.remove();
        return;
      }
      if (!enabled) {
        enabled = true;
        document.addEventListener("ease:audible", onAudible);
        audible = audible || mediaPlayingNow();
      }
      draw();
    },

    remove() {
      enabled = false;
      document.removeEventListener("ease:audible", onAudible);
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }
  });
})();
