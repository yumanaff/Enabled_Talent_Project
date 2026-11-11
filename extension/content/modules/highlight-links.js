// Highlight Links.
// Makes every link easy to spot.
// Uses an underline AND an outline, so it does not depend on colour only.

(function () {
  const Ease = globalThis.Ease;

  const CSS = `
    a[href] {
      text-decoration: underline !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 3px !important;
      outline: 2px solid #4A5A8C !important;
      outline-offset: 2px !important;
      border-radius: 2px !important;
    }`;

  Ease.engine.register({
    id: "highlight-links",
    observe: false,

    apply(settings) {
      if (!settings.highlightLinks) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, CSS);
    },

    remove() {
      Ease.engine.removeStyle(this.id);
    }
  });
})();
