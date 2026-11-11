// Show me how.
// The user types what they want to do (in the popup's search box), for example
// "How do I turn on captions?". We find the right button on this page and point to it:
// a red outline around it, a guide pointer that glides from the user's mouse to it ("Click here"),
// and a bubble "Step 1: Click Settings" with Do it for me / I did it / Stop.
// The user's real mouse is never moved (no extension can). The user clicks.
//
// How we find the button:
//   1. We list the buttons, links and menus on the page with their names (what a screen reader hears).
//   2. Chrome's on-device AI picks the next one to click. After each click we look again,
//      so menus that open after a click work too. At most 6 steps.
//   3. No AI on this computer? We match the user's words to the button names instead
//      (up to 3 steps, with "Not this one" to try the next best match). WHERE knows where web apps
//      hide things: "page header" is under the Insert tab in Word, "animation" under Animations.
//
// Safety: "Do it for me" never clicks Buy, Pay, Delete, Send, Submit, Sign in and similar.
// The user must click those themselves. Nothing is sent anywhere.

(function () {
  const Ease = globalThis.Ease;
  const t = (key, params) => Ease.i18n.t(key, params);

  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="checkbox"], [role="switch"], [role="option"], [role="combobox"], [aria-haspopup]';
  const MAX_CONTROLS = 180;
  const MAX_STEPS = 6;
  const DANGER = /\b(buy|purchase|pay|payment|checkout|check out|place order|order now|add to cart|delete|remove|erase|trash|send|submit|post|publish|sign in|sign up|log ?in|log ?out|sign out|register|password|transfer|unsubscribe|confirm|subscribe|donate|book now|reserve)\b/i;
  const STOP_WORDS = new Set("how do i can you the a an to on in of for my me is it this that where what please want find show turn get make go use open with and or be page site here there".split(" "));
  const SYNONYMS = {
    captions: ["subtitles", "cc", "closed captions"], subtitles: ["captions", "cc"],
    settings: ["preferences", "options", "gear", "configuration"], search: ["find", "magnifier", "look up"],
    cart: ["basket", "bag", "trolley"], account: ["profile", "my account", "user"], profile: ["account"],
    menu: ["navigation", "nav", "more", "hamburger", "main menu"], download: ["save", "export"], export: ["download", "save as"],
    share: ["send to", "copy link"], print: ["printer"], help: ["support", "faq", "contact"], home: ["start", "main page"],
    language: ["english", "français", "lang"], dark: ["theme", "night", "appearance"], volume: ["sound", "mute", "audio"],
    mute: ["volume", "sound"], fullscreen: ["full screen", "expand"], comments: ["comment", "replies"], like: ["thumbs up", "favourite", "favorite"],
    next: ["forward"], back: ["previous", "return"], login: ["sign in", "log in"], zoom: ["bigger", "magnify"]
  };

  // Where web apps (Word, PowerPoint, Excel, Google Docs...) keep things that are not on screen yet.
  // If the user's words match and the page has a tab or menu with this name, we open it first.
  const WHERE = [
    { words: ["header", "footer", "page number", "page numbers", "table", "picture", "pictures", "image", "photo", "chart", "link", "comment", "text box", "shape", "shapes", "symbol", "equation", "page break", "video", "icon", "icons"], place: /^insert$/i },
    { words: ["animation", "animations", "animate"], place: /^animations?$/i },
    { words: ["transition", "transitions"], place: /^transitions?$/i },
    { words: ["margin", "margins", "orientation", "landscape", "portrait", "columns", "page size", "spacing", "indent"], place: /^(layout|page layout)$/i },
    { words: ["spelling", "grammar", "word count", "track changes", "editor"], place: /^review$/i },
    { words: ["theme", "themes", "background", "watermark", "page color"], place: /^design$/i },
    { words: ["zoom", "ruler", "gridlines", "dark mode", "immersive reader"], place: /^view$/i },
    { words: ["formula", "formulas", "sum", "function"], place: /^formulas$/i },
    { words: ["sort", "filter", "remove duplicates"], place: /^data$/i },
    { words: ["save", "save as", "print", "export", "download", "rename", "version history"], place: /^file$/i }
  ];
  const MAX_WORD_STEPS = 3;

  let settings = null;
  let session = null; // { goal, done: [], step, useAI, candidates, tried }
  let ring = null;
  let bubble = null;
  let target = null;

  // ---------- Reading the page ----------

  function visible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      return false;
    }
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
  }

  function nameOf(element) {
    const parts = [
      element.getAttribute("aria-label"),
      element.getAttribute("aria-labelledby") && element.getAttribute("aria-labelledby").split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || "").join(" "),
      element.title,
      element.getAttribute("alt"),
      element.querySelector && (element.querySelector("img[alt]") || {}).alt,
      element.placeholder,
      element.tagName === "INPUT" && /^(button|submit|reset)$/i.test(element.type) ? element.value : "",
      element.labels && element.labels[0] ? element.labels[0].textContent : "",
      element.textContent
    ];
    const name = parts.find((part) => part && String(part).trim());
    return name ? String(name).replace(/\s+/g, " ").trim().slice(0, 80) : "";
  }

  function roleOf(element) {
    return element.getAttribute("role") || (element.tagName === "A" ? "link" : element.tagName === "INPUT" ? "input " + (element.type || "text") : element.tagName.toLowerCase());
  }

  function readControls() {
    const list = [];
    for (const element of document.querySelectorAll(CONTROLS)) {
      if (element.closest("[id^='ease-']") || !visible(element)) {
        continue;
      }
      const name = nameOf(element);
      if (!name) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.top < window.innerHeight;
      list.push({ element, name, role: roleOf(element), inView });
    }
    // Things on screen first, then the rest of the page.
    list.sort((a, b) => Number(b.inView) - Number(a.inView));
    return list.slice(0, MAX_CONTROLS);
  }

  // ---------- Finding the next step ----------

  function words(text) {
    return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]+/gu) || [];
  }

  // No AI: score each control by how many of the user's words (and similar words) are in its name.
  function rankByWords(goal, controls) {
    const wanted = new Set();
    for (const word of words(goal)) {
      if (STOP_WORDS.has(word) || word.length < 2) {
        continue;
      }
      wanted.add(word);
      for (const similar of SYNONYMS[word] || []) {
        wanted.add(similar);
      }
    }
    const scored = controls.map((control) => {
      const name = " " + words(control.name).join(" ") + " ";
      let score = 0;
      for (const want of wanted) {
        if (name.includes(" " + want + " ")) {
          score += want.includes(" ") ? 3 : 2;
        } else if (want.length > 3 && name.includes(want)) {
          score += 1;
        }
      }
      if (control.name.length > 40) {
        score -= 0.5; // long link texts (articles) are rarely the button people mean
      }
      return { control, score };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => Object.assign(s.control, { score: s.score }));
  }

  // The tab or menu where this goal usually lives (Insert, Animations...), if the page has one.
  function placeFor(goal, controls) {
    const text = " " + words(goal).join(" ") + " ";
    for (const entry of WHERE) {
      if (entry.words.some((word) => text.includes(" " + word + " "))) {
        const place = controls.find((c) => entry.place.test(c.name.trim()) && !session.tried.includes(c.element));
        if (place) {
          return place;
        }
      }
    }
    return null;
  }

  async function askAI(goal, done, controls) {
    const list = controls.map((c, i) => i + ": " + c.role + ' "' + c.name + '"').join("\n");
    const answer = await Ease.ai.ask({
      language: settings.language,
      system:
        "You help a person use a website. You get their goal, the steps already done, and a numbered list of controls on the page now. " +
        "Choose the ONE control they should use next. Write a short instruction (at most 8 words), like 'Click Settings'. " +
        "If the goal is already reached, set done to true. If no control fits, set index to -1.",
      prompt: "Goal: " + goal + "\nSteps already done: " + (done.length ? done.join("; ") : "none") + "\nControls:\n" + list,
      schema: {
        type: "object",
        properties: { index: { type: "integer" }, instruction: { type: "string" }, done: { type: "boolean" } },
        required: ["index", "instruction", "done"]
      }
    });
    return answer;
  }

  async function nextStep() {
    if (!session) {
      return;
    }
    clearTarget();
    showBubble({ busy: true });
    const controls = readControls();
    if (session.useAI && session.step < MAX_STEPS) {
      try {
        const answer = await askAI(session.goal, session.done, controls);
        if (!session) {
          return;
        }
        if (answer.done) {
          showBubble({ finished: true });
          return;
        }
        const control = controls[answer.index];
        if (control) {
          pointAt(control, answer.instruction || t("smhClick", { name: control.name }));
          return;
        }
      } catch (error) {
        session.useAI = false; // no AI on this computer: use word matching
        session.aiError = error && error.message;
      }
    }
    // Word matching: up to 3 steps (for example: Insert tab, then Header & Footer).
    session.candidates = rankByWords(session.goal, controls).filter((c) => !session.tried.includes(c.element) && !session.clicked.includes(c.element));
    const best = session.candidates[0];
    const strong = best && best.score >= 2;
    if (session.step > 0 && (!strong || session.step >= MAX_WORD_STEPS)) {
      showBubble({ finished: true });
      return;
    }
    if (!strong) {
      const place = placeFor(session.goal, controls);
      if (place && !session.clicked.includes(place.element)) {
        pointAt(place, t("smhOpenTab", { name: place.name }), true);
        return;
      }
    }
    if (!best) {
      showBubble({ notFound: true });
      return;
    }
    pointAt(best, t("smhClick", { name: best.name }), true);
  }

  // ---------- Pointing at the control ----------

  function pointAt(control, instruction, guess) {
    target = control;
    session.instruction = instruction;
    session.guess = Boolean(guess);
    control.element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    control.element.addEventListener("click", onUserClick, { capture: true, once: true });
    setTimeout(() => {
      drawRing();
      showBubble({});
      flyPointer();
    }, 350);
  }

  function onUserClick() {
    if (!session || !target) {
      return;
    }
    session.clicked.push(target.element);
    session.done.push(session.instruction);
    session.step += 1;
    setTimeout(nextStep, 800); // wait for menus to open
  }

  // ---------- The guide pointer ----------
  // A big arrow that glides from where the user's mouse is to the button, with "Click here".
  // It is only a picture: the real mouse stays with the user.
  const GUIDE = "#E03131"; // red outline, as people asked for ("click here, on the red line")
  let pointer = null;
  let mouse = null;
  function onMouseMove(event) {
    mouse = { x: event.clientX, y: event.clientY };
  }

  function flyPointer() {
    if (!target) {
      return;
    }
    const rect = target.element.getBoundingClientRect();
    // The tip lands low on the button, so it does not hide the button's name.
    const x = Math.round(rect.left + rect.width * 0.7);
    const y = Math.round(rect.top + rect.height * 0.75);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!pointer) {
      pointer = document.createElement("div");
      pointer.id = "ease-smh-pointer";
      pointer.setAttribute("aria-hidden", "true");
      const shadow = pointer.attachShadow({ mode: "open" });
      shadow.innerHTML =
        `<style>:host{all:initial}.p{display:flex;align-items:flex-start;gap:2px}` +
        `.tag{margin-top:26px;padding:5px 10px;border-radius:999px;background:${GUIDE};color:#fff;font:700 14px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.25)}</style>` +
        `<div class="p"><svg width="38" height="44" viewBox="0 0 38 44"><path d="M3 2 L3 34 L12 26 L18 40 L24 37 L18 24 L30 24 Z" fill="#fff" stroke="#1d2433" stroke-width="2.5" stroke-linejoin="round"/></svg>` +
        `<span class="tag"></span></div>`;
      document.documentElement.appendChild(pointer);
      const start = mouse || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      pointer.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(${start.x}px,${start.y}px);`;
    }
    pointer.shadowRoot.querySelector(".tag").textContent = t("smhClickHere");
    pointer.getBoundingClientRect(); // start from the old place
    pointer.style.transition = reduce ? "none" : "transform 0.9s cubic-bezier(.2,.8,.2,1)";
    pointer.style.transform = `translate(${x - 4}px,${y - 4}px)`;
    if (!reduce && pointer.animate) {
      // When it arrives: a small "press" so it looks like a click
      pointer.animate([{ scale: "1" }, { scale: "0.85" }, { scale: "1" }], { duration: 500, delay: 950, iterations: 2 });
    }
  }

  function placePointer() {
    if (!pointer || !target) {
      return;
    }
    const rect = target.element.getBoundingClientRect();
    pointer.style.transition = "none";
    pointer.style.transform = `translate(${Math.round(rect.left + rect.width * 0.7) - 4}px,${Math.round(rect.top + rect.height * 0.75) - 4}px)`;
  }

  function removePointer() {
    if (pointer) {
      pointer.remove();
      pointer = null;
    }
  }

  function drawRing() {
    if (!target) {
      return;
    }
    const rect = target.element.getBoundingClientRect();
    if (!ring) {
      ring = document.createElement("div");
      ring.id = "ease-smh-ring";
      ring.setAttribute("aria-hidden", "true");
      document.documentElement.appendChild(ring);
    }
    const pad = 8;
    // A gentle pulse, so the eye finds the ring. Not when the computer asks for less motion.
    if (!ring.pulse && ring.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ring.pulse = ring.animate(
        [{ boxShadow: "0 0 0 6px rgba(224,49,49,0.35), 0 0 0 9999px rgba(20,24,36,0.25)" },
         { boxShadow: "0 0 0 14px rgba(224,49,49,0.08), 0 0 0 9999px rgba(20,24,36,0.25)" }],
        { duration: 1200, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }
      );
    }
    ring.style.cssText =
      `position:fixed;z-index:2147483646;pointer-events:none;border:4px solid ${GUIDE};border-radius:12px;` +
      "box-shadow:0 0 0 6px rgba(224,49,49,0.35),0 0 0 9999px rgba(20,24,36,0.25);" +
      `top:${rect.top - pad}px;left:${rect.left - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;`;
  }

  function clearTarget() {
    if (target) {
      target.element.removeEventListener("click", onUserClick, { capture: true });
    }
    target = null;
    if (ring) {
      ring.remove();
      ring = null;
    }
  }

  // Is something (like a pop-up) on top of the target, so the user can not click it?
  function isCovered(element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      return false; // off screen: not covered, just scrolled away
    }
    const top = document.elementFromPoint(x, y);
    if (!top || element === top || element.contains(top) || top.contains(element)) {
      return false;
    }
    return !(top.id && top.id.startsWith("ease-")); // our own ring and bubble do not count
  }

  function isDangerous(control) {
    const element = control.element;
    // A <button> with no type is "submit" even outside a form, so only buttons IN a form count as submit.
    const submitsForm = Boolean(element.form) && /^(submit|image)$/i.test(element.type || "");
    return DANGER.test(control.name) || /^password$/i.test(element.type || "") || submitsForm || Boolean(element.form && element.form.querySelector('input[type="password"]'));
  }

  function doItForMe() {
    if (!target) {
      return;
    }
    if (isDangerous(target)) {
      showBubble({ unsafe: true });
      return;
    }
    const element = target.element;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) && !/^(button|checkbox|radio)$/i.test(element.type || "")) {
      element.focus(); // a box to type in: we put the cursor there, the user types
      showBubble({ typeHere: true });
      return;
    }
    element.click(); // our click listener moves on to the next step
  }

  // ---------- The bubble ----------

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    .box { position: relative; width: min(330px, calc(100vw - 24px)); background: #FBFBF9; color: #2A2F36; border: 3px solid #E03131;
           border-radius: 16px; padding: 14px; box-shadow: 0 14px 30px rgba(0,0,0,0.3); }
    /* The arrow on the bubble: it points at the button with the red outline */
    .box.below::before, .box.above::before { content: ""; position: absolute; left: var(--arrow, 50%); transform: translateX(-50%);
           border: 12px solid transparent; }
    .box.below::before { top: -24px; border-bottom-color: #E03131; }
    .box.above::before { bottom: -24px; border-top-color: #E03131; }
    .goal { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;
            padding: 3px 9px; border-radius: 999px; background: #E8EAF1; color: #34406A; font: 600 12.5px/1.4 system-ui; }
    .step { font: 700 13px/1.3 system-ui; color: #555B66; }
    h2 { font: 700 17px/1.3 system-ui; margin: 4px 0; }
    p { font: 400 14px/1.45 system-ui; color: #555B66; margin: 4px 0 0; }
    .buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    button { height: 38px; padding: 0 12px; border-radius: 10px; border: 1px solid #DDDDD6; background: #FBFBF9; color: #2A2F36;
             font: 700 14px/1 system-ui; cursor: pointer; }
    button.main { background: #4A5A8C; color: #FBFBF9; border: none; }
    button:focus-visible { outline: 3px solid #34406A; outline-offset: 2px; }`;

  function showBubble(state) {
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.id = "ease-smh-bubble";
      bubble.attachShadow({ mode: "open" });
      document.documentElement.appendChild(bubble);
    }
    const shadow = bubble.shadowRoot;
    shadow.textContent = "";
    const style = document.createElement("style");
    style.textContent = STYLE;
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-live", "polite");
    box.setAttribute("aria-label", t("smhTitle"));
    shadow.append(style, box);

    const add = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) {
        node.className = className;
      }
      node.textContent = text;
      box.appendChild(node);
      return node;
    };
    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const button = (text, className, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = className || "";
      b.textContent = text;
      b.addEventListener("click", onClick);
      buttons.appendChild(b);
      return b;
    };

    if (state.busy) {
      add("h2", "", t("smhLooking"));
      add("p", "", session ? "“" + session.goal + "”" : "");
    } else if (state.finished) {
      add("h2", "", t("smhDone"));
      add("p", "", t("smhDoneText"));
      button(t("trClose"), "main", stop);
    } else if (state.notFound) {
      add("h2", "", t("smhNotFound"));
      add("p", "", t("smhNotFoundText"));
      button(t("trClose"), "main", stop);
    } else {
      add("div", "goal", "🧭 " + session.goal); // the user's goal, so they remember what this is for
      add("div", "step", t("smhStep", { n: session.step + 1 }) + (session.guess ? " · " + t("smhGuess") : ""));
      add("h2", "", session.instruction);
      if (state.unsafe) {
        add("p", "", t("smhUnsafe"));
      } else if (target && isCovered(target.element)) {
        add("p", "", t("smhCovered"));
      } else if (state.typeHere) {
        add("p", "", t("smhTypeHere"));
      } else {
        add("p", "", t("smhHint"));
      }
      if (!state.unsafe && !state.typeHere) {
        button(t("smhDoIt"), "main", doItForMe);
      }
      if (session.guess) {
        button(t("smhNotThis"), "", () => {
          session.tried.push(target.element);
          nextStep();
        });
      } else {
        button(t("smhDidIt"), "", onUserClick); // the user did it themselves: go on (never clicks for them)
      }
      button(t("smhStop"), "", stop);
    }
    box.appendChild(buttons);
    placeBubble();
    const first = buttons.querySelector("button");
    if (first) {
      first.focus({ preventScroll: true });
    }
  }

  function placeBubble() {
    if (!bubble) {
      return;
    }
    const width = Math.min(330, window.innerWidth - 24);
    const box = bubble.shadowRoot.querySelector(".box");
    let top = 16;
    let left = window.innerWidth - width - 12;
    let side = "";
    if (target) {
      const rect = target.element.getBoundingClientRect();
      const height = box ? box.offsetHeight : 180;
      const below = rect.bottom + 24 + height < window.innerHeight;
      top = below ? rect.bottom + 24 : Math.max(12, rect.top - 24 - height);
      side = below ? "below" : "above";
      left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
      // Point at the middle of the button (but stay inside the bubble's round corners)
      const arrow = Math.min(width - 24, Math.max(24, rect.left + rect.width / 2 - left));
      if (box) {
        box.style.setProperty("--arrow", arrow + "px");
      }
    }
    if (box) {
      box.classList.toggle("below", side === "below");
      box.classList.toggle("above", side === "above");
    }
    bubble.style.cssText = `position:fixed;z-index:2147483647;top:${top}px;left:${left}px;`;
  }

  function onMove() {
    drawRing();
    placeBubble();
    placePointer();
  }

  function stop() {
    clearTarget();
    removePointer();
    document.removeEventListener("mousemove", onMouseMove, true);
    if (bubble) {
      bubble.remove();
      bubble = null;
    }
    session = null;
    window.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      stop();
    }
  }

  // The popup sends { type: "showMeHow", goal }, main.js turns it into this event.
  document.addEventListener("ease:showMeHow", async (event) => {
    const goal = String((event.detail && event.detail.goal) || "").trim().slice(0, 200);
    if (!goal) {
      return;
    }
    stop();
    if (!settings) {
      const result = await Ease.storage.getEffectiveSettings(location.hostname);
      settings = result.settings;
    }
    session = { goal, done: [], step: 0, useAI: true, tried: [], clicked: [] };
    document.addEventListener("mousemove", onMouseMove, true); // where the guide pointer starts
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    document.addEventListener("keydown", onKey, true);
    nextStep();
  });

  Ease.engine.register({
    id: "show-me-how",
    observe: false,
    apply(newSettings) {
      settings = newSettings;
    },
    remove() {
      stop();
    }
  });

  // For tests.
  Ease.showMeHow = { rankByWords: (goal) => rankByWords(goal, readControls()).map((c) => c.name), isDangerous: (name) => DANGER.test(name) };
})();
