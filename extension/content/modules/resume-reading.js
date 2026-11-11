// Resume Reading ("Remember where I stopped").
// On long pages, Ease remembers how far you read.
// When you come back, a small bar asks: "Continue where you left off?"
//
// Saved only on this device, for 30 days, for at most 100 pages.
// We save the start of the paragraph you were reading, so we can find it again
// even if the page changed a little. If we can not find it, we use the scroll position.

(function () {
  const Ease = globalThis.Ease;

  const READ_BLOCKS = "p, li, h1, h2, h3, h4, blockquote, pre, dd, td";
  let enabled = false;
  let saveTimer = null;
  let bar = null;
  let hideBarTimer = null;
  let textScale = 1;

  const pageKey = () => location.host + location.pathname;

  function isLongPage() {
    return document.documentElement.scrollHeight > window.innerHeight * 3;
  }

  function scrollFraction() {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    return room > 0 ? window.scrollY / room : 0;
  }

  // The paragraph at the top part of the screen, where people read.
  function blockAtReadingLine() {
    const x = window.innerWidth / 2;
    const y = window.innerHeight * 0.3;
    for (const offset of [0, -80, 80, -160, 160]) {
      const element = document.elementFromPoint(x + offset, y);
      const block = element && element.closest ? element.closest(READ_BLOCKS) : null;
      if (block && !block.closest("[id^='ease-']") && block.textContent.trim().length >= 20) {
        return block;
      }
    }
    return null;
  }

  function saveNow() {
    if (!isLongPage()) {
      return;
    }
    const fraction = scrollFraction();
    if (fraction > 0.95) {
      Ease.storage.clearReadingSpot(pageKey()); // finished reading: nothing to continue
      return;
    }
    if (fraction < 0.1) {
      return; // just started: not worth remembering
    }
    const block = blockAtReadingLine();
    const snippet = block ? block.textContent.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    Ease.storage.saveReadingSpot(pageKey(), { fraction: Math.round(fraction * 1000) / 1000, snippet });
  }

  function onScroll() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1500); // save when the user pauses, not on every pixel
    if (bar && scrollFraction() > 0.1) {
      hideBar(); // the user is already reading: no need to ask
    }
  }

  // Go back to the saved spot.
  function jumpTo(spot) {
    if (spot.snippet && spot.snippet.length >= 20) {
      for (const block of document.body.querySelectorAll(READ_BLOCKS)) {
        if (block.textContent.trim().replace(/\s+/g, " ").startsWith(spot.snippet)) {
          const top = block.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3;
          window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
          return;
        }
      }
    }
    const room = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: spot.fraction * room, behavior: "auto" });
  }

  function hideBar() {
    clearTimeout(hideBarTimer);
    if (bar) {
      bar.remove();
      bar = null;
    }
  }

  function showBar(spot) {
    const host = document.createElement("div");
    host.id = "ease-resume-reading";
    host.style.cssText = "position:fixed;z-index:2147483646;bottom:16px;left:50%;transform:translateX(-50%);";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px;
             border-radius: 12px; background: #FBFBF9; color: #2A2F36; border: 1px solid #DDDDD6;
             box-shadow: 0 6px 18px rgba(0,0,0,0.16); max-width: 92vw;
             font: 400 calc(14px * ${textScale}) / 1.4 system-ui, sans-serif; }
      button { height: calc(36px * ${textScale}); padding: 0 12px; border-radius: 9px; cursor: pointer;
               font: 700 calc(14px * ${textScale}) / 1 system-ui, sans-serif; }
      .main { border: none; background: #4A5A8C; color: #FBFBF9; }
      .plain { border: 1px solid #DDDDD6; background: transparent; color: #2A2F36; }
      button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }`;
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = Ease.i18n.t("rrAsk");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "main";
    go.textContent = Ease.i18n.t("rrContinue");
    go.addEventListener("click", () => {
      hideBar();
      jumpTo(spot);
    });
    const no = document.createElement("button");
    no.type = "button";
    no.className = "plain";
    no.textContent = Ease.i18n.t("rrNo");
    no.addEventListener("click", () => {
      hideBar();
      Ease.storage.clearReadingSpot(pageKey());
    });
    box.append(text, go, no);
    shadow.append(style, box);
    document.documentElement.appendChild(host);
    bar = host;
    hideBarTimer = setTimeout(hideBar, 30000); // a quiet offer, not a nag
  }

  async function offerToContinue() {
    const spot = await Ease.storage.loadReadingSpot(pageKey());
    if (!enabled || !spot || bar || scrollFraction() > 0.1) {
      return; // nothing saved, or the browser already put the user back
    }
    showBar(spot);
  }

  Ease.engine.register({
    id: "resume-reading",
    observe: false,

    apply(settings) {
      textScale = (Number(settings.textSize) || 100) / 100;
      if (!settings.resumeReading) {
        this.remove();
        return;
      }
      if (enabled) {
        return;
      }
      enabled = true;
      window.addEventListener("scroll", onScroll, { passive: true });
      setTimeout(() => {
        if (enabled && isLongPage()) {
          offerToContinue();
        }
      }, 800); // let the page finish its layout first
    },

    remove() {
      enabled = false;
      clearTimeout(saveTimer);
      window.removeEventListener("scroll", onScroll);
      hideBar();
    }
  });
})();
