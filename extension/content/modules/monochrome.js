// Monochrome.
// Shows the page in grey only. Removes bright, distracting colours.
// Uses the engine's shared filter, so it works together with Contrast.

(function () {
  const Ease = globalThis.Ease;

  Ease.engine.register({
    id: "monochrome",
    observe: false,

    apply(settings) {
      if (!settings.monochrome) {
        this.remove();
        return;
      }
      Ease.engine.setFilter(this.id, "grayscale(1)");
    },

    remove() {
      Ease.engine.removeFilter(this.id);
    }
  });
})();
