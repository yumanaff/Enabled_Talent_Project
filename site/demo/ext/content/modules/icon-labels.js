// Icon Labels ("Name the icon buttons").
// Many buttons show only a picture: ☰  🔍  ⚙  ✕
// Websites often hide the button's name in the code (for screen readers).
// This feature shows that hidden name as a small word under the icon.
//
// We only use names the website already wrote. We never guess.

(function () {
  const Ease = globalThis.Ease;

  const CANDIDATES = 'button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], summary';
  const MAX_NAME = 28; // longer names would make a mess of small toolbars
  const MAX_SIZE = 120; // px. Bigger elements are not "icon buttons"

  const added = new Set(); // our label elements, so remove() can undo everything
  let enabled = false;

  // True when the element shows no real words (only icons, symbols or emoji).
  // textContent is cheap. (innerText makes the browser lay out the page, which is slow on long pages.)
  // Text hidden for screen readers ("sr-only") counts as no visible words, so we skip it.
  function hasNoVisibleWords(element) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === 3) {
        text += node.nodeValue;
      } else if (node.nodeType === 1 && !/sr-only|visually-hidden|screen-reader/i.test(node.className || "")) {
        text += node.textContent;
      }
    }
    return !/[\p{L}\p{N}]{2,}/u.test(text.trim());
  }

  function nameOf(element) {
    let name = element.getAttribute("aria-label") || "";
    if (!name && element.getAttribute("aria-labelledby")) {
      name = element
        .getAttribute("aria-labelledby")
        .split(/\s+/)
        .map((id) => {
          const target = document.getElementById(id);
          return target ? target.textContent : "";
        })
        .join(" ");
    }
    if (!name) {
      name = element.getAttribute("title") || "";
    }
    if (!name) {
      const img = element.querySelector("img[alt]");
      name = img ? img.getAttribute("alt") : "";
    }
    if (!name) {
      const svgTitle = element.querySelector("svg title");
      name = svgTitle ? svgTitle.textContent : "";
    }
    name = name.replace(/\s+/g, " ").trim();
    if (!name || name.length > MAX_NAME) {
      return "";
    }
    return name;
  }

  function labelOne(element) {
    if (element.dataset.easeIconLabel || element.closest("[id^='ease-']") || element.closest(".ease-icon-label")) {
      return;
    }
    element.dataset.easeIconLabel = "checked"; // check each element once
    if (!hasNoVisibleWords(element) || !nameOf(element)) {
      return; // most links have words: no layout needed for them
    }
    waiting.push(element); // size checks wait until the browser is idle
    measureWhenIdle();
  }

  // Measuring size needs the page layout, so we do it in one batch when the browser is idle.
  let waiting = [];
  let idleHandle = null;
  function measureWhenIdle() {
    if (idleHandle) {
      return;
    }
    const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    idleHandle = later(() => {
      idleHandle = null;
      const batch = waiting;
      waiting = [];
      for (const element of batch) {
        if (element.isConnected && enabled) {
          addLabel(element);
        }
      }
    }, { timeout: 1500 });
  }

  function addLabel(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      delete element.dataset.easeIconLabel; // hidden now (like a closed menu): check again later
      return;
    }
    if (rect.width > MAX_SIZE || rect.height > MAX_SIZE) {
      return;
    }
    const name = nameOf(element);
    if (!name) {
      return;
    }
    const label = document.createElement("span");
    label.className = "ease-icon-label";
    label.setAttribute("aria-hidden", "true"); // screen readers already hear this name
    label.textContent = name;
    element.appendChild(label);
    element.dataset.easeIconLabel = "labelled";
    added.add(label);
  }

  Ease.engine.register({
    id: "icon-labels",
    observe: true, // new buttons appear on many sites as you scroll

    apply(settings) {
      if (!settings.iconLabels) {
        this.remove();
        return;
      }
      enabled = true;
      Ease.engine.setStyle(
        this.id,
        `.ease-icon-label {
           display: block !important; margin: 2px auto 0 !important; padding: 0 2px !important;
           max-width: 10em !important; overflow: hidden !important; text-overflow: ellipsis !important;
           white-space: nowrap !important; text-align: center !important;
           font: 600 11px/1.2 system-ui, sans-serif !important; letter-spacing: 0 !important;
           color: inherit !important; opacity: 0.9 !important; text-transform: none !important;
           pointer-events: none !important; position: static !important;
         }
         /* Small icon buttons often have a fixed size, which cut the name to "M…". Let them grow. */
         [data-ease-icon-label="labelled"] {
           width: auto !important; min-width: max-content !important; height: auto !important;
           overflow: visible !important;
         }`
      );
      if (!document.body) {
        return;
      }
      for (const root of Ease.engine.roots()) {
        if (root.matches && root.matches(CANDIDATES)) {
          labelOne(root);
        }
        for (const element of root.querySelectorAll(CANDIDATES)) {
          labelOne(element);
        }
      }
    },

    remove() {
      enabled = false;
      waiting = [];
      for (const label of added) {
        label.remove();
      }
      added.clear();
      for (const element of document.querySelectorAll("[data-ease-icon-label]")) {
        delete element.dataset.easeIconLabel;
      }
      Ease.engine.removeStyle(this.id);
    }
  });
})();
