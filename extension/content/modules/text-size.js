// Text Size.
// Makes text bigger on the page.
// Note: this is a simple first version. Many sites use fixed pixel sizes.
// We will improve it with the Azkhar approach later.

(function () {
  const Ease = globalThis.Ease;

  Ease.engine.register({
    id: "text-size",
    observe: false,

    apply(settings) {
      const size = Number(settings.textSize) || 100;
      if (size === 100) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, `html { font-size: ${size}% !important; }`);
    },

    remove() {
      Ease.engine.removeStyle(this.id);
    }
  });
})();
