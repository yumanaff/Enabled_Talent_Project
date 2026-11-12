// Starts the extension on each page.
// This file must be the LAST one in the manifest "js" list.

(function () {
  const Ease = globalThis.Ease;
  const host = window.EASE_DEMO_HOST || location.hostname;

  async function refresh() {
    const { settings, off } = await Ease.storage.getEffectiveSettings(host);

    // Load text for buttons we add to pages (like Read Aloud).
    // "false" = do not change the website's own language or direction.
    try {
      await Ease.i18n.load(settings.language, false);
    } catch (error) {
      console.warn("[Ease] Could not load language:", error);
    }

    if (off) {
      Ease.engine.removeAll();
    } else {
      Ease.engine.applyAll(settings);
    }
  }

  refresh();

  // Apply changes right away when the user changes a setting.
  // Form Saver drafts, reading spots and the reading log change while you type or scroll:
  // they must NOT re-apply every feature.
  Ease.storage.onChange((changes) => {
    const keys = Object.keys(changes);
    if (keys.every((key) => key === "formDrafts" || key === "readingSpots" || key === "readingLog" || key === "timeUsage")) {
      return;
    }
    refresh();
  });

  // Messages from the background script (for example: "this tab is playing sound").
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type) {
      document.dispatchEvent(new CustomEvent("ease:" + message.type, { detail: message }));
    }
  });
})();
