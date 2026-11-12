// Language loader.
// Used by extension pages (popup, onboarding) AND by content scripts on websites.
// Rule: never write user-facing text in HTML or JS.
// Put it in locales/<language>.json and use data-i18n="key" in HTML,
// or Ease.i18n.t("key") in JS.

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  const RTL_LANGUAGES = ["ar"];

  // The 10 most spoken languages in Canada. Names are written in their own language.
  // "voice" is the speech code for Read Aloud samples.
  // "translator" is the code for Chrome's on-device translator. null = Chrome can not do it yet,
  // so Ease offers Google Translate instead (Punjabi and Tagalog, checked in Chrome 155).
  //   Mandarin speakers usually read Simplified Chinese (zh_CN, Mandarin voice).
  //   Cantonese speakers usually read Traditional Chinese (zh_HK, Cantonese voice).
  // en and fr are checked. The other 8 are AI drafts: native speakers must review them.
  Ease.LANGUAGES = [
    { code: "en", name: "English", voice: "en-CA", translator: "en" },
    { code: "fr", name: "Français", voice: "fr-CA", translator: "fr" },
    { code: "zh_CN", name: "简体中文 (普通话)", voice: "zh-CN", translator: "zh" },
    { code: "pa", name: "ਪੰਜਾਬੀ", voice: "pa-IN", translator: null },
    { code: "es", name: "Español", voice: "es-MX", translator: "es" },
    { code: "ar", name: "العربية", voice: "ar", translator: "ar" },
    { code: "tl", name: "Tagalog", voice: "fil-PH", translator: null },
    { code: "zh_HK", name: "繁體中文 (廣東話)", voice: "zh-HK", translator: "zh-Hant" },
    { code: "hi", name: "हिन्दी", voice: "hi-IN", translator: "hi" },
    { code: "it", name: "Italiano", voice: "it-IT", translator: "it" }
  ];
  let strings = {};
  let fallback = {};
  let loadedLang = null;

  async function loadFile(lang) {
    const url = chrome.runtime.getURL(`locales/${lang}.json`);
    const response = await fetch(url);
    return response.json();
  }

  Ease.i18n = {
    // setPageDirection:
    //   true  -> for extension pages. Sets lang and dir (right-to-left for Arabic).
    //   false -> for content scripts. NEVER change a website's own lang or dir.
    async load(lang, setPageDirection = true) {
      if (lang !== loadedLang) {
        fallback = await loadFile("en");
        try {
          strings = lang === "en" ? fallback : await loadFile(lang);
        } catch (error) {
          console.warn("[Ease] Missing language file:", lang);
          strings = fallback;
        }
        loadedLang = lang;
      }
      if (setPageDirection) {
        document.documentElement.lang = lang;
        document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? "rtl" : "ltr";
      }
    },

    // Get one text by key. Falls back to English.
    // Values in {braces} are filled from params: t("ob_selected", { n: 3 }).
    t(key, params) {
      let text = strings[key] ?? fallback[key] ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.split("{" + name + "}").join(value); // replace every copy, not just the first
        }
      }
      return text;
    },

    // Fill every element that has data-i18n="key".
    translatePage() {
      for (const el of document.querySelectorAll("[data-i18n]")) {
        el.textContent = this.t(el.dataset.i18n);
      }
      for (const el of document.querySelectorAll("[data-i18n-label]")) {
        el.setAttribute("aria-label", this.t(el.dataset.i18nLabel));
      }
    }
  };
})();
