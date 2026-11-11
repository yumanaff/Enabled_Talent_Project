// Highlight Titles.
// Marks every heading so users can see how the page is organized.

(function () {
  const Ease = globalThis.Ease;

  const CSS = `
    h1, h2, h3, h4, h5, h6, [role="heading"] {
      outline: 2px dashed #4A5A8C !important;
      outline-offset: 4px !important;
      background-color: rgba(74, 90, 140, 0.08) !important;
    }`;

  Ease.engine.register({
    id: "highlight-titles",
    observe: false,

    apply(settings) {
      if (!settings.highlightTitles) {
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
