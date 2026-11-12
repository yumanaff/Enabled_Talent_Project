// Focus Indicator.
// Shows a strong ring around the item selected with the keyboard (Tab key).
// Many websites remove this ring. Keyboard users then get lost.
// Two colours (dark ring + yellow halo) so it shows on any background.

(function () {
  const Ease = globalThis.Ease;

  const CSS = `
    :focus-visible {
      outline: 3px solid #1A1D22 !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 6px #FFD54A !important;
      border-radius: 4px !important;
    }`;

  Ease.engine.register({
    id: "focus-indicator",
    observe: false,

    apply(settings) {
      if (!settings.focusIndicator) {
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
