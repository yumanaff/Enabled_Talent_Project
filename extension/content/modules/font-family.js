// Font Family.
// Changes the font of text on the page.
//
// Options:
//   "readable" -> clear system fonts (no download)
//   "atkinson" -> Atkinson Hyperlegible (made for low vision readers)
//   "dyslexic" -> OpenDyslexic
//
// The two special fonts only have Latin letters.
// "unicode-range" makes the browser use them ONLY for Latin letters.
// Arabic, Gurmukhi, Chinese and Hindi text keep a normal font.
// Without this, those languages would show broken boxes.

(function () {
  const Ease = globalThis.Ease;

  // Basic Latin + Latin-1 + Latin Extended-A + common punctuation.
  const LATIN = "U+0000-024F, U+2000-206F, U+20AC";

  function fontFace(name, file, weight) {
    const url = Ease.engine.fileUrl("fonts/" + file);
    return `
      @font-face {
        font-family: "${name}";
        src: url("${url}");
        font-weight: ${weight};
        font-display: swap;
        unicode-range: ${LATIN};
      }`;
  }

  const FONTS = {
    readable: {
      faces: "",
      stack: 'Verdana, Tahoma, "Segoe UI", Arial, sans-serif'
    },
    atkinson: {
      faces: fontFace("Ease Atkinson", "atkinson-400.woff2", 400) + fontFace("Ease Atkinson", "atkinson-700.woff2", 700),
      stack: '"Ease Atkinson", Verdana, Arial, sans-serif'
    },
    dyslexic: {
      faces: fontFace("Ease OpenDyslexic", "opendyslexic-400.woff", 400) + fontFace("Ease OpenDyslexic", "opendyslexic-700.woff", 700),
      stack: '"Ease OpenDyslexic", Verdana, Arial, sans-serif'
    }
  };

  // Do not change code blocks or icon fonts.
  // Icon fonts (like Font Awesome) break if we change them.
  const SKIP = 'code, pre, kbd, samp, i, [class*="icon"], [class*="Icon"], [class*="fa-"], [class*="material"]';

  Ease.engine.register({
    id: "font-family",
    observe: false,

    apply(settings) {
      const font = FONTS[settings.fontFamily];
      if (!font) {
        this.remove();
        return;
      }
      Ease.engine.setStyle(
        this.id,
        `${font.faces}
         body *:not(${SKIP}) { font-family: ${font.stack} !important; }`
      );
    },

    remove() {
      Ease.engine.removeStyle(this.id);
    }
  });
})();
