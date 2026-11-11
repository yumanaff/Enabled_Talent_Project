// Hide Pop-ups.
// Many websites cover the page with boxes the user did not ask for:
// "Subscribe to our newsletter!", "Accept cookies", "Wait! Before you go...".
// These confuse many older adults, and they are stressful for autistic people and people with ADHD.
//
// Ease hides:
//   - boxes in the middle of the screen that cover the page (and the dark layer behind them)
//   - cookie and privacy banners at the top or bottom of the screen
// It does NOT hide boxes the user opened (a box that appears right after a click is left alone).
// A small "Pop-ups hidden · Show" chip brings everything back.

(function () {
  const Ease = globalThis.Ease;

  const COOKIE_WORDS = /cookie|consent|gdpr|privacy|témoins|galletas|privacidad|privacy policy|datenschutz/i;
  const USER_OPENED_WINDOW = 2000; // ms: a box that appears this soon after a click was opened by the user

  let enabled = false;
  let lastUserAction = 0;
  let chip = null;
  const hidden = new Set();
  const userOpened = new WeakSet();

  function onUserAction() {
    lastUserAction = Date.now();
  }

  // The fixed-position box that holds this element, or null.
  function fixedAncestor(element) {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      const position = getComputedStyle(current).position;
      if (position === "fixed" || position === "sticky") {
        return position === "fixed" ? current : null;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isOurs(element) {
    return element.closest("[id^='ease-'], .ease-chip, .ease-trigger-inline");
  }

  const POPUP_NAMES = /modal|popup|pop-up|overlay|dialog|newsletter|subscribe|lightbox|interstitial|backdrop|signup|paywall|consent/i;

  function namedPopup(box) {
    const names = (box.id || "") + " " + (typeof box.className === "string" ? box.className : "");
    return box.getAttribute("aria-modal") === "true" || box.getAttribute("role") === "dialog" || box.tagName === "DIALOG" || POPUP_NAMES.test(names);
  }

  // Some web apps (maps, email) put their whole page in a fixed box.
  // So a big box in the middle is only a pop-up if it says so, or sits high above the page.
  function looksLikePopup(box) {
    // textContent is cheap. innerText makes the browser lay out the whole page (very slow on long pages).
    const bodyText = document.body.textContent.length;
    const boxText = box.textContent.length;
    if (bodyText > 0 && boxText > bodyText * 0.5) {
      return false; // it holds most of the page: this is the page itself
    }
    if (box.getAttribute("aria-modal") === "true" || box.getAttribute("role") === "dialog" || box.tagName === "DIALOG") {
      return true;
    }
    const names = (box.id || "") + " " + (typeof box.className === "string" ? box.className : "");
    if (POPUP_NAMES.test(names)) {
      return true;
    }
    const z = parseInt(getComputedStyle(box).zIndex, 10);
    return z >= 100;
  }

  // Look at what covers a few points of the screen.
  function findCovers() {
    const found = new Set();
    if (!document.elementsFromPoint) {
      return found;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const points = [
      [w / 2, h / 2, "middle"],
      [w / 2, h * 0.35, "middle"],
      [w / 2, h - 24, "edge"],
      [24, h - 24, "edge"],
      [w / 2, 24, "edge"]
    ];
    for (const [x, y, where] of points) {
      for (const element of document.elementsFromPoint(x, y)) {
        if (!element || !element.closest || isOurs(element)) {
          continue;
        }
        const box = fixedAncestor(element);
        if (!box || hidden.has(box) || userOpened.has(box) || found.has(box)) {
          continue;
        }
        if (box.querySelector("video") || box.contains(document.activeElement && document.activeElement !== document.body ? document.activeElement : null)) {
          continue; // a video player, or the user is typing in it
        }
        const rect = box.getBoundingClientRect();
        const big = rect.width > w * 0.4 && rect.height > h * 0.25;
        // Smaller boxes count too, when they clearly say they are a pop-up (class "modal", role="dialog"...).
        const medium = rect.width > 240 && rect.height > 120 && namedPopup(box);
        const text = box.textContent.slice(0, 2000);
        if (where === "middle" && (big || medium) && looksLikePopup(box)) {
          found.add(box); // a pop-up box, or the dark layer behind it
        } else if (where === "edge" && COOKIE_WORDS.test(text) && rect.height < h * 0.6) {
          found.add(box); // a cookie banner
        }
      }
    }
    return found;
  }

  // Checking what covers the screen needs the page layout. We wait until the browser is idle,
  // so this never slows down the page while it loads.
  let idleHandle = null;
  function scanWhenIdle() {
    if (idleHandle) {
      return;
    }
    const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    idleHandle = later(() => {
      idleHandle = null;
      scan();
    }, { timeout: 1500 });
  }

  function scan() {
    if (!enabled || !document.body) {
      return;
    }
    const covers = findCovers();
    if (!covers.size) {
      return;
    }
    if (Date.now() - lastUserAction < USER_OPENED_WINDOW) {
      covers.forEach((box) => userOpened.add(box)); // the user clicked something: this box is wanted
      return;
    }
    for (const box of covers) {
      box.dataset.easePopup = "hidden";
      hidden.add(box);
    }
    // Pop-ups often stop the page from scrolling. Let it scroll again.
    const bodyFixed = getComputedStyle(document.body).position === "fixed";
    Ease.engine.setStyle(
      "hide-popups",
      `[data-ease-popup="hidden"] { display: none !important; }
       html, body { overflow: auto !important; }` + (bodyFixed ? " body { position: static !important; }" : "")
    );
    showChip();
  }

  function showChip() {
    if (!chip) {
      chip = document.createElement("div");
      chip.id = "ease-popups-chip";
      chip.style.cssText = "position:fixed;z-index:2147483646;bottom:12px;right:12px;";
      const shadow = chip.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>
          .box { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px; border-radius: 12px;
                 background: #FBFBF9; color: #555B66; border: 1px solid #DDDDD6; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                 font: 400 13px/1.3 system-ui, sans-serif; }
          button { height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid #DDDDD6; background: transparent;
                   color: #34406A; font: 700 13px/1 system-ui, sans-serif; cursor: pointer; }
          button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }
        </style><div class="box" role="status"><span class="text"></span><button type="button"></button></div>`;
      shadow.querySelector("button").addEventListener("click", () => showAll(true));
      document.documentElement.appendChild(chip);
    }
    chip.shadowRoot.querySelector(".text").textContent = Ease.i18n.t("popupsHidden", { n: hidden.size });
    chip.shadowRoot.querySelector("button").textContent = Ease.i18n.t("chipShow");
  }

  // Bring everything back (and do not hide these boxes again on this page).
  // wanted = true: the user pressed "Show", so never hide these boxes again.
  // wanted = false: the tool was turned off. If it is turned on again, they are hidden again.
  function showAll(wanted) {
    for (const box of hidden) {
      delete box.dataset.easePopup;
      if (wanted) {
        userOpened.add(box);
      }
    }
    hidden.clear();
    Ease.engine.removeStyle("hide-popups");
    if (chip) {
      chip.remove();
      chip = null;
    }
  }

  Ease.engine.register({
    id: "hide-popups",
    observe: true, // pop-ups often appear a few seconds after the page loads

    apply(settings) {
      if (!settings.hidePopups) {
        this.remove();
        return;
      }
      if (!enabled) {
        enabled = true;
        document.addEventListener("pointerdown", onUserAction, true);
        document.addEventListener("keydown", onUserAction, true);
        setTimeout(scanWhenIdle, 1500); // pop-ups on a timer
        setTimeout(scanWhenIdle, 5000);
      }
      scanWhenIdle();
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      document.removeEventListener("pointerdown", onUserAction, true);
      document.removeEventListener("keydown", onUserAction, true);
      showAll(false);
    }
  });
})();
