// The core engine.
// It keeps a list of feature modules and applies them to the page.
//
// Every feature module must look like this:
//   Ease.engine.register({
//     id: "my-feature",          // unique name
//     observe: false,            // true = run apply() again when new content loads
//     apply(settings) { ... },   // turn the feature on or update it
//     remove() { ... }           // undo everything the feature changed
//   });
//
// Copy content/modules/_template.js to start a new feature.

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  const modules = [];
  let currentSettings = null;
  let observer = null;
  let observerTimer = null;

  // Parts of the page that changed since the last pass (for example: 100 new comments).
  // Tools that scan text use only these parts, not the whole page again. null = whole page.
  let addedRoots = new Set();
  let wholePage = false;
  let changedRoots = null;
  const MAX_ROOTS = 300; // more changes than this: just scan the whole page

  // Add a <style> tag owned by the extension.
  function setStyle(id, css) {
    const styleId = "ease-style-" + id;
    let tag = document.getElementById(styleId);
    if (!tag) {
      tag = document.createElement("style");
      tag.id = styleId;
      (document.head || document.documentElement).appendChild(tag);
    }
    tag.textContent = css;
  }

  // Remove a <style> tag owned by the extension.
  function removeStyle(id) {
    const tag = document.getElementById("ease-style-" + id);
    if (tag) {
      tag.remove();
    }
  }

  // Page filters (like grayscale and dark mode) must be combined into ONE rule.
  // If two modules each set "filter" on <html>, the second one wins.
  // So modules call setFilter() and the engine joins them together.
  const filters = {};

  function renderFilters() {
    const value = Object.values(filters).join(" ").trim();
    if (value) {
      setStyle("filters", `html { filter: ${value} !important; }`);
    } else {
      removeStyle("filters");
    }
  }

  function setFilter(id, value) {
    filters[id] = value;
    renderFilters();
  }

  function removeFilter(id) {
    delete filters[id];
    renderFilters();
  }

  // Style for the "hidden · Show" chips. Strong rules, so website CSS can not break them.
  setStyle(
    "chips",
    `.ease-chip {
       display: inline-flex !important; align-items: center !important; gap: 6px !important;
       margin: 2px 0 !important; padding: 2px 4px 2px 8px !important;
       border: 1px dashed #A9AEB8 !important; border-radius: 8px !important;
       background: #F1F1EC !important; color: #555B66 !important;
       font: 400 12px/1.4 system-ui, sans-serif !important; letter-spacing: 0 !important;
       filter: none !important; visibility: visible !important;
     }
     .ease-chip-button {
       all: unset !important; cursor: pointer !important;
       padding: 2px 6px !important; border-radius: 6px !important;
       color: #34406A !important; font: 700 12px/1.4 system-ui, sans-serif !important;
       text-decoration: underline !important;
     }
     .ease-chip-button:focus-visible { outline: 2px solid #4A5A8C !important; }`
  );

  // Run one module safely. One broken module must not break the page.
  function safeRun(module, action, settings) {
    try {
      if (action === "apply") {
        module.apply(settings);
      } else {
        module.remove();
      }
    } catch (error) {
      console.warn("[Ease] Module failed:", module.id, error);
    }
  }

  // Watch for new content, like infinite scroll.
  function startObserver() {
    if (observer) {
      return;
    }
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const root = node.nodeType === 1 ? node : node.parentElement;
          if (root) {
            addedRoots.add(root);
          }
        }
        if (record.type === "characterData" && record.target.parentElement) {
          addedRoots.add(record.target.parentElement); // text that changed (like a countdown)
        }
      }
      if (addedRoots.size > MAX_ROOTS) {
        wholePage = true;
      }
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        if (!currentSettings) {
          return;
        }
        changedRoots = wholePage ? null : outerRoots(addedRoots);
        addedRoots = new Set();
        wholePage = false;
        if (changedRoots && changedRoots.length === 0) {
          changedRoots = null;
          return; // only removals: nothing new to check
        }
        for (const module of modules) {
          if (module.observe) {
            safeRun(module, "apply", currentSettings);
          }
        }
        changedRoots = null; // the next full apply scans the whole page again
      }, 300);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  // Keep only the outermost changed elements that are still on the page.
  function outerRoots(set) {
    const list = [...set].filter((el) => el.isConnected && document.body && document.body.contains(el));
    return list.filter((el) => !list.some((other) => other !== el && other.contains(el)));
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  Ease.engine = {
    register(module) {
      modules.push(module);
    },

    applyAll(settings) {
      currentSettings = settings;
      for (const module of modules) {
        safeRun(module, "apply", settings);
      }
      startObserver();
    },

    // Run the "observe" modules again (for example after Page Translate changed the text,
    // so Trigger Blur can check the new words). Page Translate itself is skipped.
    rescan() {
      if (!currentSettings) {
        return;
      }
      for (const module of modules) {
        if (module.observe && module.id !== "page-translate") {
          safeRun(module, "apply", currentSettings);
        }
      }
    },

    removeAll() {
      currentSettings = null;
      stopObserver();
      for (const module of modules) {
        safeRun(module, "remove");
      }
    },

    setStyle,
    removeStyle,
    setFilter,
    removeFilter,

    // Full URL of a file inside the extension, like a font.
    fileUrl(path) {
      return chrome.runtime.getURL(path);
    },

    // The parts of the page a tool should look at right now:
    // only the new parts after a change, or the whole page on a full apply.
    roots() {
      return changedRoots || (document.body ? [document.body] : []);
    },

    // Every visible text node in roots() (or the whole page), skipping code, inputs and our own elements.
    // skipSelector: extra elements to skip (for example ones we already hid).
    textNodes(skipSelector) {
      const nodes = [];
      if (!document.body) {
        return nodes;
      }
      const skip = "script, style, noscript, textarea, input, select, [contenteditable='true'], .ease-chip" + (skipSelector ? ", " + skipSelector : "");
      const accept = {
        acceptNode(node) {
          if (!node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent || parent.closest(skip)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      };
      for (const root of this.roots()) {
        if (root.nodeType === 1 && root.closest(skip) && root !== document.body) {
          continue; // a whole new part we must skip (for example our own chip)
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, accept);
        let node = walker.nextNode();
        while (node) {
          nodes.push(node);
          node = walker.nextNode();
        }
      }
      return nodes;
    },

    // A small "hidden · Show" chip placed before something we hid.
    // onShow runs when the user clicks Show. The chip removes itself.
    makeChip(text, onShow) {
      const chip = document.createElement("span");
      chip.className = "ease-chip";
      const label = document.createElement("span");
      label.textContent = text;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ease-chip-button";
      button.textContent = Ease.i18n.t("chipShow");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        chip.remove();
        onShow();
      });
      chip.append(label, button);
      return chip;
    }
  };
})();
