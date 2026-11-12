// Big Tooltips.
// When the mouse rests on (or the keyboard reaches) something whose name is hidden,
// Ease shows the name in a big, easy-to-read box:
//   - icon buttons and links with no words ("Menu", "Search", "Shopping cart")
//   - images (their description, the "alt" text)
//   - anything with a small browser tooltip ("title"), which is often tiny and fast to disappear
// The website's own tiny tooltip is hidden while ours shows, so there are not two at once.

(function () {
  const Ease = globalThis.Ease;

  const WAIT = 350; // ms before showing, so moving across the page stays calm
  const MAX_TEXT = 160;

  let enabled = false;
  let scale = 1;
  let host = null;
  let current = null;
  let timer = null;

  // The name to show for this element, or "".
  function nameFor(element) {
    if (!element || element.closest("[id^='ease-']")) {
      return "";
    }
    if (element.tagName === "IMG") {
      return (element.getAttribute("alt") || element.getAttribute("title") || "").trim();
    }
    const title = (element.getAttribute("title") || element.dataset.easeTitle || "").trim();
    if (title) {
      return title;
    }
    const label = (element.getAttribute("aria-label") || "").trim();
    const words = (element.innerText || element.textContent || "").trim();
    if (label && !/[\p{L}\p{N}]{2,}/u.test(words)) {
      return label; // icon-only control
    }
    return "";
  }

  // The closest element (from where the mouse is) that has a hidden name.
  function targetFrom(node) {
    let element = node && node.nodeType === 1 ? node : node && node.parentElement;
    for (let depth = 0; element && depth < 4; depth += 1) {
      if (nameFor(element)) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function show(element) {
    const text = nameFor(element).slice(0, MAX_TEXT);
    if (!text) {
      return;
    }
    // Hide the website's own small tooltip while ours is showing.
    if (element.hasAttribute("title")) {
      element.dataset.easeTitle = element.getAttribute("title");
      element.removeAttribute("title");
    }
    if (!host) {
      host = document.createElement("div");
      host.id = "ease-big-tooltip";
      host.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>
          .tip { max-width: min(320px, 90vw); padding: 8px 12px; border-radius: 10px;
                 background: #2A2F36; color: #FBFBF9; box-shadow: 0 6px 18px rgba(0,0,0,0.25);
                 font: 600 calc(17px * var(--s)) / 1.35 system-ui, sans-serif; }
        </style><div class="tip" role="tooltip"></div>`;
      document.documentElement.appendChild(host);
    }
    host.style.setProperty("--s", String(scale));
    host.shadowRoot.querySelector(".tip").textContent = text;
    host.hidden = false;
    const rect = element.getBoundingClientRect();
    const box = host.shadowRoot.querySelector(".tip").getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - box.width / 2), window.innerWidth - box.width - 8);
    let top = rect.bottom + 8;
    if (top + box.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - box.height - 8); // no room below: show above
    }
    host.style.left = left + "px";
    host.style.top = top + "px";
    current = element;
  }

  function hide() {
    clearTimeout(timer);
    if (current && current.dataset.easeTitle) {
      current.setAttribute("title", current.dataset.easeTitle); // give the website its tooltip back
      delete current.dataset.easeTitle;
    }
    current = null;
    if (host) {
      host.hidden = true;
    }
  }

  function onEnter(event) {
    const element = targetFrom(event.target);
    if (element === current) {
      return;
    }
    hide();
    if (!element) {
      return;
    }
    timer = setTimeout(() => show(element), event.type === "focusin" ? 0 : WAIT);
  }

  function onLeave(event) {
    const element = targetFrom(event.target);
    if (element && element === current) {
      const to = event.relatedTarget;
      if (to && element.contains(to)) {
        return; // still inside the same button
      }
      hide();
    } else {
      clearTimeout(timer);
    }
  }

  function onKey(event) {
    if (event.key === "Escape") {
      hide();
    }
  }

  Ease.engine.register({
    id: "big-tooltips",
    observe: false,

    apply(settings) {
      scale = (Number(settings.textSize) || 100) / 100;
      if (!settings.bigTooltips) {
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
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("scroll", hide, { passive: true, capture: true });
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
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, { capture: true });
      hide();
      if (host) {
        host.remove();
        host = null;
      }
    }
  });

  Ease.bigTooltips = { nameFor };
})();
