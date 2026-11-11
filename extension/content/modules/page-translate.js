// Page Translate.
// Translates the website into the user's Ease language.
//
// How it works:
//   1. Find the page's language (the <html lang> tag, or Chrome's language detector).
//   2. If it is different from the user's language, use Chrome's BUILT-IN translator.
//      It runs on this computer: the page text is never sent anywhere. It is free.
//   3. Translate the text the user can see first, then the rest while they scroll.
//   4. Show a small chip: "Translated into हिन्दी on this device · Show original".
//
// Languages Chrome's built-in translator does not support yet (Punjabi, Tagalog):
//   we show how to use Chrome's normal Google Translate instead,
//   and we say clearly that this sends the page to Google.
//
// Setting "translatePage": true/false. The target is the "language" setting.

(function () {
  const Ease = globalThis.Ease;

  // Ease language -> Chrome translator code. null = not supported on this device.
  // The codes live in shared/i18n.js (Ease.LANGUAGES), so the popup uses the same list.
  // The language websites are translated into. "translateTo" can differ from Ease's own language
  // (for example: Ease in English, websites in Punjabi). Empty = same as Ease's language.
  function pageLanguage() {
    return (settings && settings.translateTo) || (settings && settings.language) || "en";
  }

  function targetFor(code) {
    const lang = Ease.LANGUAGES.find((l) => l.code === code);
    return lang ? lang.translator : null;
  }

  // Ease language -> Google Translate code (for the fallback link).
  const GOOGLE = { en: "en", fr: "fr", zh_CN: "zh-CN", zh_HK: "zh-TW", es: "es", ar: "ar", hi: "hi", it: "it", pa: "pa", tl: "tl" };

  const SKIP_TEXT = /^[\s\d.,:;!?()[\]{}'"«»“”‘’%$€£¥+\-–—/\\|*#@&=<>_~^`]*$/; // numbers and symbols only

  let settings = null;
  let state = "idle"; // idle | offered | downloading | translating | done | original | unsupported
  let pairKey = null; // "en>hi"
  let langName = "";
  let bar = null;
  let chip = null;
  let sourceLang = null;
  let dismissed = false;
  let runId = 0; // goes up every time we stop, so old work in progress knows to quit
  let waitingForClick = false;

  const originals = new WeakMap(); // text node -> original English text
  const translatedNodes = new Set(); // so "Show original" can restore them
  const cache = new Map(); // "original text" -> "translated text"
  let queue = [];
  let working = false;
  let observer = null;
  let doneSinceRescan = 0;

  // ---------- Talking to the bridge (translate-bridge.js) ----------

  let nextId = 1;
  const waiting = new Map();

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data) {
      return;
    }
    if (data.__ease === "tr-res" && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data.result);
      }
    } else if (data.__ease === "tr-progress" && state === "downloading") {
      showBar("downloading", Math.round((data.loaded || 0) * 100));
    }
  });

  function call(op, args) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      window.postMessage({ __ease: "tr-req", id, op, args }, "*");
      setTimeout(() => {
        if (waiting.has(id)) {
          waiting.delete(id);
          reject(new Error("timeout"));
        }
      }, op === "create" ? 600000 : 30000); // downloads can take a while
    });
  }

  // ---------- Page language ----------

  function normalize(code) {
    if (!code) {
      return null;
    }
    const c = code.toLowerCase();
    if (c.startsWith("zh")) {
      return /hant|tw|hk|mo/.test(c) ? "zh-Hant" : "zh";
    }
    return c.split("-")[0];
  }

  async function detectPageLanguage() {
    const fromTag = normalize(document.documentElement.lang);
    if (fromTag) {
      return fromTag;
    }
    const sample = (document.body ? document.body.innerText : "").slice(0, 1500);
    try {
      return normalize(await call("detect", { text: sample })) || "en";
    } catch (error) {
      return "en";
    }
  }

  // ---------- Small UI: offer bar and status chip ----------

  function box(id, css) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;z-index:2147483647;" + css;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px;
             border-radius: 12px; background: #FBFBF9; color: #2A2F36; border: 1px solid #DDDDD6;
             box-shadow: 0 6px 18px rgba(0,0,0,0.16); font: 400 14px/1.4 system-ui, sans-serif; max-width: 92vw; }
      .note { font-size: 12px; color: #555B66; width: 100%; }
      button { height: 36px; padding: 0 12px; border-radius: 9px; cursor: pointer; font: 700 14px/1 system-ui, sans-serif; }
      .main { border: none; background: #4A5A8C; color: #FBFBF9; }
      .plain { border: 1px solid #DDDDD6; background: transparent; color: #2A2F36; }
      button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }`;
    const inner = document.createElement("div");
    inner.className = "box";
    inner.setAttribute("role", "status");
    shadow.append(style, inner);
    document.documentElement.appendChild(host);
    return { host, inner };
  }

  function button(text, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function hideBar() {
    if (bar) {
      bar.host.remove();
      bar = null;
    }
  }

  function showBar(kind, percent) {
    if (!bar) {
      bar = box("ease-translate-bar", "top:12px;left:50%;transform:translateX(-50%);");
    }
    const t = (key, params) => Ease.i18n.t(key, { lang: langName, ...params });
    const inner = bar.inner;
    inner.textContent = "";
    const text = document.createElement("span");

    if (kind === "offer") {
      text.textContent = t("trOffer");
      inner.append(
        text,
        button(t("trTranslate"), "main", startFromClick),
        button(t("trNotHere"), "plain", notOnThisSite),
        button(t("trClose"), "plain", () => {
          dismissed = true;
          disarmAutoDownload();
          hideBar();
        })
      );
    } else if (kind === "downloading") {
      text.textContent = t("trDownloading", { p: percent || 0 });
      inner.append(text);
    } else if (kind === "unsupported") {
      text.textContent = t("trUnsupported");
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = t("trGoogleNote");
      inner.append(
        text,
        button(t("trOpenGoogle"), "main", openGoogle),
        button(t("trNotHere"), "plain", notOnThisSite),
        button(t("trClose"), "plain", () => {
          dismissed = true;
          hideBar();
        }),
        note
      );
    }
  }

  function showChip() {
    if (!chip) {
      chip = box("ease-translate-chip", "bottom:12px;left:12px;");
    }
    const inner = chip.inner;
    inner.textContent = "";
    const text = document.createElement("span");
    if (state === "original") {
      text.textContent = Ease.i18n.t("trOriginalShown");
      inner.append(text, button(Ease.i18n.t("trTranslate"), "main", translateAgain));
    } else {
      text.textContent = Ease.i18n.t("trDone", { lang: langName });
      inner.append(text, button(Ease.i18n.t("trShowOriginal"), "plain", showOriginal));
    }
  }

  function hideChip() {
    if (chip) {
      chip.host.remove();
      chip = null;
    }
  }

  // ---------- Actions ----------

  function notOnThisSite() {
    disarmAutoDownload();
    hideBar();
    Ease.storage.saveSiteSettings(location.hostname, { translatePage: false });
  }

  function openGoogle() {
    const code = GOOGLE[pageLanguage()] || "en";
    const url = "https://translate.google.com/translate?sl=auto&tl=" + code + "&u=" + encodeURIComponent(location.href);
    window.open(url, "_blank", "noopener");
  }

  // The user clicked "Translate" (or clicked anywhere on the page, see armAutoDownload).
  // Chrome only downloads a language after a click, so this is where the download starts.
  async function startFromClick() {
    if (state !== "offered") {
      return;
    }
    disarmAutoDownload();
    const myRun = runId;
    state = "downloading";
    showBar("downloading", 0);
    try {
      await call("create", { sourceLanguage: sourceLang, targetLanguage: targetFor(pageLanguage()) });
      if (myRun !== runId) {
        return; // the user changed language or turned translation off meanwhile
      }
      hideBar();
      beginTranslating();
    } catch (error) {
      if (myRun !== runId) {
        return;
      }
      state = "unsupported";
      showBar("unsupported");
    }
  }

  // Most people do not know Chrome needs to download a language first.
  // So we do not wait for the "Translate" button: the first click or key press
  // anywhere on the page starts the download. Clicks inside our own bar do not count,
  // so "Not on this site" and "Close" still work.
  function onFirstAction(event) {
    if (!event.isTrusted || state !== "offered" || dismissed) {
      return;
    }
    if (bar && event.composedPath && event.composedPath().includes(bar.host)) {
      return;
    }
    startFromClick();
  }

  function armAutoDownload() {
    if (waitingForClick) {
      return;
    }
    waitingForClick = true;
    window.addEventListener("pointerdown", onFirstAction, true);
    window.addEventListener("keydown", onFirstAction, true);
  }

  function disarmAutoDownload() {
    if (!waitingForClick) {
      return;
    }
    waitingForClick = false;
    window.removeEventListener("pointerdown", onFirstAction, true);
    window.removeEventListener("keydown", onFirstAction, true);
  }

  function showOriginal() {
    state = "original";
    queue = [];
    if (observer) {
      observer.disconnect();
    }
    for (const node of translatedNodes) {
      if (originals.has(node)) {
        node.nodeValue = originals.get(node);
      }
    }
    translatedNodes.clear();
    Ease.translatedVoice = null;
    showChip();
    Ease.engine.rescan();
  }

  function translateAgain() {
    beginTranslating();
  }

  // ---------- Translating text ----------

  function wantsTranslation(node) {
    if (translatedNodes.has(node)) {
      return false;
    }
    const text = node.nodeValue;
    return text.trim().length > 1 && !SKIP_TEXT.test(text);
  }

  // Text the user can see goes first. The rest waits until it scrolls into view.
  function collect() {
    const nodes = Ease.engine.textNodes("#ease-translate-bar, #ease-translate-chip, #ease-read-aloud, #ease-form-saver, code, pre, kbd");
    const fresh = nodes.filter(wantsTranslation);
    if (!("IntersectionObserver" in window)) {
      queue.push(...fresh);
      work();
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            observer.unobserve(entry.target);
            for (const child of entry.target.childNodes) {
              if (child.nodeType === Node.TEXT_NODE && wantsTranslation(child)) {
                queue.push(child);
              }
            }
          }
          work();
        },
        { rootMargin: "400px 0px" } // start a little before text scrolls into view
      );
    }
    const parents = new Set(fresh.map((node) => node.parentElement));
    for (const parent of parents) {
      observer.observe(parent);
    }
  }

  // One translation at a time (Chrome works through them in order anyway).
  async function work() {
    if (working) {
      return;
    }
    working = true;
    const myRun = runId;
    while (queue.length && state === "translating" && myRun === runId) {
      const node = queue.shift();
      if (!node.isConnected || !wantsTranslation(node)) {
        continue;
      }
      const original = node.nodeValue;
      const core = original.trim();
      try {
        // The memory is split by language pair, so Hindi text never shows up in Spanish.
        const cacheKey = pairKey + "|" + core;
        let result = cache.get(cacheKey);
        if (result === undefined) {
          result = await call("translate", { key: pairKey, text: core });
          cache.set(cacheKey, result);
        }
        if (state !== "translating" || myRun !== runId || node.nodeValue !== original) {
          continue; // the user pressed "Show original", or the site changed this text
        }
        // Keep the spaces around the text, so words do not stick together.
        const lead = original.match(/^\s*/)[0];
        const tail = original.match(/\s*$/)[0];
        originals.set(node, original);
        node.nodeValue = lead + result + tail;
        translatedNodes.add(node);
        doneSinceRescan += 1;
        if (doneSinceRescan >= 25) {
          doneSinceRescan = 0;
          Ease.engine.rescan(); // let Trigger Blur check the new words
        }
      } catch (error) {
        // One text failed: skip it and keep going.
      }
    }
    working = false;
    if (doneSinceRescan > 0) {
      doneSinceRescan = 0;
      Ease.engine.rescan();
    }
  }

  function beginTranslating() {
    state = "translating";
    const lang = Ease.LANGUAGES.find((l) => l.code === pageLanguage());
    Ease.translatedVoice = lang ? lang.voice : null; // Read Aloud uses the right voice
    showChip();
    collect();
  }

  // ---------- Start ----------

  async function start() {
    state = "starting"; // so two quick calls do not start twice
    const myRun = runId;
    const target = targetFor(pageLanguage());
    const langInfo = Ease.LANGUAGES.find((l) => l.code === pageLanguage());
    langName = langInfo ? langInfo.name : pageLanguage();
    sourceLang = await detectPageLanguage();
    if (myRun !== runId) {
      return; // stopped while we were waiting
    }

    // Page already in the user's language: nothing to do.
    const sameLanguage = target ? sourceLang === target : sourceLang === GOOGLE[pageLanguage()];
    if (sameLanguage) {
      state = "same-language";
      return;
    }

    if (!target) {
      state = "unsupported";
      showBar("unsupported");
      return;
    }

    pairKey = sourceLang + ">" + target;
    let availability;
    try {
      availability = await call("availability", { sourceLanguage: sourceLang, targetLanguage: target });
    } catch (error) {
      availability = "unavailable"; // older Chrome, or the site blocks it
    }
    if (myRun !== runId) {
      return;
    }

    if (availability === "available") {
      try {
        await call("create", { sourceLanguage: sourceLang, targetLanguage: target });
        if (myRun !== runId) {
          return;
        }
        beginTranslating();
        return;
      } catch (error) {
        if (myRun !== runId) {
          return;
        }
        // Chrome wants a click first. Fall through to the offer.
      }
    }
    if (availability === "available" || availability === "downloadable" || availability === "downloading") {
      state = "offered";
      showBar("offer");
      armAutoDownload(); // the next click anywhere gets the language ready
      return;
    }
    state = "unsupported";
    showBar("unsupported");
  }

  // The popup's "Translate this page now" button.
  // It brings the offer back, even after "Close" or "Not on this site".
  document.addEventListener("ease:translateNow", () => {
    dismissed = false;
    if (!settings || !settings.translatePage) {
      return; // the popup is turning the setting on; apply() will start soon
    }
    if (state === "original") {
      translateAgain();
    } else if (state !== "translating" && state !== "downloading" && state !== "starting") {
      hideBar();
      state = "idle";
      start();
    }
  });

  Ease.engine.register({
    id: "page-translate",
    observe: true, // translate new content (infinite scroll, comments)

    apply(newSettings) {
      const target = (s) => s.translateTo || s.language;
      const languageChanged = settings && target(settings) !== target(newSettings);
      settings = newSettings;
      if (!settings.translatePage || window.top !== window) {
        this.remove();
        return;
      }
      if (languageChanged) {
        this.remove();
        dismissed = false; // a new language deserves a new offer
      }
      if (state === "idle" && !dismissed) {
        start();
      } else if (state === "translating") {
        collect(); // new content arrived
      }
    },

    remove() {
      if (state === "translating" || state === "original") {
        showOriginal();
      }
      runId += 1; // tell any work still running to stop
      disarmAutoDownload();
      state = "idle";
      queue = [];
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      Ease.translatedVoice = null;
      hideBar();
      hideChip();
    }
  });
})();
