// Contrast.
// Options:
//   "dark" -> turns the page dark. Photos and videos are flipped back so they look normal.
//   "high" -> stronger contrast
//   "soft" -> lower glare and a warmer tone (for light sensitivity)
//
// Uses the engine's shared filter, so it works together with Monochrome.

(function () {
  const Ease = globalThis.Ease;

  const FILTERS = {
    dark: "invert(1) hue-rotate(180deg)",
    high: "contrast(1.35)",
    soft: "contrast(0.9) brightness(0.95) sepia(0.12)"
  };

  // In dark mode, flip media back so photos do not look like negatives.
  const DARK_MEDIA_FIX = `
    html { background: #FFFFFF !important; }
    img, picture, video, canvas, iframe, [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }`;

  Ease.engine.register({
    id: "contrast",
    observe: false,

    apply(settings) {
      const filter = FILTERS[settings.contrast];
      if (!filter) {
        this.remove();
        return;
      }
      Ease.engine.setFilter(this.id, filter);
      if (settings.contrast === "dark") {
        Ease.engine.setStyle(this.id, DARK_MEDIA_FIX);
      } else {
        Ease.engine.removeStyle(this.id);
      }
    },

    remove() {
      Ease.engine.removeFilter(this.id);
      Ease.engine.removeStyle(this.id);
    }
  });
})();
