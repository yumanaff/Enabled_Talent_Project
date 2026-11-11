// Reading Guide.
// Helps users keep their place while reading.
//
// Options:
//   "line" -> a soft bar that follows the mouse
//   "mask" -> darkens the page above and below the mouse,
//             so only a strip of text stays bright
//
// The guide never blocks clicks (pointer-events: none).

(function () {
  const Ease = globalThis.Ease;

  const BAR_HEIGHT = 44; // height of the bright strip, in px
  const LAYER = "2147483646"; // above the page, below browser UI

  let mode = null; // "line" | "mask" | null
  let parts = []; // the elements we added to the page
  let mouseY = window.innerHeight / 2;
  let waiting = false;

  // Make one guide element.
  function makePart(css) {
    const el = document.createElement("div");
    el.className = "ease-reading-guide";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;left:0;right:0;pointer-events:none;z-index:" + LAYER + ";" + css;
    document.documentElement.appendChild(el);
    return el;
  }

  function build() {
    if (mode === "line") {
      parts = [
        makePart(
          "height:" + BAR_HEIGHT + "px;" +
          "background:rgba(74,90,140,0.12);" +
          "border-top:2px solid #4A5A8C;border-bottom:2px solid #4A5A8C;"
        )
      ];
    } else {
      // Two dark layers: one above the strip, one below it.
      const shade = "background:rgba(20,22,26,0.55);";
      parts = [makePart("top:0;" + shade), makePart("bottom:0;" + shade)];
    }
    move();
  }

  // Put the guide where the mouse is.
  function move() {
    waiting = false;
    const top = Math.max(0, mouseY - BAR_HEIGHT / 2);
    if (mode === "line") {
      parts[0].style.top = top + "px";
    } else if (mode === "mask") {
      parts[0].style.height = top + "px";
      parts[1].style.height = Math.max(0, window.innerHeight - top - BAR_HEIGHT) + "px";
    }
  }

  // Update at most once per screen frame. Keeps the page fast.
  function onMouseMove(event) {
    mouseY = event.clientY;
    if (!waiting) {
      waiting = true;
      requestAnimationFrame(move);
    }
  }

  function clear() {
    document.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", move);
    for (const part of parts) {
      part.remove();
    }
    parts = [];
    mode = null;
  }

  Ease.engine.register({
    id: "reading-guide",
    observe: false,

    apply(settings) {
      const wanted = settings.readingGuide;
      if (wanted !== "line" && wanted !== "mask") {
        this.remove();
        return;
      }
      if (wanted === mode) {
        return; // already showing the right guide
      }
      clear();
      mode = wanted;
      build();
      document.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("resize", move);
    },

    remove() {
      clear();
    }
  });
})();
