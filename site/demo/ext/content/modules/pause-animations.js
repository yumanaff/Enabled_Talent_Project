// Pause Animations.
// 1. Stops CSS animations and transitions.
// 2. Freezes animated GIFs: draws the first frame on a canvas and hides the GIF.
// Calm Mode will reuse this later.

(function () {
  const Ease = globalThis.Ease;

  // Animations: almost zero time, so websites that wait for "animation ended" still work.
  // Transitions: zero. (Not 0.001s: that would turn EVERY later style change, like a new font,
  // into a tiny animation on every element. On a long page that blocked it for over a second.)
  const CSS = `
    *, *::before, *::after {
      animation-duration: 0.001s !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }`;

  function isGif(img) {
    const src = (img.currentSrc || img.src || "").toLowerCase();
    return src.includes(".gif");
  }

  function freeze(img) {
    if (img.dataset.easeFrozen || !isGif(img)) {
      return;
    }
    if (!img.complete || img.naturalWidth === 0) {
      img.addEventListener("load", () => freeze(img), { once: true });
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.className = "ease-frozen-gif " + img.className;
    canvas.style.cssText = img.style.cssText;
    canvas.style.width = img.width + "px";
    canvas.style.height = img.height + "px";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", img.alt || "");
    try {
      canvas.getContext("2d").drawImage(img, 0, 0);
    } catch (error) {
      return; // could not draw this image, leave it
    }
    img.dataset.easeFrozen = "yes";
    img.style.setProperty("display", "none", "important");
    img.insertAdjacentElement("beforebegin", canvas);
  }

  function unfreezeAll() {
    for (const canvas of document.querySelectorAll("canvas.ease-frozen-gif")) {
      canvas.remove();
    }
    for (const img of document.querySelectorAll("img[data-ease-frozen]")) {
      delete img.dataset.easeFrozen;
      img.style.removeProperty("display");
    }
  }

  Ease.engine.register({
    id: "pause-animations",
    observe: true, // new GIFs can load later

    apply(settings) {
      if (!settings.pauseAnimations) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, CSS);
      for (const img of document.querySelectorAll("img")) {
        freeze(img);
      }
    },

    remove() {
      Ease.engine.removeStyle(this.id);
      unfreezeAll();
    }
  });
})();
