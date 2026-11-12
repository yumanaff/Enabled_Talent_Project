// Translate bridge.
// Runs in the PAGE's own JavaScript world ("world": "MAIN" in manifest.json),
// because Chrome's built-in Translator API lives there.
// page-translate.js (in the extension's world) sends requests with window.postMessage,
// and this file answers.
//
// It only translates text that is already on this page. It never sends anything
// outside the computer: Chrome's translator runs on this device.

(function () {
  if (window.__easeTranslateBridge) {
    return;
  }
  window.__easeTranslateBridge = true;

  const translators = new Map(); // "en>hi" -> Translator

  async function handle(op, args) {
    if (typeof Translator === "undefined") {
      throw new Error("no-api");
    }
    if (op === "availability") {
      return Translator.availability(args);
    }
    if (op === "create") {
      const key = args.sourceLanguage + ">" + args.targetLanguage;
      if (!translators.has(key)) {
        const translator = await Translator.create({
          sourceLanguage: args.sourceLanguage,
          targetLanguage: args.targetLanguage,
          monitor(m) {
            m.addEventListener("downloadprogress", (event) => {
              window.postMessage({ __ease: "tr-progress", loaded: event.loaded }, "*");
            });
          }
        });
        translators.set(key, translator);
      }
      return true;
    }
    if (op === "translate") {
      const translator = translators.get(args.key);
      if (!translator) {
        throw new Error("not-ready");
      }
      return translator.translate(args.text);
    }
    if (op === "detect") {
      if (typeof LanguageDetector === "undefined") {
        return null;
      }
      const detector = await LanguageDetector.create();
      const results = await detector.detect(args.text);
      return results && results[0] ? results[0].detectedLanguage : null;
    }
    throw new Error("unknown-op");
  }

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.__ease !== "tr-req") {
      return;
    }
    let result = null;
    let error = null;
    try {
      result = await handle(data.op, data.args || {});
    } catch (err) {
      error = String((err && (err.name === "NotAllowedError" ? "needs-click" : err.message)) || err);
    }
    window.postMessage({ __ease: "tr-res", id: data.id, result, error }, "*");
  });
})();
