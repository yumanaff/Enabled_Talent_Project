// Line Height.
// Adds more space between lines of text.
// "wide" = 1.6, "extra" = 2.0.
// WCAG 1.4.12 asks that pages still work at 1.5, so these are safe values.

(function () {
  const Ease = globalThis.Ease;

  const VALUES = {
    wide: 1.6,
    extra: 2.0
  };

  // Only text elements. We do not change buttons or icons.
  const TEXT = "p, li, dd, dt, td, th, blockquote, figcaption, label, article, h1, h2, h3, h4, h5, h6";

  Ease.engine.register({
    id: "line-height",
    observe: false,

    apply(settings) {
      const value = VALUES[settings.lineHeight];
      if (!value) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, `${TEXT} { line-height: ${value} !important; }`);
    },

    remove() {
      Ease.engine.removeStyle(this.id);
    }
  });
})();
