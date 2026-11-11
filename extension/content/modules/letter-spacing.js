// Letter Spacing.
// Adds space between letters and words.
// Research shows extra spacing helps many readers with dyslexia.
// "extra" uses the WCAG 1.4.12 values.

(function () {
  const Ease = globalThis.Ease;

  const VALUES = {
    wide: { letter: "0.06em", word: "0.12em" },
    extra: { letter: "0.12em", word: "0.16em" }
  };

  const TEXT = "p, li, dd, dt, td, th, blockquote, figcaption, label, article, span, a, h1, h2, h3, h4, h5, h6";

  Ease.engine.register({
    id: "letter-spacing",
    observe: false,

    apply(settings) {
      const value = VALUES[settings.letterSpacing];
      if (!value) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(
        this.id,
        `${TEXT} { letter-spacing: ${value.letter} !important; word-spacing: ${value.word} !important; }`
      );
    },

    remove() {
      Ease.engine.removeStyle(this.id);
    }
  });
})();
