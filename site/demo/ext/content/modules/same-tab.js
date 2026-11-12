// Same Tab.
// Links that open a new tab by surprise confuse many people:
// the "Back" button stops working, and it is hard to find the old page again.
// With this on, links open in the same tab.
//
// The user can still open a new tab on purpose (Ctrl or Cmd + click, or middle click).
// Downloads and links inside forms are not changed.

(function () {
  const Ease = globalThis.Ease;

  let enabled = false;
  const changed = new Set(); // links we changed, so remove() can undo them

  function onClick(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return; // the user wants a new tab or window on purpose
    }
    const link = event.target && event.target.closest ? event.target.closest("a[href][target]") : null;
    if (!link || link.hasAttribute("download") || link.closest("[id^='ease-']")) {
      return;
    }
    const target = link.getAttribute("target").toLowerCase();
    if (target === "_self" || target === "_top" || target === "_parent") {
      return;
    }
    let url;
    try {
      url = new URL(link.href, location.href);
    } catch (error) {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    link.dataset.easeOldTarget = link.getAttribute("target");
    link.setAttribute("target", "_self"); // the browser now opens it here
    changed.add(link);
  }

  Ease.engine.register({
    id: "same-tab",
    observe: false, // one listener on the page covers new links too

    apply(settings) {
      if (!settings.sameTab) {
        this.remove();
        return;
      }
      if (!enabled) {
        enabled = true;
        document.addEventListener("click", onClick, true);
      }
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      document.removeEventListener("click", onClick, true);
      for (const link of changed) {
        if (link.dataset.easeOldTarget) {
          link.setAttribute("target", link.dataset.easeOldTarget);
          delete link.dataset.easeOldTarget;
        }
      }
      changed.clear();
    }
  });
})();
