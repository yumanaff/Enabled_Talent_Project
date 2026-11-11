// Pressure Remover.
// Hides fake urgency on shopping sites:
//   - "Only 2 left!", "Selling fast", "Hurry", "Offer ends soon"
//   - "12 people are viewing this", "In 5 carts"
//   - countdown timers (numbers like 04:59 that change every second)
//
// Each hidden message gets a small "Pressure message hidden · Show" chip.
// We NEVER hide buttons, inputs or images, and never large blocks of text.
//
// Research: a study of 11,000 shopping sites found 393 countdown timers,
// and 157 of them were fake (they reset or the offer did not really end).

(function () {
  const Ease = globalThis.Ease;

  // Urgency messages. English first, then French.
  const URGENCY = [
    /\bonly\s+\d+\s+(left|remaining)\b/i,
    /\b\d+\s+(left|remaining)\s+in\s+stock\b/i,
    /\b(low|limited)\s+stock\b/i,
    /\balmost\s+(gone|sold\s+out)\b/i,
    /\bselling\s+(fast|out)\b/i,
    /\bhurry\b/i,
    /\blast\s+chance\b/i,
    /\bdon'?t\s+miss\s+out\b/i,
    /\b(offer|deal|sale|discount|price)\s+(ends|expires)\b/i,
    /\bends\s+in\s+\d/i,
    /\b\d+\s+(people|others|shoppers|customers|users)\s+(are\s+)?(viewing|looking|watching|have\s+this)/i,
    /\bin\s+\d+\s+(other\s+)?(carts|baskets)\b/i,
    /\b(bought|sold|booked)\s+\d+\s+times?\s+in\s+the\s+last\b/i,
    /\bin\s+high\s+demand\b/i,
    /\bplus\s+que\s+\d+/i,
    /\bil\s+n'en\s+reste\s+que\b/i,
    /\bdépêchez[- ]vous\b/i,
    /\bse\s+termine\s+dans\b/i,
    /\bdernière\s+chance\b/i,
    /\b\d+\s+personnes\s+(regardent|consultent)/i
  ];

  // Looks like a timer: 04:59, 1:02:33, 2h 15m, 10m 30s
  const TIMER = /\b\d{1,2}\s*:\s*\d{2}(\s*:\s*\d{2})?\b|\b\d+\s*[hd]\s*\d+\s*m(in)?\b|\b\d+\s*m(in)?\s*\d+\s*s(ec)?\b/i;

  const MAX_TEXT = 160; // never hide anything with more text than this
  const SCAN_GAP = 1500; // scan at most every 1.5 seconds (timers change every second)
  const CHECK_DELAY = 1600; // wait this long to see if a "timer" really counts

  let enabled = false;
  let lastScan = 0;
  let laterScan = null;
  let timerChecks = new Map(); // element -> its text when we first saw it

  function isUrgent(text) {
    return URGENCY.some((pattern) => pattern.test(text));
  }

  // Grow from the element to its wrapper, but only while the wrapper
  // has (almost) the same text. This hides the whole badge, not the product title.
  function boxFor(el) {
    let box = el;
    const ownLength = box.textContent.trim().length;
    while (
      box.parentElement &&
      box.parentElement !== document.body &&
      box.parentElement.textContent.trim().length <= ownLength + 20
    ) {
      box = box.parentElement;
    }
    return box;
  }

  function isSafeToHide(box) {
    if (!box || box === document.body || box === document.documentElement) {
      return false;
    }
    if (box.textContent.trim().length > MAX_TEXT) {
      return false;
    }
    if (box.matches("button, input, select, textarea, label")) {
      return false;
    }
    // Never hide something that holds a button, a form field or a picture.
    return !box.querySelector("button, input, select, textarea, img, video, svg[role='img']");
  }

  function hide(box) {
    if (!isSafeToHide(box) || box.dataset.easePressure) {
      return;
    }
    box.dataset.easePressure = "hidden";
    const chip = Ease.engine.makeChip(Ease.i18n.t("pressureHidden"), () => {
      box.dataset.easePressure = "shown"; // the user chose to see it: never hide again
    });
    box.insertAdjacentElement("beforebegin", chip);
  }

  function scan(nodes) {
    lastScan = Date.now();
    laterScan = null;
    const seen = new Set();
    const textOf = new Map(); // each element's text, read once per scan (reading it again is slow)
    const read = (el) => {
      if (!textOf.has(el)) {
        textOf.set(el, el.textContent);
      }
      return textOf.get(el);
    };

    for (const node of nodes || Ease.engine.textNodes("[data-ease-pressure]")) {
      const el = node.parentElement;
      if (!el || !el.isConnected || seen.has(el)) {
        continue;
      }
      seen.add(el);

      const text = read(el);
      if (text.length > MAX_TEXT * 2) {
        continue; // long paragraphs are articles, not badges
      }

      // Check the element, and its parent (for text split like "Only <b>2</b> left").
      // A parent with many children (like a whole article) is not a badge: do not read it.
      const parent = el.parentElement;
      const parentText = parent && parent.childElementCount < 12 && read(parent).length <= MAX_TEXT ? read(parent) : "";

      if (isUrgent(text)) {
        hide(boxFor(el));
      } else if (parentText && isUrgent(parentText)) {
        hide(boxFor(parent));
      } else if (TIMER.test(text) && !timerChecks.has(el)) {
        timerChecks.set(el, text);
      }
    }

    // A "timer" only counts if its numbers change. Real clocks and dates stay the same.
    setTimeout(() => {
      if (!enabled) {
        return;
      }
      for (const [el, firstText] of timerChecks) {
        if (el.isConnected && el.textContent !== firstText) {
          hide(boxFor(el));
        }
      }
      timerChecks = new Map();
    }, CHECK_DELAY);
  }

  // Do not scan too often. Pages with a ticking timer change every second.
  // After a change, only the new parts are checked (the engine tells us which).
  // A countdown changes every second, so scans are limited to one every 1.5 seconds.
  let pendingNodes = [];
  let pendingFull = false;
  function scanSoon(full) {
    if (full) {
      pendingFull = true;
    } else {
      pendingNodes.push(...Ease.engine.textNodes("[data-ease-pressure]"));
    }
    const run = () => {
      const nodes = pendingFull ? null : pendingNodes;
      pendingNodes = [];
      pendingFull = false;
      scan(nodes);
    };
    const wait = SCAN_GAP - (Date.now() - lastScan);
    if (wait <= 0) {
      run();
    } else if (!laterScan) {
      laterScan = setTimeout(run, wait);
    }
  }

  Ease.engine.register({
    id: "pressure-remover",
    observe: true, // new messages and timers can appear later

    apply(settings) {
      if (!settings.pressureRemover) {
        this.remove();
        return;
      }
      const firstTime = !enabled;
      enabled = true;
      Ease.engine.setStyle(this.id, '[data-ease-pressure="hidden"] { display: none !important; }');
      scanSoon(firstTime); // the first time: the whole page. After that: only new parts.
    },

    remove() {
      enabled = false;
      clearTimeout(laterScan);
      laterScan = null;
      timerChecks = new Map();
      Ease.engine.removeStyle(this.id);
      for (const box of document.querySelectorAll("[data-ease-pressure]")) {
        const chip = box.previousElementSibling;
        if (chip && chip.classList.contains("ease-chip")) {
          chip.remove();
        }
        delete box.dataset.easePressure;
      }
    }
  });
})();
