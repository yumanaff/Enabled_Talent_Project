// TEMPLATE for a new feature.
// 1. Copy this file and rename it, for example "reading-guide.js".
// 2. Change the id.
// 3. Add your setting to shared/defaults.js.
// 4. Add the file to "js" in manifest.json, before content/main.js.
// 5. Describe your setting in docs/settings-format.md.
//
// Rules (see docs/architecture.md):
// - remove() must undo EVERYTHING apply() did.
// - Prefer CSS. Boxes you add to the page go in Shadow DOM, with an id that starts with "ease-".
// - If you scan the page, use Ease.engine.textNodes() or Ease.engine.roots(),
//   so after a change you only look at the new parts (decision 8).
// - Do not read layout (innerText, sizes) during apply(). Measure later with requestIdleCallback.

(function () {
  const Ease = globalThis.Ease;

  Ease.engine.register({
    id: "template",
    observe: false,

    apply(settings) {
      // Turn the feature off if the setting is off.
      if (!settings.mySetting) {
        this.remove();
        return;
      }
      // Turn the feature on here.
      // Prefer CSS: Ease.engine.setStyle(this.id, "css here");
    },

    remove() {
      // Undo everything apply() changed.
      Ease.engine.removeStyle(this.id);
    }
  });
})();
