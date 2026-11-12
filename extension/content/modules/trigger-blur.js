// Trigger Word Blur.
// The user chooses words or phrases they do not want to see suddenly.
// Ease blurs them, and the user can click to see them when ready.
//
// Settings:
//   triggerBlur     -> on/off
//   triggerWords    -> ["word", "a phrase", ...]
//   triggerBlurSize -> how much to blur:
//       "word"      -> only the word
//       "sentence"  -> the sentence with the word (default: hides the meaning, keeps the page readable)
//       "paragraph" -> the whole paragraph, with a "Hidden · Show" chip
// The words stay on this device only. They are never sent anywhere.

(function () {
  const Ease = globalThis.Ease;

  // The block we blur in "paragraph" size.
  const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, dd, dt, blockquote, figcaption, label, summary";

  // Letters from scripts that do not use spaces between words (Chinese, Japanese).
  const NO_SPACES = /[぀-ヿ㐀-鿿]/;

  // Where a sentence ends: . ! ? and the Chinese, Arabic and Hindi full stops.
  const SENTENCE_END = /[.!?。！？؟।]/;

  let enabled = false;
  let currentKey = ""; // the word list and size we scanned for last time
  let pattern = null;
  let size = "sentence";

  function escape(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // One regular expression for all words.
  // Whole words only ("art" will not match "start"), except in Chinese-like scripts.
  function buildPattern(words) {
    const parts = words.map((word) => {
      const safe = escape(word).replace(/\s+/g, "\\s+");
      return NO_SPACES.test(word) ? safe : "(?<![\\p{L}\\p{N}])" + safe + "(?![\\p{L}\\p{N}])";
    });
    return new RegExp(parts.join("|"), "giu");
  }

  // ---------- Paragraph size ----------

  function blurBlock(block) {
    if (block.dataset.easeTrigger) {
      return;
    }
    block.dataset.easeTrigger = "hidden";
    const chip = Ease.engine.makeChip(Ease.i18n.t("triggerHidden"), () => {
      block.dataset.easeTrigger = "shown"; // the user chose to see it
    });
    block.insertAdjacentElement("beforebegin", chip);
  }

  // ---------- Word and sentence size ----------

  // Find the parts of the text to hide: [start, end] pairs.
  function rangesIn(text) {
    const ranges = [];
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      let start = match.index;
      let end = match.index + match[0].length;
      if (size === "sentence") {
        while (start > 0 && !SENTENCE_END.test(text[start - 1])) {
          start -= 1;
        }
        while (start < end && /\s/.test(text[start])) {
          start += 1; // do not blur the space before the sentence
        }
        while (end < text.length && !SENTENCE_END.test(text[end - 1])) {
          end += 1;
        }
      }
      const last = ranges[ranges.length - 1];
      if (last && start <= last[1]) {
        last[1] = Math.max(last[1], end); // two words in one sentence: one blur
      } else {
        ranges.push([start, end]);
      }
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
      match = pattern.exec(text);
    }
    return ranges;
  }

  function reveal(event) {
    const span = event.currentTarget;
    if (span.dataset.easeTrigger !== "hidden") {
      return;
    }
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault(); // a blurred link must not open by accident
    event.stopPropagation();
    span.dataset.easeTrigger = "shown";
    span.removeAttribute("tabindex");
    span.removeAttribute("role");
    span.removeAttribute("aria-label");
    span.removeAttribute("title");
  }

  function makeHiddenSpan(text) {
    const span = document.createElement("span");
    span.className = "ease-trigger-inline";
    span.dataset.easeTrigger = "hidden";
    span.textContent = text;
    span.tabIndex = 0;
    span.setAttribute("role", "button");
    const label = Ease.i18n.t("triggerShowLabel");
    span.setAttribute("aria-label", label);
    span.title = label;
    span.addEventListener("click", reveal, true);
    span.addEventListener("keydown", reveal, true);
    return span;
  }

  function blurInline(node) {
    const text = node.nodeValue;
    const ranges = rangesIn(text);
    if (!ranges.length) {
      return;
    }
    const fragment = document.createDocumentFragment();
    let position = 0;
    for (const [start, end] of ranges) {
      if (start > position) {
        fragment.appendChild(document.createTextNode(text.slice(position, start)));
      }
      fragment.appendChild(makeHiddenSpan(text.slice(start, end)));
      position = end;
    }
    if (position < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(position)));
    }
    node.replaceWith(fragment);
  }

  // ---------- Scan and undo ----------

  function scan() {
    for (const node of Ease.engine.textNodes("[data-ease-trigger]")) {
      pattern.lastIndex = 0;
      if (!pattern.test(node.nodeValue)) {
        continue;
      }
      if (size === "paragraph") {
        blurBlock(node.parentElement.closest(BLOCKS) || node.parentElement);
      } else {
        blurInline(node);
      }
    }
  }

  function unblurAll() {
    for (const span of document.querySelectorAll(".ease-trigger-inline")) {
      const parent = span.parentNode;
      span.replaceWith(document.createTextNode(span.textContent));
      if (parent) {
        parent.normalize(); // join the text back into one piece
      }
    }
    for (const block of document.querySelectorAll("[data-ease-trigger]")) {
      const chip = block.previousElementSibling;
      if (chip && chip.classList.contains("ease-chip")) {
        chip.remove();
      }
      delete block.dataset.easeTrigger;
    }
  }

  Ease.engine.register({
    id: "trigger-blur",
    observe: true, // new posts and comments can load later

    apply(settings) {
      const words = (settings.triggerWords || []).map((w) => String(w).trim()).filter(Boolean);
      if (!settings.triggerBlur || words.length === 0) {
        this.remove();
        return;
      }
      const newSize = ["word", "sentence", "paragraph"].includes(settings.triggerBlurSize) ? settings.triggerBlurSize : "sentence";
      const key = newSize + "|" + words.join("\n").toLowerCase();
      if (key !== currentKey) {
        unblurAll(); // the words or the size changed: start again
        currentKey = key;
        size = newSize;
        pattern = buildPattern(words);
      }
      enabled = true;
      // Paragraphs: pointer-events none stops clicking a blurred link by accident.
      // Words and sentences: the click shows the text instead (see reveal()).
      Ease.engine.setStyle(
        this.id,
        `[data-ease-trigger="hidden"]:not(.ease-trigger-inline) {
           filter: blur(7px) !important;
           user-select: none !important;
           pointer-events: none !important;
         }
         .ease-trigger-inline[data-ease-trigger="hidden"] {
           filter: blur(5px) !important;
           user-select: none !important;
           cursor: pointer !important;
           border-radius: 4px !important;
           background: rgba(169, 174, 184, 0.35) !important;
         }
         .ease-trigger-inline[data-ease-trigger="hidden"]:focus-visible {
           outline: 3px solid #4A5A8C !important;
           outline-offset: 2px !important;
         }`
      );
      scan();
    },

    remove() {
      if (!enabled && !currentKey) {
        return;
      }
      enabled = false;
      currentKey = "";
      pattern = null;
      Ease.engine.removeStyle(this.id);
      unblurAll();
    }
  });
})();
