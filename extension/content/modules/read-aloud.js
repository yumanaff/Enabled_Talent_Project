// Read Aloud.
// The user selects text on a page. A small "Read aloud" button appears.
// The browser reads the text, and each word is highlighted as it is spoken.
//
// Setting "readAloud": "off" | "slow" | "normal" | "fast" (reading speed).
//
// How it works:
// 1. We collect the text nodes inside the selection, and remember where each one starts.
// 2. We split the text into short sentences. Chrome can stop reading very long text.
// 3. While speaking, Chrome tells us which word it is on ("boundary" event).
// 4. We turn that word into a Range and highlight it with the CSS Highlight API.
//
// Voices come from the user's computer. Some languages may have no voice.

(function () {
  const Ease = globalThis.Ease;

  const RATES = { slow: 0.8, normal: 1, fast: 1.25 };
  const HIGHLIGHT_NAME = "ease-read-word";
  const MAX_CHUNK = 200; // characters per spoken piece

  let rate = 1;
  let enabled = false;
  let host = null; // our floating button, inside a shadow root
  let readButton = null;
  let stopButton = null;
  let reading = false;
  let savedRange = null;

  // ---------- Text collection ----------

  // Build one long string from the selection, plus a map back to the page.
  function collect(range) {
    const map = []; // { node, nodeStart, textStart, length }
    let text = "";
    const root =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        const tag = node.parentNode && node.parentNode.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node = walker.nextNode();
    while (node) {
      let start = 0;
      let end = node.nodeValue.length;
      if (node === range.startContainer) {
        start = range.startOffset;
      }
      if (node === range.endContainer) {
        end = range.endOffset;
      }
      const piece = node.nodeValue.slice(start, end);
      if (piece.trim()) {
        if (text && !/\s$/.test(text)) {
          text += " "; // keep words in different elements apart
        }
        map.push({ node, nodeStart: start, textStart: text.length, length: piece.length });
        text += piece;
      }
      node = walker.nextNode();
    }
    return { text, map };
  }

  // Split text into pieces of about MAX_CHUNK characters, at sentence ends.
  function chunk(text) {
    const pieces = [];
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [text];
    let current = "";
    let currentStart = 0;
    let position = 0;
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > MAX_CHUNK) {
        pieces.push({ text: current, start: currentStart });
        current = "";
        currentStart = position;
      }
      current += sentence;
      position += sentence.length;
    }
    if (current.trim()) {
      pieces.push({ text: current, start: currentStart });
    }
    return pieces;
  }

  // ---------- Word highlight ----------

  function rangeFor(map, from, to) {
    let startEntry = null;
    let endEntry = null;
    for (const entry of map) {
      const entryEnd = entry.textStart + entry.length;
      if (!startEntry && from >= entry.textStart && from < entryEnd) {
        startEntry = entry;
      }
      if (to > entry.textStart && to <= entryEnd) {
        endEntry = entry;
      }
    }
    if (!startEntry || !endEntry) {
      return null;
    }
    const r = document.createRange();
    r.setStart(startEntry.node, startEntry.nodeStart + (from - startEntry.textStart));
    r.setEnd(endEntry.node, endEntry.nodeStart + (to - endEntry.textStart));
    return r;
  }

  function highlightWord(map, fullText, index, length) {
    if (!globalThis.CSS || !CSS.highlights) {
      return; // older browser: read without highlight
    }
    let end = index + (length || 0);
    if (!length) {
      const match = /\S+/.exec(fullText.slice(index));
      end = index + (match ? match.index + match[0].length : 1);
    }
    const r = rangeFor(map, index, end);
    if (r) {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(r));
    }
  }

  function clearHighlight() {
    if (globalThis.CSS && CSS.highlights) {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    }
  }

  // ---------- Speaking ----------

  function speak(range) {
    stop();
    const { text, map } = collect(range);
    if (!text.trim()) {
      return;
    }
    const pieces = chunk(text);
    // If Page Translate changed the page, use a voice for the new language.
    const lang = Ease.translatedVoice || document.documentElement.lang || navigator.language;
    reading = true;
    showButtons();

    let i = 0;
    function next() {
      if (!reading || i >= pieces.length) {
        stop();
        return;
      }
      const piece = pieces[i];
      i += 1;
      const utterance = new SpeechSynthesisUtterance(piece.text);
      utterance.rate = rate;
      utterance.lang = lang;
      utterance.onboundary = (event) => {
        if (event.name === "word") {
          highlightWord(map, text, piece.start + event.charIndex, event.charLength);
        }
      };
      utterance.onend = next;
      utterance.onerror = () => stop();
      speechSynthesis.speak(utterance);
    }
    next();
  }

  function stop() {
    reading = false;
    speechSynthesis.cancel();
    clearHighlight();
    showButtons();
  }

  // ---------- Floating button ----------

  function makeButton(label, iconPath) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" aria-hidden="true">' + iconPath + "</svg>" +
      "<span></span>";
    b.querySelector("span").textContent = label;
    return b;
  }

  function buildHost() {
    host = document.createElement("div");
    host.id = "ease-read-aloud";
    host.style.cssText = "position:fixed;z-index:2147483647;display:none;";
    // Shadow root: website CSS can not change our button.
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .box { display: flex; gap: 6px; padding: 6px; border-radius: 12px;
             background: #FBFBF9; border: 1px solid #DDDDD6;
             box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
      button { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px;
               border-radius: 9px; border: none; cursor: pointer;
               font: 700 14px/1 system-ui, sans-serif; }
      .read { background: #4A5A8C; color: #FBFBF9; }
      .stop { background: #E9E9E3; color: #2A2F36; }
      button:focus-visible { outline: 3px solid #FFD54A; outline-offset: 2px; }`;
    const box = document.createElement("div");
    box.className = "box";
    readButton = makeButton(Ease.i18n.t("readAloudRead"), '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a10 10 0 0 1 0 14"></path>');
    readButton.className = "read";
    stopButton = makeButton(Ease.i18n.t("readAloudStop"), '<rect x="6" y="6" width="12" height="12" rx="2"></rect>');
    stopButton.className = "stop";
    // mousedown + preventDefault keeps the page selection alive.
    readButton.addEventListener("mousedown", (e) => e.preventDefault());
    readButton.addEventListener("click", () => {
      if (savedRange) {
        speak(savedRange);
      }
    });
    stopButton.addEventListener("click", stop);
    box.append(readButton, stopButton);
    shadow.append(style, box);
    document.documentElement.appendChild(host);
  }

  function showButtons() {
    if (!host) {
      return;
    }
    readButton.style.display = reading ? "none" : "flex";
    stopButton.style.display = reading ? "flex" : "none";
    if (!reading && !savedRange) {
      host.style.display = "none";
    }
  }

  // Show the button near the selected text.
  function onSelectionDone(event) {
    if (!enabled || (host && host.contains(event.target))) {
      return;
    }
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        savedRange = null;
        showButtons();
        return;
      }
      savedRange = selection.getRangeAt(0).cloneRange();
      if (!host) {
        buildHost();
      }
      const rect = savedRange.getBoundingClientRect();
      const top = rect.bottom + 8 > window.innerHeight - 60 ? rect.top - 60 : rect.bottom + 8;
      host.style.top = Math.max(8, top) + "px";
      host.style.left = Math.min(window.innerWidth - 240, Math.max(8, rect.left)) + "px";
      host.style.display = "block";
      showButtons();
    }, 0);
  }

  // Stop reading with the Escape key.
  function onKey(event) {
    if (event.key === "Escape" && reading) {
      stop();
    }
  }

  Ease.engine.register({
    id: "read-aloud",
    observe: false,

    apply(settings) {
      if (!RATES[settings.readAloud] || !("speechSynthesis" in window)) {
        this.remove();
        return;
      }
      rate = RATES[settings.readAloud];
      Ease.engine.setStyle(this.id, `::highlight(${HIGHLIGHT_NAME}) { background-color: #FFD54A; color: #1A1D22; }`);
      if (enabled) {
        return;
      }
      enabled = true;
      document.addEventListener("mouseup", onSelectionDone);
      document.addEventListener("keyup", onSelectionDone);
      document.addEventListener("keydown", onKey);
    },

    remove() {
      enabled = false;
      stop();
      savedRange = null;
      document.removeEventListener("mouseup", onSelectionDone);
      document.removeEventListener("keyup", onSelectionDone);
      document.removeEventListener("keydown", onKey);
      Ease.engine.removeStyle(this.id);
      if (host) {
        host.remove();
        host = null;
      }
    }
  });
})();
