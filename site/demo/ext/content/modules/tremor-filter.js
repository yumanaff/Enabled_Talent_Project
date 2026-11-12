// Tremor Filter.
// Helps people whose hands shake (tremor, Parkinson's, arthritis).
//
// What it does:
//   1. Ignores an extra click that comes too soon after the last one.
//      A shaky hand often clicks twice by mistake: double orders, double sends.
//   2. Stops links and images from being dragged by accident.
//
// Setting "tremorFilter": "off" | "light" | "strong"
//   light  = ignore clicks within 400 ms of the last click
//   strong = ignore clicks within 800 ms
// People are different, so users can pick the level.

(function () {
  const Ease = globalThis.Ease;

  const WAIT = { light: 400, strong: 800 };

  let enabled = false;
  let wait = 400;
  let lastClick = 0;

  // Runs before the page sees the click. "true" = capture phase.
  function onClick(event) {
    if (!event.isTrusted) {
      return; // clicks made by scripts (and by Bigger Click Areas) are fine
    }
    const now = Date.now();
    if (now - lastClick < wait) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    lastClick = now;
  }

  // Double-click is two quick clicks. With the filter on, block it too.
  function onDoubleClick(event) {
    if (event.isTrusted) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  // Stop accidental dragging of links and images.
  // Elements made to be dragged (draggable="true") still work.
  function onDragStart(event) {
    const el = event.target;
    if (el && el.closest && el.closest("a, img") && !el.closest('[draggable="true"]')) {
      event.preventDefault();
    }
  }

  Ease.engine.register({
    id: "tremor-filter",
    observe: false,

    apply(settings) {
      if (!WAIT[settings.tremorFilter]) {
        this.remove();
        return;
      }
      wait = WAIT[settings.tremorFilter];
      if (enabled) {
        return;
      }
      enabled = true;
      window.addEventListener("click", onClick, true);
      window.addEventListener("dblclick", onDoubleClick, true);
      window.addEventListener("dragstart", onDragStart, true);
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("dblclick", onDoubleClick, true);
      window.removeEventListener("dragstart", onDragStart, true);
    }
  });
})();
