// Explain simply.
// The user selects hard text and clicks "Explain simply" (or right-clicks > Explain simply).
// Chrome's on-device AI rewrites it as a few short, numbered points, in the style that fits
// the user's profiles (ADHD, dyslexia, older adults, autism...).
//   - "Even simpler" makes it simpler again (3 levels).
//   - Select one word: "What does it mean?" gives a short meaning.
//   - "Show original" shows the user's text again. Money, health and legal topics get a warning.
// Nothing is sent anywhere: the AI runs on this device (see shared/ai.js).
//
// Speed (the model is small, but it still takes time):
//   - When text is selected, the AI starts loading (warm). When the mouse is on the button,
//     the answer starts (before the click).
//   - Points show while they are being written (streaming), not all at the end.
//   - Answers are kept, so "Show original" and opening the same text again are instant.
//   - After an answer, the next "Even simpler" level is made quietly, so that button is instant too.

(function () {
  const Ease = globalThis.Ease;
  const t = (key, params) => Ease.i18n.t(key, params);

  const MAX_TEXT = 1500; // characters. Longer text: we explain the first part (short input = fast answer).
  const MIN_TEXT = 25; // shorter selections are not worth explaining (but single words get a meaning)
  const SENSITIVE = /\b(tax|benefit|payment|loan|credit|debt|bank|insurance|medic|doctor|dose|diagnos|treatment|health|legal|law|court|contract|visa|immigration|deadline|penalt|fine[sd]?\b)/i;

  // How the reader likes text, from their profiles.
  const STYLES = {
    focusSupport: "has ADHD. Put the most important point first. Keep each point very short.",
    readingFocus: "loses their place easily. Put the most important point first. Keep each point very short.",
    readableTypography: "has dyslexia. Use short sentences and common, easy words.",
    cognitiveSupport: "has memory or thinking difficulties. One idea per sentence. Explain any hard word in brackets.",
    olderAdults: "is an older adult who is new to computers. Use everyday words. Explain any technical word.",
    sensoryCalm: "is autistic. Use literal, direct words. No idioms, no metaphors, no sarcasm.",
    lowStress: "feels anxious. Use a calm, neutral tone. No alarming words."
  };
  // Few, short points: every word the AI writes takes time (most computers run it without a graphics card).
  const LEVELS = [
    { grade: "grade 6", points: 3, words: 14 },
    { grade: "grade 4", points: 3, words: 10 },
    { grade: "grade 2", points: 2, words: 8 }
  ];

  let settings = null;
  let enabled = false;
  let buttonHost = null;
  let panel = null;
  let bubble = null;
  let saved = { text: "", word: "", sentence: "", rect: null };
  let current = { text: "", level: 0, points: [], showingOriginal: false };

  // ---------- Prompts ----------

  function styleLine() {
    const lines = (settings.profiles || []).map((id) => STYLES[id]).filter(Boolean);
    return lines.length ? "The reader " + lines.join(" The reader ") : "The reader finds long or formal text hard to read.";
  }

  // The rules (system) do not change between levels, so the warm session can be reused.
  // The answer is plain lines ("- point"), so each point can be shown as soon as it is written.
  function explainSystem() {
    return (
      "You rewrite hard text in plain language.\n" + styleLine() + "\nRules:\n" +
      "- Keep every important fact: who, what, money amounts, dates, deadlines and what the reader must do.\n" +
      "- Do not add new facts. Do not give advice that is not in the text.\n" +
      "- Start with the most important point.\n" +
      "- If the reader must do something, say it clearly.\n" +
      '- Write one point per line. Start each line with "- ". Write nothing else.'
    );
  }

  function explainTask(text, level) {
    const l = LEVELS[level];
    return {
      language: settings.language,
      system: explainSystem(),
      prompt:
        `Use simple words that a ${l.grade} student knows. Write at most ${l.points} points. ` +
        `Each point has at most ${l.words} words.\nText:\n"""` + text + '"""'
    };
  }

  // "- point" lines -> ["point", ...]. The last line may still be growing.
  function toPoints(text, level) {
    return text
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, LEVELS[level].points);
  }

  function wordTask(word, sentence) {
    return {
      language: settings.language,
      system: "You explain one word for a reader who finds reading hard. Use at most 10 simple words. Use the meaning that fits the sentence.",
      prompt: 'Word: "' + word + '"\nSentence: "' + sentence.slice(0, 400) + '"',
      schema: { type: "object", properties: { meaning: { type: "string" } }, required: ["meaning"] }
    };
  }

  function errorText(error) {
    const code = error && error.message;
    return code === "needs-setup" ? t("aiNeedsSetup") : code === "no-api" ? t("aiNotAvailable") : t("aiFailed");
  }

  // ---------- Answers: started early, kept for later ----------
  // key "level|text" -> { points, text, done: Promise, stop(), listeners: Set }
  const jobs = new Map();
  const MAX_JOBS = 12;

  function startJob(text, level) {
    const key = level + "|" + text;
    let job = jobs.get(key);
    if (job && !job.failed) {
      return job;
    }
    job = { points: [], finished: false, failed: false, listeners: new Set() };
    const stream = Ease.ai.stream(explainTask(text, level), (soFar) => {
      job.points = toPoints(soFar, level);
      job.listeners.forEach((listener) => listener(job));
    });
    job.stop = stream.stop;
    job.done = stream.done.then(
      (finalText) => {
        job.points = toPoints(finalText, level);
        job.finished = true;
        return job;
      },
      (error) => {
        job.failed = true;
        jobs.delete(key);
        throw error;
      }
    );
    job.done.catch(() => {});
    jobs.set(key, job);
    if (jobs.size > MAX_JOBS) {
      const [oldKey, oldJob] = jobs.entries().next().value;
      if (oldJob.finished || oldJob.failed) {
        jobs.delete(oldKey);
      }
    }
    return job;
  }

  // Stop answers nobody will see (mouse left the button, panel closed).
  function stopUnused(keepText) {
    for (const [key, job] of jobs) {
      if (!job.finished && !job.listeners.size && !key.endsWith("|" + keepText)) {
        job.stop();
        jobs.delete(key);
      }
    }
  }

  // ---------- Shared look (Shadow DOM: the website can not change it) ----------

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    button { cursor: pointer; font: 700 14px/1 system-ui, sans-serif; border-radius: 10px; }
    button:focus-visible { outline: 3px solid #FFD54A; outline-offset: 2px; }
    .ask { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border: none;
           background: #34406A; color: #FBFBF9; box-shadow: 0 6px 18px rgba(0,0,0,0.2); }
    .panel { width: min(400px, calc(100vw - 24px)); max-height: calc(100vh - 32px); overflow: auto; background: #FBFBF9;
             color: #2A2F36; border: 1px solid #DDDDD6; border-radius: 18px; padding: 16px; box-shadow: 0 14px 34px rgba(0,0,0,0.22); }
    .panel:focus { outline: none; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    h2 { font: 700 18px/1.2 system-ui, sans-serif; margin: 0; }
    .close { width: 36px; height: 36px; border: none; background: transparent; color: #555B66; font-size: 22px; }
    .for { display: inline-block; margin: 8px 0 10px; padding: 3px 10px; border-radius: 999px; background: #E8EAF1; color: #34406A; font: 700 12px/1.4 system-ui; }
    .status { font: 400 15px/1.45 system-ui; color: #555B66; margin: 8px 0; }
    ol { list-style: none; counter-reset: s; margin: 8px 0; padding: 0; }
    li { counter-increment: s; display: flex; gap: 10px; margin-bottom: 10px; font: 400 16px/1.45 system-ui; }
    li::before { content: counter(s); flex: none; width: 26px; height: 26px; border-radius: 50%; background: #4A5A8C; color: #fff;
                 display: grid; place-items: center; font: 700 14px/1 system-ui; }
    .skeleton { margin: 10px 0; }
    .skeleton i { display: block; height: 14px; border-radius: 7px; background: #E3E5EC; margin: 0 0 12px 36px; animation: pulse 1.2s ease-in-out infinite; }
    .skeleton i:nth-child(2) { width: 70%; } .skeleton i:nth-child(3) { width: 82%; }
    @keyframes pulse { 50% { opacity: 0.45; } }
    @media (prefers-reduced-motion: reduce) { .skeleton i { animation: none; } }
    li.typing::after { content: "▍"; color: #4A5A8C; margin-left: 2px; }
    .original { font: 400 15px/1.55 Georgia, serif; white-space: pre-wrap; background: #F1F1EC; border-radius: 10px; padding: 10px; }
    .level { display: flex; gap: 5px; align-items: center; font: 400 12.5px/1 system-ui; color: #555B66; margin: 6px 0 12px; }
    .level i { width: 22px; height: 6px; border-radius: 3px; background: #D6D9E3; display: block; }
    .level i.on { background: #4A5A8C; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .buttons button { height: 40px; padding: 0 14px; border: 1px solid #DDDDD6; background: #FBFBF9; color: #2A2F36; }
    .buttons button.main { background: #4A5A8C; color: #FBFBF9; border: none; }
    .buttons button:disabled { opacity: 0.5; cursor: default; }
    .warn { background: #FBEDE5; color: #6B2E10; border-radius: 10px; padding: 8px 10px; font: 400 13px/1.4 system-ui; margin-top: 12px; }
    .foot { font: 400 12px/1.4 system-ui; color: #555B66; margin-top: 10px; }
    .bubble { max-width: 300px; background: #2A2F36; color: #fff; border-radius: 12px; padding: 10px 12px; font: 400 15px/1.4 system-ui;
              box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
    .bubble b { display: block; margin-bottom: 2px; }`;

  function makeHost(id, css) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;z-index:2147483647;" + css;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
    return { host, shadow };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  // ---------- The button next to selected text ----------

  // clicked = true: the user pressed the button, so keep the answer that already started.
  function hideButton(clicked) {
    if (buttonHost) {
      buttonHost.remove();
      buttonHost = null;
      if (!panel && !clicked) {
        stopUnused(""); // the user did not click: stop answers started early
      }
    }
  }

  function onSelectionDone(event) {
    if (!enabled || (event && event.target && event.target.id && event.target.id.startsWith("ease-"))) {
      return;
    }
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection && !selection.isCollapsed ? selection.toString().trim() : "";
      const isWord = /^[\p{L}'-]{3,30}$/u.test(text);
      if (!text || (!isWord && text.length < MIN_TEXT)) {
        hideButton();
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      saved = {
        text: text.slice(0, MAX_TEXT),
        cut: text.length > MAX_TEXT,
        word: isWord ? text : "",
        sentence: isWord ? (range.startContainer.parentElement || document.body).textContent.trim() : "",
        rect
      };
      hideButton();
      // Read Aloud puts its button at the same place: we go to its right.
      const shift = settings.readAloud && settings.readAloud !== "off" ? 250 : 0;
      const top = rect.bottom + 8 > window.innerHeight - 56 ? rect.top - 52 : rect.bottom + 8;
      const left = Math.min(window.innerWidth - 230, Math.max(8, rect.left + shift));
      const made = makeHost("ease-explain-button", `top:${Math.max(8, top)}px;left:${left}px;`);
      const button = el("button", "ask", isWord ? t("exWord") : t("exButton"));
      button.type = "button";
      // Load the AI now, and start the answer when the mouse reaches the button.
      Ease.ai.warm(isWord ? wordTask("", "") : { language: settings.language, system: explainSystem() });
      const early = () => {
        if (!saved.word) {
          startJob(saved.text, 0);
        }
      };
      button.addEventListener("pointerenter", early);
      button.addEventListener("focus", early);
      button.addEventListener("mousedown", (e) => e.preventDefault()); // keep the page selection
      button.addEventListener("click", () => {
        hideButton(true);
        if (saved.word) {
          explainWord(saved.word, saved.sentence, saved.rect);
        } else {
          openPanel(saved.text, saved.cut);
        }
      });
      made.shadow.appendChild(button);
      buttonHost = made.host;
    }, 0);
  }

  // ---------- Word meaning ----------

  async function explainWord(word, sentence, rect) {
    closeBubble();
    const top = Math.min(window.innerHeight - 90, rect.bottom + 10);
    const made = makeHost("ease-explain-word", `top:${Math.max(8, top)}px;left:${Math.max(8, Math.min(window.innerWidth - 320, rect.left))}px;`);
    const box = el("div", "bubble");
    box.setAttribute("role", "status");
    box.append(el("b", "", word), el("span", "", t("exWorking")));
    made.shadow.appendChild(box);
    bubble = made.host;
    try {
      const answer = await Ease.ai.ask(wordTask(word, sentence));
      box.lastChild.textContent = answer.meaning;
    } catch (error) {
      box.lastChild.textContent = errorText(error);
    }
    setTimeout(closeBubble, 12000);
  }

  function closeBubble() {
    if (bubble) {
      bubble.remove();
      bubble = null;
    }
  }

  // ---------- The panel ----------

  function profileNames() {
    return (settings.profiles || []).map((id) => t("profile_" + id)).slice(0, 3).join(" · ");
  }

  function openPanel(text, cut) {
    closePanel();
    current = { text, cut, level: 0, points: [], finished: false, showingOriginal: false };
    const made = makeHost("ease-explain-panel", "top:16px;right:12px;");
    const box = el("section", "panel");
    box.tabIndex = -1;
    box.setAttribute("aria-labelledby", "ex-title");

    const head = el("div", "head");
    const title = el("h2", "", t("exTitle"));
    title.id = "ex-title";
    const close = el("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("trClose"));
    close.addEventListener("click", closePanel);
    head.append(title, close);
    box.appendChild(head);

    if (profileNames()) {
      box.appendChild(el("span", "for", t("exFor", { list: profileNames() })));
    }
    const status = el("p", "status");
    status.setAttribute("role", "status");
    const list = el("ol");
    const skeleton = el("div", "skeleton");
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.append(el("i"), el("i"), el("i"));
    const original = el("p", "original", text);
    original.hidden = true;
    const level = el("div", "level");
    const buttons = el("div", "buttons");
    const simpler = el("button", "main", t("exSimpler"));
    const read = el("button", "", "🔊 " + t("readAloudRead"));
    const toggle = el("button", "", t("exOriginal"));
    for (const b of [simpler, read, toggle]) {
      b.type = "button";
    }
    buttons.append(simpler, read, toggle);
    box.append(status, skeleton, list, original, level, buttons);
    if (SENSITIVE.test(text)) {
      box.appendChild(el("p", "warn", t("exWarn")));
    }
    box.appendChild(el("p", "foot", t("aiFooter")));
    made.shadow.appendChild(box);
    panel = made.host;
    panel.parts = { status, skeleton, list, original, level, simpler, read, toggle };

    simpler.addEventListener("click", () => {
      if (current.level < LEVELS.length - 1) {
        current.level += 1;
        run();
      }
    });
    read.addEventListener("click", readPoints);
    toggle.addEventListener("click", () => {
      current.showingOriginal = !current.showingOriginal;
      draw();
    });
    box.focus();
    run();
  }

  let watching = null; // the job the panel shows now

  async function run() {
    const p = panel.parts;
    const level = current.level;
    p.simpler.disabled = true;
    p.read.disabled = true;
    if (watching) {
      watching.listeners.delete(onJobText);
    }
    let job;
    try {
      job = startJob(current.text, level);
    } catch (error) {
      showError(error);
      return;
    }
    watching = job;
    current.points = job.points;
    current.finished = job.finished;
    p.status.textContent = t("exWorking");
    p.status.hidden = job.finished || job.points.length > 0;
    job.listeners.add(onJobText);
    draw();
    try {
      await job.done;
      if (watching !== job || !panel) {
        return;
      }
      current.points = job.points;
      current.finished = true;
      p.status.hidden = !current.cut;
      p.status.textContent = current.cut ? t("exPartial") : "";
      draw();
      // Make the next level now, so "Even simpler" is instant.
      if (level < LEVELS.length - 1) {
        startJob(current.text, level + 1);
      }
    } catch (error) {
      if (watching === job) {
        showError(error);
      }
    } finally {
      job.listeners.delete(onJobText);
    }
  }

  function onJobText(job) {
    if (!panel || watching !== job) {
      return;
    }
    current.points = job.points;
    panel.parts.status.hidden = job.points.length > 0;
    draw();
  }

  function showError(error) {
    current.points = [];
    current.finished = true;
    panel.parts.status.textContent = errorText(error);
    panel.parts.status.hidden = false;
    draw();
  }

  function draw() {
    if (!panel) {
      return;
    }
    const p = panel.parts;
    p.list.textContent = "";
    current.points.forEach((point, index) => {
      const growing = !current.finished && index === current.points.length - 1;
      p.list.appendChild(el("li", growing ? "typing" : "", point));
    });
    p.skeleton.hidden = current.finished || current.points.length > 0 || current.showingOriginal;
    p.list.setAttribute("aria-busy", String(!current.finished));
    p.list.hidden = current.showingOriginal;
    p.original.hidden = !current.showingOriginal;
    p.toggle.textContent = current.showingOriginal ? t("exBack") : t("exOriginal");
    p.level.textContent = "";
    p.level.appendChild(el("span", "", t("exLevel", { n: current.level + 1 })));
    for (let i = 0; i < LEVELS.length; i += 1) {
      const bar = el("i", i <= current.level ? "on" : "");
      bar.setAttribute("aria-hidden", "true");
      p.level.appendChild(bar);
    }
    p.level.hidden = !current.points.length;
    p.simpler.disabled = !current.finished || !current.points.length || current.level >= LEVELS.length - 1;
    p.read.disabled = !current.finished || !current.points.length;
  }

  function readPoints() {
    if (!("speechSynthesis" in window)) {
      return;
    }
    speechSynthesis.cancel();
    const lang = (Ease.LANGUAGES.find((l) => l.code === settings.language) || {}).voice || "en-CA";
    const speech = new SpeechSynthesisUtterance(current.points.map((p, i) => i + 1 + ". " + p).join(" "));
    speech.lang = lang;
    speech.rate = settings.readAloud === "slow" ? 0.8 : settings.readAloud === "fast" ? 1.2 : 1;
    speechSynthesis.speak(speech);
  }

  function closePanel() {
    if (panel) {
      panel.remove();
      panel = null;
      if (watching) {
        watching.listeners.delete(onJobText);
        watching = null;
      }
      stopUnused("");
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
    }
  }

  function onKey(event) {
    if (event.key === "Escape") {
      closePanel();
      closeBubble();
      hideButton();
    }
  }

  // Right-click > "Explain simply" (sent by the background through main.js).
  function onMenu(event) {
    const selected = window.getSelection() ? window.getSelection().toString().trim() : "";
    const text = (selected || (event.detail && event.detail.text) || "").trim();
    if (text && settings) {
      openPanel(text.slice(0, MAX_TEXT), text.length > MAX_TEXT);
    }
  }
  document.addEventListener("ease:explainSelection", onMenu);

  Ease.engine.register({
    id: "explain",
    observe: false,

    apply(newSettings) {
      settings = newSettings;
      if (!settings.explainSimply) {
        this.remove();
        return;
      }
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
      document.removeEventListener("mouseup", onSelectionDone);
      document.removeEventListener("keyup", onSelectionDone);
      document.removeEventListener("keydown", onKey);
      hideButton();
      closeBubble();
      closePanel();
    }
  });

  // For tests.
  Ease.explain = { explainTask: (text, level) => explainTask(text, level), open: (text) => openPanel(text, false) };
})();
