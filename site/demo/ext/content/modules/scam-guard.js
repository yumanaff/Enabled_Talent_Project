// Scam Guard.
// Part of "Warn me about scams and risky links" (setting: safeLinks). Two checks:
//
// 1. Password and card warning
//    When the user starts typing a password or card number on a page that is
//    not secure (http) or that pretends to be a big brand (paypa1.com),
//    Ease shows a calm warning next to the box.
//
// 2. Fake warning pages
//    Tech-support scams show "Your computer is infected! Call Microsoft at 1-800-...".
//    Other scams ask you to pay with gift cards, or say "You won a prize!".
//    When a page looks like this, Ease shows a clear message at the top:
//    "This looks like a scam. Do not call any number."
//
// All checks run on this device. Nothing is sent anywhere.
// Long pages (like news articles ABOUT scams) are not checked, to avoid false alarms.

(function () {
  const Ease = globalThis.Ease;

  // ---------- The checks (no page changes here, easy to test) ----------

  const TECH_SUPPORT = [
    /your (computer|pc|device|system|windows|mac|iphone) (is|has been|may be) (infected|blocked|locked|compromised|hacked|at risk)/i,
    /(virus|viruses|malware|trojan|spyware)\s+(detected|found|alert)/i,
    /call (microsoft|windows|apple|google|amazon|norton|mcafee|geek squad)?\s*(support|technicians?|help ?desk|customer service)/i,
    /do not (close|restart|shut ?down|turn off) (this|your) (window|page|browser|computer|pc)/i,
    /(windows|microsoft|apple) (defender|security) (alert|warning)/i,
    /votre (ordinateur|appareil) (est|a été) (infecté|bloqué|verrouillé)/i,
    /appelez (le support|microsoft|le service technique)/i
  ];
  const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
  const GIFT_CARDS = [
    /(pay|payment|paid|purchase|buy|send)\b.{0,60}\b(gift ?cards?|google play cards?|itunes cards?|apple cards?|steam cards?|amazon cards?)/i,
    /(bitcoin|crypto) ?(atm|machine)/i,
    /(payer|achetez|paiement).{0,60}cartes?[- ]cadeaux?/i
  ];
  const PRIZE = [
    /(you('ve| have) (won|been selected)|congratulations.{0,40}(winner|selected|chosen))/i,
    /claim your (prize|reward|gift)/i,
    /(vous avez gagné|félicitations.{0,40}gagnant)/i
  ];
  const MAX_TEXT = 6000; // characters. Scam pages are short. Long articles are not checked.

  // Returns "tech" | "gift" | "prize" | null
  function checkPageText(text) {
    if (!text || text.length > MAX_TEXT) {
      return null;
    }
    const tech = TECH_SUPPORT.filter((re) => re.test(text)).length;
    if (tech >= 2 || (tech >= 1 && PHONE.test(text))) {
      return "tech";
    }
    if (GIFT_CARDS.some((re) => re.test(text))) {
      return "gift";
    }
    if (PRIZE.some((re) => re.test(text)) && (PHONE.test(text) || /card|credit|bank|carte/i.test(text))) {
      return "prize";
    }
    return null;
  }

  // Returns { key, params } for a password or card box, or null if the page looks fine.
  function checkPasswordPage(protocol, host) {
    const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
    if (protocol === "http:" && !local) {
      return { key: "scamPassHttp", params: {} };
    }
    const brand = Ease.safeLinks && Ease.safeLinks.lookAlike(host);
    if (brand) {
      return { key: "scamPassLookalike", params: { brand: Ease.safeLinks.brandName(brand) } };
    }
    return null;
  }

  Ease.scamGuard = { checkPageText, checkPasswordPage };

  // ---------- Showing the warnings ----------

  let enabled = false;
  let pageBanner = null;
  let fieldNote = null;
  let fieldWarned = false;
  let checkTimers = [];

  const STYLE = `
    .box { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 14px;
           border-radius: 12px; background: #FBEDE5; color: #6B2E10; border: 2px solid #E9B9A0;
           box-shadow: 0 6px 18px rgba(0,0,0,0.18); font: 400 15px/1.45 system-ui, sans-serif; max-width: 92vw; }
    .title { font-weight: 700; font-size: 17px; width: 100%; }
    .text { width: 100%; }
    button { height: 40px; padding: 0 14px; border-radius: 10px; cursor: pointer; font: 700 14px/1 system-ui, sans-serif; }
    .main { border: none; background: #4A5A8C; color: #FBFBF9; }
    .plain { border: 1px solid #C99A82; background: transparent; color: #6B2E10; }
    button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }`;

  function makeBox(id, css) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;z-index:2147483647;" + css;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "alert");
    shadow.append(style, box);
    document.documentElement.appendChild(host);
    return { host, box };
  }

  function button(text, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function line(cls, text) {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    return el;
  }

  // --- Fake warning pages ---

  async function checkPage() {
    if (!enabled || pageBanner || !document.body) {
      return;
    }
    const kind = checkPageText((document.body.innerText || "").slice(0, MAX_TEXT + 1));
    if (!kind) {
      return;
    }
    const site = await Ease.storage.loadSiteSettings(location.hostname);
    if (site.scamOk || !enabled || pageBanner) {
      return; // the user said this page is fine
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {}); // scam pages often go full screen to scare people
    }
    const t = Ease.i18n.t.bind(Ease.i18n);
    const { host, box } = makeBox("ease-scam-banner", "top:12px;left:50%;transform:translateX(-50%);width:min(640px,92vw);");
    box.append(
      line("title", "⚠ " + t("scamPageTitle")),
      line("text", t("scamPageText_" + kind)),
      button(t("scamCloseTab"), "main", () => chrome.runtime.sendMessage({ type: "closeTab" })),
      button(t("scamPageOk"), "plain", async () => {
        await Ease.storage.saveSiteSettings(location.hostname, { scamOk: true });
        hidePageBanner();
      })
    );
    pageBanner = host;
    box.querySelector("button.main").focus({ preventScroll: true });
  }

  function hidePageBanner() {
    if (pageBanner) {
      pageBanner.remove();
      pageBanner = null;
    }
  }

  // --- Password and card boxes ---

  function isSecretBox(element) {
    if (!element || element.tagName !== "INPUT") {
      return false;
    }
    const type = (element.getAttribute("type") || "").toLowerCase();
    const hints = [element.getAttribute("autocomplete"), element.name, element.id].join(" ").toLowerCase();
    return type === "password" || /cc-number|card.?num|cardnumber|credit.?card|\bcvv\b|\bcvc\b/.test(hints);
  }

  function onFocus(event) {
    const target = event.composedPath ? event.composedPath()[0] : event.target;
    if (fieldWarned || !isSecretBox(target)) {
      return;
    }
    const warning = checkPasswordPage(location.protocol, location.hostname);
    if (!warning) {
      return;
    }
    fieldWarned = true; // once per page is enough
    const rect = target.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 160, rect.bottom + 8);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 420));
    const { host, box } = makeBox("ease-scam-field", `top:${Math.max(8, top)}px;left:${left}px;width:min(400px,92vw);`);
    box.append(
      line("text", Ease.i18n.t(warning.key, warning.params)),
      button(Ease.i18n.t("scamGotIt"), "plain", hideFieldNote)
    );
    fieldNote = host;
  }

  function hideFieldNote() {
    if (fieldNote) {
      fieldNote.remove();
      fieldNote = null;
    }
  }

  Ease.engine.register({
    id: "scam-guard",
    observe: false,

    apply(settings) {
      if (!settings.safeLinks) {
        this.remove();
        return;
      }
      if (enabled) {
        return;
      }
      enabled = true;
      document.addEventListener("focusin", onFocus, true);
      // Scam pages often draw their warning a moment after loading.
      checkTimers = [0, 1500, 4000].map((ms) => setTimeout(checkPage, ms));
    },

    remove() {
      enabled = false;
      document.removeEventListener("focusin", onFocus, true);
      checkTimers.forEach(clearTimeout);
      checkTimers = [];
      hidePageBanner();
      hideFieldNote();
    }
  });
})();
