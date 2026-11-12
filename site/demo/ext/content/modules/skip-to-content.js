// Skip to Content.
// Adds a "Skip to main content" link at the very top of the page.
// It appears when the user presses Tab for the first time.
// It jumps past menus and ads to the main part of the page.
// Very useful for keyboard users.

(function () {
  const Ease = globalThis.Ease;

  let link = null;

  // Try to find the main content, from best guess to weakest.
  function findMain() {
    const guesses = [
      "main",
      '[role="main"]',
      "article",
      "#main",
      "#content",
      "#main-content",
      ".main-content"
    ];
    for (const selector of guesses) {
      const el = document.querySelector(selector);
      if (el && el.offsetHeight > 0) {
        return el;
      }
    }
    // Last try: the first main heading.
    return document.querySelector("h1");
  }

  function jump(event) {
    event.preventDefault();
    const target = findMain();
    if (!target) {
      return;
    }
    // Make the target focusable, then move focus to it.
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.dataset.easeSkipTarget = "yes";
    }
    target.focus();
    target.scrollIntoView({ block: "start" });
  }

  const CSS = `
    #ease-skip-link {
      position: fixed !important;
      top: 12px !important;
      left: 12px !important;
      z-index: 2147483647 !important;
      transform: translateY(-200%) !important;
      padding: 12px 18px !important;
      border-radius: 10px !important;
      background: #2A2F36 !important;
      color: #FBFBF9 !important;
      font: 700 16px/1.2 system-ui, sans-serif !important;
      text-decoration: none !important;
    }
    #ease-skip-link:focus {
      transform: none !important;
      outline: 3px solid #FFD54A !important;
      outline-offset: 2px !important;
    }`;

  Ease.engine.register({
    id: "skip-to-content",
    observe: false,

    apply(settings) {
      if (!settings.skipToContent) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, CSS);
      if (link) {
        link.textContent = Ease.i18n.t("skipLink"); // language may have changed
        return;
      }
      link = document.createElement("a");
      link.id = "ease-skip-link";
      link.href = "#";
      link.textContent = Ease.i18n.t("skipLink");
      link.addEventListener("click", jump);
      // First item on the page, so it is the first thing Tab reaches.
      document.body.insertBefore(link, document.body.firstChild);
    },

    remove() {
      Ease.engine.removeStyle(this.id);
      if (link) {
        link.remove();
        link = null;
      }
      for (const el of document.querySelectorAll("[data-ease-skip-target]")) {
        el.removeAttribute("tabindex");
        delete el.dataset.easeSkipTarget;
      }
    }
  });
})();
