// Translator setup.
// Used by the popup and the setup pages (not by websites).
//
// Chrome must download a language once before it can translate into it.
// Most people do not know this. So when the user picks a language, or turns
// translation on, we start the download right away.
//
// Chrome only allows the download right after a click or key press.
// So call prepare() FIRST in a click handler, before any other "await".
//
// The download is from English to the user's language, because most pages are in English.
// Pages in other languages still work: the page offers the download on the first click.

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  function targetFor(code) {
    const lang = Ease.LANGUAGES.find((l) => l.code === code);
    return lang ? lang.translator : null;
  }

  Ease.translatorSetup = {
    // Check without downloading. Safe to call any time.
    // Returns "ready" | "needs-download" | "use-google" | "no-api"
    async check(code) {
      const target = targetFor(code);
      if (!target) {
        return "use-google";
      }
      if (target === "en") {
        return "ready";
      }
      if (typeof Translator === "undefined") {
        return "no-api";
      }
      try {
        const answer = await Translator.availability({ sourceLanguage: "en", targetLanguage: target });
        if (answer === "available") {
          return "ready";
        }
        if (answer === "downloadable" || answer === "downloading") {
          return "needs-download";
        }
        return "use-google";
      } catch (error) {
        return "no-api";
      }
    },

    // Download the language if needed. onProgress(percent) is called while it downloads.
    // Returns "ready" | "use-google" | "no-api" | "needs-click" | "failed"
    async prepare(code, onProgress) {
      const target = targetFor(code);
      if (!target) {
        return "use-google";
      }
      if (target === "en") {
        return "ready";
      }
      if (typeof Translator === "undefined") {
        return "no-api";
      }
      try {
        // Call create() straight away (no "await" before it), so Chrome still sees the click.
        const translator = await Translator.create({
          sourceLanguage: "en",
          targetLanguage: target,
          monitor(m) {
            m.addEventListener("downloadprogress", (event) => {
              if (onProgress) {
                onProgress(Math.round((event.loaded || 0) * 100));
              }
            });
          }
        });
        if (translator && translator.destroy) {
          translator.destroy(); // we only wanted the download; websites make their own
        }
        return "ready";
      } catch (error) {
        if (error && error.name === "NotAllowedError") {
          return "needs-click";
        }
        if (error && error.name === "NotSupportedError") {
          return "use-google";
        }
        return "failed";
      }
    }
  };
})();
