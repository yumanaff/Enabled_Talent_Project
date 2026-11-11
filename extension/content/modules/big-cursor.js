// Big Cursor.
// Makes the mouse pointer bigger and easier to follow.
// Black with a white border, so it shows on light and dark pages.
// Chrome limits cursor images to 128 x 128 px. We use 48 px.

(function () {
  const Ease = globalThis.Ease;

  // Normal arrow.
  const ARROW =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
        '<path d="M6 3 L6 39 L15 30 L21 44 L28 41 L22 27 L35 27 Z" fill="black" stroke="white" stroke-width="3" stroke-linejoin="round"/>' +
        "</svg>"
    );

  // Hand for links and buttons.
  const HAND =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">' +
        '<path d="M17 4 a4 4 0 0 1 8 0 V20 h2 V16 a4 4 0 0 1 8 0 V22 a4 4 0 0 1 7 2 V34 C42 41 36 46 29 46 H24 C18 46 14 43 11 38 L5 28 a4 4 0 0 1 6 -5 L17 29 Z" fill="black" stroke="white" stroke-width="3" stroke-linejoin="round"/>' +
        "</svg>"
    );

  const CSS = `
    html, body, * { cursor: url("${ARROW}") 6 3, auto !important; }
    a, a *, button, button *, [role="button"], label, select, summary {
      cursor: url("${HAND}") 21 4, pointer !important;
    }
    input[type="text"], input[type="search"], input[type="email"], textarea, [contenteditable="true"] {
      cursor: text !important;
    }`;

  Ease.engine.register({
    id: "big-cursor",
    observe: false,

    apply(settings) {
      if (!settings.bigCursor) {
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
