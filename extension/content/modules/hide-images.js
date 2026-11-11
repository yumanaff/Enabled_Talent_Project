// Hide Images.
// Hides photos and videos to reduce clutter.
// The space stays the same, so the page layout does not jump.
// Small icons (SVG) stay visible, because buttons often need them.
// If an image has alt text, we show that text instead.

(function () {
  const Ease = globalThis.Ease;

  const CSS = `
    img, picture, video, [role="img"]:not(svg) {
      visibility: hidden !important;
    }
    .ease-alt-label {
      visibility: visible !important;
    }`;

  // Show the alt text in a small label where the image was.
  function addAltLabels() {
    for (const img of document.querySelectorAll("img[alt]:not([data-ease-alt])")) {
      const alt = img.getAttribute("alt").trim();
      img.dataset.easeAlt = "yes";
      if (!alt || img.width < 60) {
        continue; // skip empty alt and tiny images
      }
      const label = document.createElement("span");
      label.className = "ease-alt-label";
      label.textContent = "[" + alt + "]";
      label.style.cssText =
        "display:inline-block;padding:4px 8px;font-size:13px;color:#2A2F36;" +
        "background:#F1F1EC;border:1px dashed #555B66;border-radius:6px;";
      img.insertAdjacentElement("afterend", label);
    }
  }

  Ease.engine.register({
    id: "hide-images",
    observe: true, // new images can load later

    apply(settings) {
      if (!settings.hideImages) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(this.id, CSS);
      addAltLabels();
    },

    remove() {
      Ease.engine.removeStyle(this.id);
      for (const label of document.querySelectorAll(".ease-alt-label")) {
        label.remove();
      }
      for (const img of document.querySelectorAll("[data-ease-alt]")) {
        delete img.dataset.easeAlt;
      }
    }
  });
})();
