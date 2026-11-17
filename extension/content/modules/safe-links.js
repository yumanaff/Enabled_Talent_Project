// Safe Links (scam guard).
// When the mouse rests on a link (or the keyboard reaches it), Ease shows where it goes:
//   - "Goes to another website: example.com"
//   - "Downloads a program (.exe)", "Opens a file (.pdf)", "Opens in a new tab"
//   - "Starts an email to ...", "Starts a phone call to ..."
// And it warns about common scam tricks:
//   - look-alike names (paypa1.com, amazon-secure-login.xyz)
//   - link text that shows one website but goes to another
//   - a website with only numbers (an IP address) instead of a name
// For these "danger" links, the first click is stopped and the user chooses:
// "Go anyway" or "Stay here".
//
// Everything is checked on this device. No link is sent anywhere.

(function () {
  const Ease = globalThis.Ease;

  // ---------- Checking a link (no page changes here, easy to test) ----------

  // Big brands that scammers copy, and their real websites.
  // Only brands with names of 5+ letters, so short words do not cause false alarms.
  const BRANDS = {
    paypal: ["paypal.com", "paypal.ca", "paypal.me", "paypalobjects.com"],
    amazon: ["amazon.com", "amazon.ca", "amazon.co.uk", "amzn.to", "amazonaws.com", "amazon-adsystem.com", "media-amazon.com"],
    apple: ["apple.com", "icloud.com", "apple.co"],
    icloud: ["icloud.com", "apple.com"],
    google: ["google.com", "google.ca", "youtube.com", "gmail.com", "goo.gl", "googleusercontent.com", "gstatic.com", "google-analytics.com", "googleapis.com"],
    gmail: ["gmail.com", "google.com"],
    microsoft: ["microsoft.com", "live.com", "office.com", "microsoftonline.com", "msn.com", "bing.com"],
    outlook: ["outlook.com", "live.com", "office.com", "microsoft.com"],
    netflix: ["netflix.com"],
    facebook: ["facebook.com", "fb.com", "messenger.com", "meta.com"],
    instagram: ["instagram.com"],
    whatsapp: ["whatsapp.com", "whatsapp.net", "wa.me"],
    linkedin: ["linkedin.com", "lnkd.in"],
    dropbox: ["dropbox.com"],
    docusign: ["docusign.com", "docusign.net"],
    canadapost: ["canadapost.ca", "canadapost-postescanada.ca", "postescanada.ca"],
    interac: ["interac.ca"],
    scotiabank: ["scotiabank.com"],
    desjardins: ["desjardins.com"],
    rbcroyalbank: ["rbcroyalbank.com", "rbc.com"],
    tdbank: ["td.com", "tdbank.com"],
    walmart: ["walmart.com", "walmart.ca"],
    costco: ["costco.com", "costco.ca"],
    purolator: ["purolator.com"],
    fedex: ["fedex.com"],
    telus: ["telus.com"],
    rogers: ["rogers.com"]
  };

  // How each brand writes its own name.
  const BRAND_NAMES = {
    paypal: "PayPal", icloud: "iCloud", linkedin: "LinkedIn", whatsapp: "WhatsApp", docusign: "DocuSign",
    canadapost: "Canada Post", rbcroyalbank: "RBC Royal Bank", tdbank: "TD Bank", fedex: "FedEx"
  };

  // Files that install or run a program.
  const PROGRAM_FILES = ["exe", "msi", "bat", "cmd", "scr", "vbs", "jar", "apk", "dmg", "pkg", "iso", "ps1", "appx", "msix"];
  // Files that open in another app.
  const OTHER_FILES = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "rar", "7z", "csv", "txt", "rtf", "odt"];

  // Country endings with a second level, like example.co.uk or canada.gc.ca
  const SECOND_LEVEL = ["co", "com", "org", "net", "gov", "gc", "ac", "edu", "on", "qc", "bc", "ab"];

  // "news.cbc.ca" -> "cbc.ca". Good enough to tell websites apart.
  function siteOf(host) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) {
      return host; // an IP address has no website name
    }
    const parts = host.toLowerCase().replace(/^www\./, "").split(".");
    if (parts.length <= 2) {
      return parts.join(".");
    }
    const last = parts[parts.length - 1];
    const second = parts[parts.length - 2];
    const keep = last.length === 2 && SECOND_LEVEL.includes(second) ? 3 : 2;
    return parts.slice(-keep).join(".");
  }

  // Undo letter tricks: paypa1 -> paypal, rnicrosoft -> microsoft
  function unTrick(word) {
    return word
      .toLowerCase()
      .replace(/rn/g, "m")
      .replace(/vv/g, "w")
      .replace(/0/g, "o")
      .replace(/1/g, "l")
      .replace(/3/g, "e")
      .replace(/4/g, "a")
      .replace(/5/g, "s")
      .replace(/7/g, "t")
      .replace(/8/g, "b");
  }

  // How many letters must change to turn a into b.
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 1) {
      return 2;
    }
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = keep;
      }
    }
    return row[b.length];
  }

  let sameTabOn = false; // set in apply(): with "Same tab" on, links never open a new tab

  // Brand names that are also normal words ("apple pie", "rogers family").
  // For these we need a second sign of a scam, so normal websites do not get a warning.
  const COMMON_WORDS = ["apple", "amazon", "google", "outlook", "rogers"];
  const SCAM_WORDS = ["login", "signin", "verify", "verification", "secure", "security", "account", "update", "support", "billing", "wallet", "auth", "confirm", "unlock", "id", "help", "refund", "pay", "payment", "service"];

  // Which brand this host pretends to be, or null.
  function lookAlike(host) {
    const lower = host.toLowerCase();
    const site = siteOf(lower);
    for (const official of Object.values(BRANDS)) {
      if (official.includes(site)) {
        return null; // a real brand website
      }
    }
    const words = lower.split(/[.-]/);
    const scammy = words.some((word) => SCAM_WORDS.includes(word));
    for (const brand of Object.keys(BRANDS)) {
      const fakeAddress = lower.includes(brand + ".com.") || lower.includes(brand + ".ca."); // paypal.com.evil.xyz
      for (const word of words) {
        const clean = unTrick(word);
        const tricked = clean !== word;
        if (clean === brand) {
          if (tricked || fakeAddress || !COMMON_WORDS.includes(brand) || scammy) {
            return brand;
          }
        } else if (brand.length >= 6 && clean.length >= 5 && distance(clean, brand) === 1) {
          return brand; // one letter changed: gooogle, paypall, netflx
        }
      }
    }
    return null;
  }

  // A link text that looks like a web address: "www.paypal.com" or "https://paypal.com/login"
  const SHOWN_ADDRESS = /^(https?:\/\/)?(www\.)?(([a-z0-9-]+\.)+[a-z]{2,})(\/\S*)?$/i;

  // Returns { level: "info" | "caution" | "danger", lines: [{ key, params, level }] } or null.
  function check(href, linkText, target, hasDownload, pageHost) {
    let url;
    try {
      url = new URL(href, location.href);
    } catch (error) {
      return null;
    }
    const lines = [];
    const add = (key, params, level) => lines.push({ key, params: params || {}, level });

    if (url.protocol === "mailto:") {
      add("slEmail", { to: decodeURIComponent(url.pathname).split("?")[0] }, "info");
    } else if (url.protocol === "tel:") {
      add("slPhone", { to: decodeURIComponent(url.pathname) }, "info");
    } else if (url.protocol === "http:" || url.protocol === "https:") {
      const host = url.hostname.toLowerCase();
      const otherSite = siteOf(host) !== siteOf(pageHost);

      // Scam tricks first, so they are the first thing people read.
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) {
        add("slNumbers", {}, "danger");
      }
      const brand = lookAlike(host);
      if (brand) {
        const name = brandName(brand);
        add("slLookalike", { brand: name }, "danger");
      }
      const shown = (linkText || "").trim().match(SHOWN_ADDRESS);
      if (shown && siteOf(shown[3]) !== siteOf(host)) {
        add("slMismatch", { shown: shown[3].toLowerCase(), site: siteOf(host) }, "danger");
      }

      if (otherSite) {
        add("slOtherSite", { site: siteOf(host) }, "info");
        if (url.protocol === "http:") {
          add("slNotSecure", {}, "caution");
        }
      }

      const ext = (url.pathname.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
      const lowerExt = ext ? ext.toLowerCase() : "";
      if (PROGRAM_FILES.includes(lowerExt)) {
        add("slProgram", { ext: "." + lowerExt }, "caution");
      } else if (OTHER_FILES.includes(lowerExt)) {
        add("slOpensFile", { ext: "." + lowerExt }, "info");
      } else if (hasDownload) {
        add("slDownload", {}, "info");
      }
    } else {
      return null; // javascript:, #, and other links: nothing useful to say
    }

    if (target === "_blank" && !sameTabOn) {
      add("slNewTab", {}, "info"); // not true when Ease opens links in the same tab
    }
    if (!lines.length) {
      return null;
    }
    const levels = lines.map((line) => line.level);
    const level = levels.includes("danger") ? "danger" : levels.includes("caution") ? "caution" : "info";
    return { level, lines };
  }

  function brandName(brand) {
    return BRAND_NAMES[brand] || brand.charAt(0).toUpperCase() + brand.slice(1);
  }

  // For tests and for other modules (Scam Guard uses lookAlike and brandName).
  Ease.safeLinks = { check, siteOf, lookAlike, brandName };

  // ---------- Showing the note ----------

  let enabled = false;
  let textScale = 1;
  let tip = null; // { host, box }
  let tipLink = null;
  let showTimer = null;
  let hideTimer = null;
  const allowed = new WeakSet(); // danger links the user chose to open anyway

  const COLORS = {
    info: "background:#FBFBF9;color:#2A2F36;border-color:#DDDDD6;",
    caution: "background:#FFF6DD;color:#5A4300;border-color:#E8D49A;",
    danger: "background:#FBEDE5;color:#6B2E10;border-color:#E9B9A0;"
  };
  const ICONS = { info: "↗", caution: "⚠", danger: "⚠" };

  function makeTip() {
    const host = document.createElement("div");
    host.id = "ease-safe-links";
    host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .box { max-width: min(360px, 90vw); padding: 10px 12px; border: 1px solid; border-radius: 12px;
             box-shadow: 0 6px 18px rgba(0,0,0,0.16); font: 400 calc(14px * var(--s)) / 1.4 system-ui, sans-serif; }
      .line { display: flex; gap: 8px; margin: 2px 0; }
      .line.danger { font-weight: 700; }
      .icon { flex: none; width: 1.1em; text-align: center; }
      b { font-weight: 700; word-break: break-all; }
      .stop { margin: 6px 0 2px; font-weight: 700; }
      .buttons { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
      button { height: calc(36px * var(--s)); padding: 0 12px; border-radius: 9px; cursor: pointer;
               font: 700 calc(14px * var(--s)) / 1 system-ui, sans-serif; }
      .stay { border: none; background: #4A5A8C; color: #FBFBF9; }
      .go { border: 1px solid currentColor; background: transparent; color: inherit; }
      button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }`;
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "status");
    shadow.append(style, box);
    host.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    host.addEventListener("pointerleave", () => scheduleHide());
    document.documentElement.appendChild(host);
    return { host, box };
  }

  // Put the text in, with the {site} part in bold.
  function lineElement(line) {
    const row = document.createElement("div");
    row.className = "line " + line.level;
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ICONS[line.level];
    const text = document.createElement("span");
    const marker = "\u0000";
    const boldParams = {};
    const values = [];
    for (const [name, value] of Object.entries(line.params)) {
      boldParams[name] = marker + values.length + marker;
      values.push(value);
    }
    const parts = Ease.i18n.t(line.key, boldParams).split(marker);
    parts.forEach((part, index) => {
      if (index % 2 === 1) {
        const b = document.createElement("b");
        b.textContent = values[Number(part)];
        text.appendChild(b);
      } else if (part) {
        text.appendChild(document.createTextNode(part));
      }
    });
    row.append(icon, text);
    return row;
  }

  function place(link) {
    const rect = link.getBoundingClientRect();
    const box = tip.box;
    const width = box.offsetWidth || 300;
    const height = box.offsetHeight || 60;
    let left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 8); // no room below: show above
    }
    tip.host.style.left = left + "px";
    tip.host.style.top = top + "px";
  }

  function show(link, result, stopped) {
    if (!tip) {
      tip = makeTip();
    }
    tipLink = link;
    tip.host.style.setProperty("--s", String(textScale));
    tip.box.style.cssText = COLORS[result.level];
    tip.box.textContent = "";
    for (const line of result.lines) {
      tip.box.appendChild(lineElement(line));
    }
    if (stopped) {
      const note = document.createElement("div");
      note.className = "stop";
      note.textContent = Ease.i18n.t("slStop");
      const buttons = document.createElement("div");
      buttons.className = "buttons";
      const stay = document.createElement("button");
      stay.type = "button";
      stay.className = "stay";
      stay.textContent = Ease.i18n.t("slStay");
      stay.addEventListener("click", hide);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "go";
      go.textContent = Ease.i18n.t("slGo");
      go.addEventListener("click", () => {
        allowed.add(link);
        hide();
        link.click(); // the website's own click code still runs
      });
      buttons.append(stay, go);
      tip.box.append(note, buttons);
      tip.box.setAttribute("role", "alertdialog");
      tip.box.setAttribute("aria-label", Ease.i18n.t("slStop")); // screen readers hear why it stopped
      stay.focus({ preventScroll: true }); // the safe choice is the easy one
    } else {
      tip.box.setAttribute("role", "status");
      tip.box.removeAttribute("aria-label");
    }
    place(link);
  }

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (tip) {
      tip.host.remove();
      tip = null;
    }
    tipLink = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    // Stay open a moment, so the user can move the mouse onto the buttons.
    hideTimer = setTimeout(() => {
      if (tip && tip.box.getAttribute("role") === "alertdialog") {
        return; // the "Go anyway / Stay here" question stays until answered
      }
      hide();
    }, 300);
  }

  function linkFrom(event) {
    const element = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    return element && !element.closest("#ease-safe-links") ? element : null;
  }

  function resultFor(link) {
    return check(link.getAttribute("href"), link.innerText || link.textContent, link.target, link.hasAttribute("download"), location.hostname);
  }

  function onEnter(event) {
    const link = linkFrom(event);
    if (!link || link === tipLink) {
      return;
    }
    clearTimeout(showTimer);
    const result = resultFor(link);
    if (!result) {
      if (tip && tip.box.getAttribute("role") !== "alertdialog") {
        hide(); // a plain link: remove the note from the last link
      }
      return;
    }
    // Keyboard focus shows right away. The mouse waits a little, so moving across a page is calm.
    const wait = event.type === "focusin" ? 0 : 400;
    showTimer = setTimeout(() => show(link, result, false), wait);
  }

  function onLeave(event) {
    const link = linkFrom(event);
    if (!link) {
      return;
    }
    clearTimeout(showTimer);
    if (link === tipLink) {
      scheduleHide();
    }
  }

  function onClick(event) {
    const link = linkFrom(event);
    if (!link || allowed.has(link) || event.button !== 0) {
      return;
    }
    const result = resultFor(link);
    if (!result || result.level !== "danger") {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    show(link, result, true);
  }

  function onKey(event) {
    if (event.key === "Escape" && tip) {
      hide();
    }
  }

  function onScroll() {
    if (tip && tip.box.getAttribute("role") !== "alertdialog") {
      hide();
    }
  }

  Ease.engine.register({
    id: "safe-links",
    observe: false, // listens on the whole page, so new links work too

    apply(settings) {
      textScale = (Number(settings.textSize) || 100) / 100;
      sameTabOn = Boolean(settings.sameTab);
      if (!settings.safeLinks) {
        this.remove();
        return;
      }
      if (enabled) {
        return;
      }
      enabled = true;
      document.addEventListener("pointerover", onEnter, true);
      document.addEventListener("focusin", onEnter, true);
      document.addEventListener("pointerout", onLeave, true);
      document.addEventListener("focusout", onLeave, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      document.removeEventListener("pointerover", onEnter, true);
      document.removeEventListener("focusin", onEnter, true);
      document.removeEventListener("pointerout", onLeave, true);
      document.removeEventListener("focusout", onLeave, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, { capture: true });
      hide();
    }
  });
})();
