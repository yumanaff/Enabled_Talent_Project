// Bigger Click Areas (click magnet).
// Small links and buttons are hard to hit with a shaky or slow hand.
// We do NOT change the page layout. Instead:
//   1. When the mouse is close to a link or button (within 16 px), we outline it.
//   2. If the user clicks on empty space near it, we click it for them.
//   3. Checkboxes and radio buttons are drawn a little bigger.
//
// Clicks right ON a link or button are never changed.

(function () {
  const Ease = globalThis.Ease;

  const RADIUS = 16; // how far (px) we look around the mouse

  const INTERACTIVE = [
    "a[href]",
    "button",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "summary",
    "label[for]",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='menuitem']",
    "[role='tab']",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  // Points around the mouse where we look for targets.
  const OFFSETS = [
    [0, 0],
    [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS],
    [RADIUS * 0.7, RADIUS * 0.7], [-RADIUS * 0.7, RADIUS * 0.7],
    [RADIUS * 0.7, -RADIUS * 0.7], [-RADIUS * 0.7, -RADIUS * 0.7]
  ];

  let enabled = false;
  let ring = null; // outline shown around the target
  let target = null; // the element a click would go to
  let mouse = { x: 0, y: 0 };
  let waiting = false;

  function interactiveFrom(el) {
    if (!el || !el.closest) {
      return null;
    }
    const found = el.closest(INTERACTIVE);
    if (!found || found.closest("#ease-read-aloud, .ease-chip") || found.disabled) {
      return null;
    }
    return found;
  }

  // Distance from the mouse to the nearest edge of a box.
  function distance(rect, x, y) {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.hypot(dx, dy);
  }

  // Find the closest link or button near the mouse.
  function findTarget(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const [ox, oy] of OFFSETS) {
      const el = interactiveFrom(document.elementFromPoint(x + ox, y + oy));
      if (!el) {
        continue;
      }
      const d = distance(el.getBoundingClientRect(), x, y);
      if (d <= RADIUS && d < bestDistance) {
        best = el;
        bestDistance = d;
      }
    }
    return best;
  }

  function showRing(el) {
    if (!ring) {
      ring = document.createElement("div");
      ring.setAttribute("aria-hidden", "true");
      ring.style.cssText =
        "position:fixed;pointer-events:none;z-index:2147483646;border-radius:8px;" +
        "outline:3px solid #4A5A8C;outline-offset:2px;background:rgba(74,90,140,0.08);";
      document.documentElement.appendChild(ring);
    }
    if (!el) {
      ring.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    ring.style.display = "block";
    ring.style.left = r.left + "px";
    ring.style.top = r.top + "px";
    ring.style.width = r.width + "px";
    ring.style.height = r.height + "px";
  }

  function update() {
    waiting = false;
    // Only help when the mouse is NOT already on a target.
    const direct = interactiveFrom(document.elementFromPoint(mouse.x, mouse.y));
    target = direct ? null : findTarget(mouse.x, mouse.y);
    showRing(target);
  }

  function onMove(event) {
    mouse = { x: event.clientX, y: event.clientY };
    if (!waiting) {
      waiting = true;
      requestAnimationFrame(update);
    }
  }

  // Runs before the page sees the click.
  function onClick(event) {
    if (!event.isTrusted || event.button !== 0) {
      return;
    }
    if (interactiveFrom(event.target)) {
      return; // the user hit the target directly: do nothing
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      return; // the user was selecting text
    }
    const near = findTarget(event.clientX, event.clientY);
    if (!near) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (near.matches("input, textarea, select")) {
      near.focus();
    }
    near.click();
  }

  Ease.engine.register({
    id: "bigger-targets",
    observe: false,

    apply(settings) {
      if (!settings.biggerTargets) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(
        this.id,
        `input[type="checkbox"], input[type="radio"] {
           transform: scale(1.4) !important;
           margin: 6px !important;
         }`
      );
      if (enabled) {
        return;
      }
      enabled = true;
      document.addEventListener("mousemove", onMove, { passive: true });
      document.addEventListener("click", onClick, true);
    },

    remove() {
      enabled = false;
      target = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("click", onClick, true);
      Ease.engine.removeStyle(this.id);
      if (ring) {
        ring.remove();
        ring = null;
      }
    }
  });
})();
