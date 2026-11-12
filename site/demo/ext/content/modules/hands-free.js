// Hands-free.
// For people who can not hold a phone or use a mouse. A helper puts the laptop on a stand once.
// Then the user moves a big pointer with their HEAD, and talks with their VOICE.
//   - The camera and the microphone are used only in the Hands-free side panel (handsfree/panel.js).
//     It sends this page { type: "hfPointer", x, y } (0..1 of the window), "hfClick" (a face gesture)
//     and "hfCommand" (what the user said). main.js turns them into "ease:..." events.
//   - Hold the pointer still on a button: a ring fills, then Ease clicks (also works with a real mouse
//     or a head mouse that moves the real cursor).
//   - A big dock on the side: Scroll up, Scroll down, Play / Pause, Next, Back, Rest.
//   - Voice: "scroll down", "next video", "pause", "click Subscribe", "show numbers", "search cats"...
//
// Safety (decided with the team):
//   - Buying is turned OFF in hands-free mode. Buy, pay, checkout, add to cart, upgrade, donate...
//     are never clicked, and card fields can not be filled. The user is told to ask their helper.
//   - Send, delete, post, share, sign in, subscribe, submit: Ease asks a big YES / NO first.
// Nothing is recorded or sent anywhere.

(function () {
  const Ease = globalThis.Ease;
  const t = (key, params) => Ease.i18n.t(key, params);

  const MONEY = /\b(buy|buying|purchase|pay|payment|pay now|checkout|check out|place order|order now|order|pre-?order|shop|shop now|shopping|deals?|claim offer|get offer|bid|place bid|subscribe and save|add to (cart|bag|basket)|cart|basket|premium|upgrade|donate|donation|tip|book now|rent|membership|join channel|super (chat|thanks|sticker)|subscribe (for|to) \$|trial|gift|send money|wallet|billing)\b|[$€£₹¥]\s?\d/i;
  const RISKY = /\b(send|delete|remove|erase|trash|post|publish|share|reply|comment|sign in|sign up|log ?in|log ?out|sign out|register|submit|confirm|subscribe|unsubscribe|report|block|accept|agree|allow|install|download)\b/i;
  const CARD_FIELD = /\b(card|cvv|cvc|csc|expir|iban|routing|account number|security code)\b/i;
  const CLICKABLE =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,label,video,' +
    '[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="option"],[role="radio"],' +
    '[onclick],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const MOVE_LIMIT = 45; // px. Moving more than this restarts the hold.
  const COOLDOWN = 1200; // ms after a click before the next one

  let settings = null;
  let on = false;
  let host = null;
  let shadow = null;
  let resting = false;
  let point = null; // {x, y} in px
  let headUntil = 0; // the head pointer was used recently: ignore the real mouse
  let dwell = null; // {element, x, y, start}
  let coolUntil = 0;
  let confirmBox = null; // {element, timer}
  let numbers = []; // elements with a number badge
  let statusTimer = 0;
  let ticking = false;
  let writer = null; // the "Write" box: { text, field } (field = the box on the page the user was in)
  let connected = false; // the panel sent the first head pointer
  let edge = { dir: 0, since: 0, frame: 0 }; // looking at the top or bottom edge scrolls
  const EDGE_WAIT = 700; // ms looking at the edge before scrolling starts
  const EDGE_SPEED = { slow: 3, normal: 5, fast: 8 }; // most pixels per frame (about 60 frames a second)

  // ---------- The overlay (Shadow DOM) ----------

  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
  .pointer{position:fixed;left:0;top:0;width:56px;height:56px;margin:-28px 0 0 -28px;pointer-events:none;display:none}
  .pointer.show{display:block}
  .pointer .dot{position:absolute;left:20px;top:20px;width:16px;height:16px;border-radius:50%;background:#E03131;border:3px solid #fff;box-shadow:0 0 0 2px #1d2433}
  .pointer svg{position:absolute;inset:0}
  .pointer .track{fill:none;stroke:rgba(29,36,51,.35);stroke-width:6}
  .pointer .fill{fill:none;stroke:#4A5A8C;stroke-width:6;stroke-linecap:round;transform:rotate(-90deg);transform-origin:28px 28px}
  .pointer.rest .dot{background:#8a8f9c}
  .pointer.mouse .dot{display:none}
  .mark{position:fixed;border:4px solid #4A5A8C;border-radius:10px;pointer-events:none;display:none;box-shadow:0 0 0 4px rgba(255,255,255,.8)}
  .mark.show{display:block}
  .dock{position:fixed;right:12px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;pointer-events:auto;
    background:rgba(241,241,236,.96);border:2px solid #34406A;border-radius:22px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,.25)}
  .dock[hidden]{display:none}
  button{font:600 15px/1.15 system-ui,sans-serif;color:#1d2433;background:#fff;border:2px solid #34406A;border-radius:16px;cursor:pointer}
  .dock{gap:7px}
  .dock button{width:92px;min-height:54px;padding:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
  .dock button .i{font-size:22px;line-height:1}
  .dock button.wake{background:#4A5A8C;color:#fff}
  button:focus-visible{outline:4px solid #E03131;outline-offset:2px}
  .status{position:fixed;left:50%;top:14px;transform:translateX(-50%);max-width:min(640px,calc(100vw - 140px));
    background:#1d2433;color:#fff;font:600 18px/1.3 system-ui,sans-serif;padding:10px 18px;border-radius:999px;display:none;text-align:center}
  .status.show{display:block}
  .card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 150px));pointer-events:auto;
    background:#fff;color:#1d2433;border:3px solid #34406A;border-radius:24px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .card[hidden]{display:none}
  .card h2{margin:0 0 8px;font:700 24px/1.25 system-ui,sans-serif}
  .card p{margin:0 0 18px;font:400 18px/1.4 system-ui,sans-serif}
  .card .row{display:flex;gap:14px}
  .card .row button{flex:1;min-height:96px;font-size:24px}
  .card .yes{background:#2f7d4f;border-color:#1f5a37;color:#fff}
  .card .no{background:#fff}
  .card.stop{border-color:#B42318}
  .card.stop h2{color:#B42318}
  .card.help ul{margin:0 0 18px;padding-left:22px;font:400 17px/1.5 system-ui,sans-serif}
  .card.tabs{width:min(760px,calc(100vw - 150px));max-height:calc(100vh - 40px);overflow:auto}
  .card.tabs h3{margin:6px 0 8px;font:700 18px/1.3 system-ui,sans-serif}
  .card .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:14px}
  .card .grid button{min-height:76px;padding:8px 10px;text-align:left;display:flex;flex-direction:column;justify-content:center;gap:2px}
  .card .grid button b{font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
  .card .grid button span{font:400 14px/1.3 system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
  .card .grid button.now{border-width:4px}
  .card.write{max-height:calc(100vh - 30px);overflow:auto}
  .card.write .row button{min-height:64px;font-size:20px}
  .card.write .grid button b{white-space:normal}
  .card.write .grid{margin-bottom:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
  .card.write .grid button{min-height:62px}
  .card.write{width:min(620px,calc(100vw - 150px));padding:18px 20px}
  .card.write h2{font-size:21px}
  .card.write .typed{min-height:64px;padding:10px 14px;margin-bottom:10px}
  .card.write .chips button{min-height:48px}
  .card .quick[hidden]{display:none}
  .card .quick h3{margin:2px 0 6px;font:700 16px/1.3 system-ui,sans-serif}
  .card .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
  .card .chips button{min-height:52px;min-width:56px;padding:6px 12px;font:700 18px/1.2 system-ui,sans-serif}
  .card.write p{margin-bottom:12px}
  .card.write .typed{min-height:96px;max-height:30vh;overflow:auto;margin:0 0 14px;padding:14px 16px;border:3px solid #34406A;border-radius:16px;
    font:600 26px/1.35 system-ui,sans-serif;background:#F1F1EC;color:#1d2433;overflow-wrap:anywhere}
  .card.write .typed .soon{color:#6b7280}
  .card.write .typed:empty::before{content:attr(data-empty);color:#6b7280;font-weight:400}
  .card .grid button.main{background:#4A5A8C;color:#fff;border-color:#34406A}
  .card .grid button[disabled]{opacity:.45}
  @media (prefers-color-scheme: dark){.card.write .typed{background:#2a3042;color:#f1f1ec;border-color:#9aa6d4}}
  .badge{position:fixed;min-width:30px;height:30px;padding:0 6px;border-radius:15px;background:#E03131;color:#fff;
    font:700 17px/30px system-ui,sans-serif;text-align:center;border:2px solid #fff;pointer-events:none}
  @media (prefers-color-scheme: dark){
    .dock{background:rgba(29,33,45,.96);border-color:#9aa6d4}
    .dock button,.card .no{background:#2a3042;color:#f1f1ec;border-color:#9aa6d4}
    .card{background:#1d212d;color:#f1f1ec;border-color:#9aa6d4}
  }`;

  function build() {
    if (host) {
      return;
    }
    host = document.createElement("div");
    host.id = "ease-handsfree";
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      `<style>${CSS}</style><div class="layer">` +
      `<div class="mark"></div>` +
      `<div class="numbers"></div>` +
      `<div class="status" role="status" aria-live="polite"></div>` +
      `<div class="dock" role="toolbar"></div>` +
      `<div class="card" role="dialog" aria-modal="true" hidden></div>` +
      `<div class="pointer" aria-hidden="true"><div class="dot"></div><svg width="56" height="56"><circle class="track" cx="28" cy="28" r="24"/><circle class="fill" cx="28" cy="28" r="24" stroke-dasharray="150.8" stroke-dashoffset="150.8"/></svg></div>` +
      `</div>`;
    document.documentElement.appendChild(host);
    drawDock();
  }

  const $ = (selector) => shadow.querySelector(selector);

  function drawDock() {
    const dock = $(".dock");
    dock.setAttribute("aria-label", t("hfDock"));
    dock.hidden = settings.handsFreeDock === false;
    const items = resting
      ? [["wake", "▶", "hfWake"]]
      : [
          ["up", "▲", "hfUp"],
          ["down", "▼", "hfDown"],
          ["play", "⏯", "hfPlay"],
          ["next", "⏭", "hfNext"],
          ["back", "↩", "hfBack"],
          ["tabs", "▦", "hfTabsButton"],
          ["write", "⌨", "hfTypeButton"],
          ["rest", "⏸", "hfRest"]
        ];
    dock.innerHTML = "";
    for (const [id, icon, key] of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.hf = id;
      if (id === "wake") {
        button.className = "wake";
      }
      button.innerHTML = `<span class="i" aria-hidden="true">${icon}</span><span></span>`;
      button.lastChild.textContent = t(key);
      button.addEventListener("click", () => dockAction(id));
      dock.appendChild(button);
    }
  }

  function dockAction(id) {
    const actions = { up: () => scroll(-1), down: () => scroll(1), play: playPause, next: () => nextVideo(1), back: goBack, tabs: showTabs, write: openWriter, rest: () => setRest(true), wake: () => setRest(false) };
    (actions[id] || (() => {}))();
  }

  function say(text, ms = 6000) {
    if (!shadow) {
      return;
    }
    const box = $(".status");
    box.textContent = text;
    box.classList.add("show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => box.classList.remove("show"), ms);
  }

  function setRest(value) {
    resting = value;
    stopDwell();
    hideNumbers();
    $(".pointer").classList.toggle("rest", value);
    drawDock();
    say(value ? t("hfResting") : t("hfAwake"));
  }

  // ---------- Pointer and hold-to-click ----------

  // Look at the top or bottom edge of the window for half a second: the page scrolls, slowly, while you look there.
  function edgeScroll(y) {
    const top = window.innerHeight * 0.1;
    const bottom = window.innerHeight * 0.14; // bigger: looking down is harder than looking up
    // A big box is open (Write, Tabs): scroll the box if it is taller than the screen. Otherwise do not scroll the page.
    const card = confirmBox && shadow ? $(".card") : null;
    const cardScrolls = Boolean(card && card.scrollHeight > card.clientHeight + 4);
    const dir = resting || (confirmBox && !cardScrolls) ? 0 : y < top ? -1 : y > window.innerHeight - bottom ? 1 : 0;
    if (dir !== edge.dir) {
      cancelAnimationFrame(edge.frame);
      edge = { dir, since: performance.now(), frame: 0, rest: 0 };
      if (dir) {
        const box = cardScrolls ? card : scroller();
        const most = EDGE_SPEED[settings.handsFreeSpeed] || EDGE_SPEED.normal;
        const step = (now) => {
          const waited = now - edge.since - EDGE_WAIT;
          if (waited > 0) {
            // Starts very slowly and speeds up over 2 seconds. Smooth: a small move every frame.
            const speed = 0.5 + (most - 0.5) * Math.min(1, waited / 2000);
            edge.rest += speed;
            const whole = Math.floor(edge.rest);
            edge.rest -= whole;
            if (whole) {
              box.scrollBy({ top: edge.dir * whole, behavior: "instant" });
            }
          }
          edge.frame = requestAnimationFrame(step);
        };
        edge.frame = requestAnimationFrame(step);
      }
    }
  }

  // Sticky buttons: over something that can be clicked, a head move moves the pointer much less
  // (a third on our big buttons, half on the page), so it is easy to stay on a button.
  // When the pointer leaves the button, it blends back to the head position (no jump).
  let stick = null; // { element, at: {x, y} shown when it arrived, head: {x, y} head pointer when it arrived, slow }
  let carry = { x: 0, y: 0 }; // what is left of the slow part, fading out

  function sticky(x, y) {
    if (stick) {
      const nx = stick.at.x + (x - stick.head.x) * stick.slow;
      const ny = stick.at.y + (y - stick.head.y) * stick.slow;
      if (targetAt(nx, ny) === stick.element) {
        return { x: nx, y: ny };
      }
      carry = { x: nx - x, y: ny - y };
      stick = null;
      return { x: nx, y: ny };
    }
    carry = { x: carry.x * 0.85, y: carry.y * 0.85 };
    const shown = { x: x + carry.x, y: y + carry.y };
    const over = targetAt(shown.x, shown.y);
    if (over) {
      stick = { element: over, at: shown, head: { x, y }, slow: isOurs(over) ? 0.35 : 0.5 };
    }
    return shown;
  }

  function movePointer(x, y, fromHead) {
    if (fromHead) {
      ({ x, y } = sticky(x, y));
    }
    point = { x, y };
    if (fromHead) {
      edgeScroll(y);
    }
    const pointer = $(".pointer");
    // Head: our big pointer. Real mouse: only the ring, around the mouse.
    pointer.classList.add("show");
    pointer.classList.toggle("mouse", !fromHead);
    pointer.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    if (settings.handsFreeClick !== "dwell" && !confirmBox) {
      markTarget(targetAt(x, y)); // gestures click what is marked
      return;
    }
    const element = targetAt(x, y);
    if (!element || Date.now() < coolUntil) {
      stopDwell();
      markTarget(element);
      return;
    }
    if (!dwell || dwell.element !== element || Math.hypot(x - dwell.x, y - dwell.y) > MOVE_LIMIT) {
      dwell = { element, x, y, start: performance.now() };
      markTarget(element);
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(tick);
      }
    }
  }

  function holdTime() {
    return Math.max(0.6, Number(settings.handsFreeHold) || 1.5) * 1000;
  }

  function tick(now) {
    if (!dwell) {
      ticking = false;
      return;
    }
    const part = Math.min(1, (now - dwell.start) / holdTime());
    $(".fill").setAttribute("stroke-dashoffset", String(150.8 * (1 - part)));
    if (part >= 1) {
      const element = dwell.element;
      ticking = false;
      stopDwell();
      press(element);
    } else {
      requestAnimationFrame(tick);
    }
  }

  function stopDwell() {
    dwell = null;
    if (shadow) {
      $(".fill").setAttribute("stroke-dashoffset", "150.8");
    }
  }

  function markTarget(element) {
    const mark = $(".mark");
    if (!element || isOurs(element)) {
      mark.classList.remove("show");
      return;
    }
    const rect = element.getBoundingClientRect();
    mark.style.cssText = `top:${rect.top - 5}px;left:${rect.left - 5}px;width:${rect.width + 10}px;height:${rect.height + 10}px;`;
    mark.classList.add("show");
  }

  function isOurs(element) {
    return element.getRootNode() === shadow;
  }

  // What is under the pointer and can be clicked. Our own buttons first.
  function targetAt(x, y) {
    let element = document.elementFromPoint(x, y);
    if (element === host) {
      element = shadow.elementFromPoint(x, y);
      const button = element && element.closest("button");
      return button && isOurs(button) ? button : null;
    }
    if (resting || confirmBox || !element) {
      return null; // resting: only "Wake up". A question is open: only YES / NO.
    }
    return element.closest(CLICKABLE);
  }

  // ---------- Clicking safely ----------

  function nameFor(element) {
    const name = Ease.showMeHow && Ease.showMeHow.nameOf ? Ease.showMeHow.nameOf(element) : element.textContent;
    return String(name || element.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function isCardField(element) {
    if (!element.matches("input,select,textarea")) {
      return false;
    }
    const auto = element.getAttribute("autocomplete") || "";
    const words = [element.name, element.id, element.placeholder, element.getAttribute("aria-label")].join(" ");
    return /^cc-/.test(auto) || CARD_FIELD.test(words);
  }

  function isSubmit(element) {
    return element.matches('button[type="submit"],input[type="submit"]') || (element.matches("button:not([type])") && element.form);
  }

  function press(element) {
    coolUntil = Date.now() + COOLDOWN;
    if (isOurs(element)) {
      element.click();
      return;
    }
    const name = nameFor(element);
    if (isTextField(element)) {
      if (isCardField(element)) {
        blockMoney();
      } else {
        doClick(element); // typing is not sending: no question
      }
      return;
    }
    if (MONEY.test(name) || isCardField(element) || (element.form && MONEY.test(nameFor(element.form) + " " + (element.form.action || "")) && isSubmit(element))) {
      blockMoney();
      return;
    }
    if (RISKY.test(name) || (isSubmit(element) && !isSearch(element.form))) {
      ask(element, name);
      return;
    }
    doClick(element);
  }

  function isTextField(element) {
    return element.matches('input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),textarea,[contenteditable="true"]');
  }

  function doClick(element) {
    if (isTextField(element)) {
      element.focus();
      openWriter(element); // the help stays on screen until the user is done
      return;
    }
    if (element.matches("video")) {
      element.paused ? element.play() : element.pause();
      return;
    }
    element.focus({ preventScroll: true });
    element.click();
  }

  function blockMoney() {
    openCard("stop", t("hfMoneyTitle"), t("hfMoneyText"), [["no", t("hfOk"), closeCard]]);
    speak(t("hfMoneyTitle"));
  }

  function ask(element, name) {
    openCard("", t("hfAskTitle", { name: name || t("hfThisButton") }), t("hfAskText"), [
      ["yes", t("hfYes"), () => {
        closeCard();
        doClick(element);
      }],
      ["no", t("hfNo"), closeCard]
    ]);
    confirmBox.element = element;
  }

  function openCard(kind, title, text, buttons, list, wait = 30000) {
    const card = $(".card");
    card.className = "card " + kind;
    card.innerHTML = "<h2></h2><p></p>" + (list ? "<ul></ul>" : "") + '<div class="row"></div>';
    card.querySelector("h2").textContent = title;
    card.querySelector("p").textContent = text;
    if (list) {
      for (const line of list) {
        const item = document.createElement("li");
        item.textContent = line;
        card.querySelector("ul").appendChild(item);
      }
    }
    for (const [cls, label, action] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = cls;
      button.textContent = label;
      button.addEventListener("click", action);
      card.querySelector(".row").appendChild(button);
    }
    card.setAttribute("aria-label", title);
    card.hidden = false;
    stopDwell();
    clearTimeout(confirmBox && confirmBox.timer);
    confirmBox = { element: null, timer: setTimeout(closeCard, wait) };
    coolUntil = Date.now() + COOLDOWN; // the pointer is probably on the old button: do not press YES by accident
  }

  function closeCard() {
    if (confirmBox) {
      clearTimeout(confirmBox.timer);
    }
    if (writer) {
      writer = null;
      chrome.runtime.sendMessage({ type: "hfWriting", on: false }).catch(() => {});
    }
    confirmBox = null;
    if (shadow) {
      $(".card").hidden = true;
    }
  }

  // ---------- Actions ----------

  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The box that really scrolls here (Instagram and YouTube Shorts scroll a box, not the page).
  function scroller() {
    let element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    while (element && element !== document.body && element !== document.documentElement) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 20) {
        return element;
      }
      element = element.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scroll(direction, whole) {
    const box = scroller();
    const height = box === document.scrollingElement ? window.innerHeight : box.clientHeight;
    box.scrollBy({ top: direction * height * (whole ? 1 : 0.8), behavior: reduce() ? "auto" : "smooth" });
  }

  function bigVideo() {
    let best = null;
    let bestArea = 0;
    for (const video of document.querySelectorAll("video")) {
      const r = video.getBoundingClientRect();
      const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (w > 0 && h > 0 && w * h > bestArea) {
        best = video;
        bestArea = w * h;
      }
    }
    return best;
  }

  function playPause() {
    const video = bigVideo();
    if (!video) {
      say(t("hfNoVideo"));
      return;
    }
    if (video.paused) {
      video.play().catch(() => say(t("hfNoVideo")));
    } else {
      video.pause();
    }
  }

  function nextVideo(direction) {
    const page = location.hostname + location.pathname;
    // A normal YouTube video: its own Next button.
    const ytNext = direction > 0 && document.querySelector(".ytp-next-button");
    if (ytNext && /youtube\.com\/watch/.test(page)) {
      ytNext.click();
      return;
    }
    // Shorts, Reels, TikTok: one video per screen. Scroll one whole screen.
    if (/\/shorts\/|\/reels?\b|tiktok\.com/.test(page) || bigVideo()) {
      scroll(direction, true);
      return;
    }
    const control = find(direction > 0 ? "next" : "previous");
    if (control) {
      press(control.element);
    } else {
      scroll(direction, true);
    }
  }

  function goBack() {
    history.back();
  }

  function find(words) {
    return Ease.showMeHow && Ease.showMeHow.findControl ? Ease.showMeHow.findControl(words) : null;
  }

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) {
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 900));
    utterance.lang = (settings && settings.language) || document.documentElement.lang || "en";
    speechSynthesis.speak(utterance);
  }

  function readHere() {
    const selected = String(getSelection() || "").trim();
    if (selected) {
      speak(selected);
      return;
    }
    const x = point ? point.x : window.innerWidth / 2;
    const y = point ? point.y : window.innerHeight / 3;
    let element = document.elementFromPoint(x, y);
    if (element === host) {
      element = null;
    }
    const block = element && element.closest("p,li,h1,h2,h3,h4,blockquote,figcaption,article,[role=article],td");
    const text = (block || document.querySelector("main h1, h1") || document.body).innerText;
    speak(String(text || "").trim());
  }

  async function textSize(step) {
    const steps = Ease.TEXT_SIZE_STEPS || [100, 125, 150, 175, 200];
    let index = steps.indexOf(Number(settings.textSize));
    index = Math.min(steps.length - 1, Math.max(0, (index < 0 ? 0 : index) + step));
    await Ease.storage.saveMySettings({ textSize: steps[index] });
    say(t("hfTextSize", { n: steps[index] }));
  }

  function isSearch(form) {
    return Boolean(form && form.querySelector('input[type="search"],[role="searchbox"],input[name="q"],input[name="search_query"],input[name="search"]'));
  }

  function setValue(input, text) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function typeText(text) {
    const field = document.activeElement;
    if (!field || !field.matches("input,textarea,[contenteditable=true]")) {
      say(t("hfNoField"));
      return;
    }
    if (field.type === "password") {
      noPassword();
      return;
    }
    if (isCardField(field)) {
      blockMoney();
      return;
    }
    if (field.isContentEditable) {
      document.execCommand("insertText", false, text);
    } else {
      setValue(field, (field.value ? field.value + " " : "") + text);
    }
  }

  const SEARCH_BOX = 'input[type="search"],[role="searchbox"],input[name="q"],input[name="search_query"],input[name="search"],input[aria-label*="earch" i],input[placeholder*="earch" i]';

  function search(text) {
    const box = document.querySelector(SEARCH_BOX);
    if (!box) {
      say(t("hfNoSearch"));
      return;
    }
    box.focus();
    setValue(box, text);
    const form = box.form;
    if (form && form.requestSubmit) {
      form.requestSubmit();
    } else {
      for (const type of ["keydown", "keypress", "keyup"]) {
        box.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }
    }
  }

  // "show numbers": a number on every button and link on screen. Then "click 5" (or just "5").
  function showNumbers() {
    hideNumbers();
    const layer = $(".numbers");
    const seen = new Set();
    for (const element of document.querySelectorAll(CLICKABLE)) {
      if (numbers.length >= 99 || seen.has(element)) {
        continue;
      }
      const r = element.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
        continue;
      }
      const top = document.elementFromPoint(Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2)));
      if (top && top !== element && !element.contains(top) && !top.contains(element)) {
        continue; // covered
      }
      seen.add(element);
      numbers.push(element);
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = String(numbers.length);
      badge.style.left = Math.max(0, r.left - 6) + "px";
      badge.style.top = Math.max(0, r.top - 10) + "px";
      layer.appendChild(badge);
    }
    say(t("hfNumbersOn"), 6000);
  }

  function hideNumbers() {
    numbers = [];
    if (shadow) {
      $(".numbers").innerHTML = "";
    }
  }

  // "Tabs" button or "tabs": big buttons for the open tabs, and for a few websites.
  async function showTabs() {
    let data = null;
    try {
      data = await chrome.runtime.sendMessage({ type: "hfTabs", action: "list" });
    } catch (error) {
      data = null;
    }
    if (!data || !data.tabs) {
      say(t("hfNoTabs"));
      return;
    }
    openCard("tabs", t("hfTabsTitle"), t("hfTabsText"), [["no", t("hfClose"), closeCard]]);
    const card = $(".card");
    const row = card.querySelector(".row");
    const section = (title, items) => {
      const heading = document.createElement("h3");
      heading.textContent = title;
      const grid = document.createElement("div");
      grid.className = "grid";
      for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        if (item.now) {
          button.className = "now";
          button.setAttribute("aria-current", "page");
        }
        const name = document.createElement("b");
        name.textContent = item.title;
        const where = document.createElement("span");
        where.textContent = item.sub;
        button.append(name, where);
        button.addEventListener("click", () => {
          closeCard();
          chrome.runtime.sendMessage({ type: "hfTabs", ...item.message }).catch(() => {});
        });
        grid.appendChild(button);
      }
      card.insertBefore(heading, row);
      card.insertBefore(grid, row);
    };
    section(t("hfOpenTabs"), data.tabs.map((tab) => ({ title: tab.title || tab.site, sub: tab.active ? t("hfThisTab") : tab.site, now: tab.active, message: { action: "switch", tabId: tab.id } })));
    section(t("hfOpenSite"), data.sites.map((site) => ({ title: site.name, sub: new URL(site.url).hostname.replace(/^www\./, ""), message: { action: "open", url: site.url } })));
  }

  // ---------- Write (voice keyboard) ----------
  // "write" or the big "Type" button: a big box shows the words the user says.
  // Then: search the web, go to the website, search this site, or put the words in the box on the page.
  // It never presses Send or Enter on its own, except to search.

  function writeField() {
    const active = writer && writer.field;
    if (active && active.isConnected && isTextField(active) && !isCardField(active) && active.type !== "password") {
      return active;
    }
    return null;
  }

  function looksLikeSite(text) {
    const host = text.toLowerCase().replace(/\s+dot\s+/g, ".").replace(/\s+/g, "").replace(/\.$/, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host);
  }

  // Spell mode: letters, numbers and signs are joined with no spaces (usernames, emails, codes).
  const SPELL = {
    a: "a", ay: "a", b: "b", be: "b", bee: "b", c: "c", see: "c", sea: "c", cee: "c", d: "d", dee: "d", e: "e", ee: "e",
    f: "f", ef: "f", eff: "f", g: "g", gee: "g", h: "h", aitch: "h", age: "h", i: "i", eye: "i", j: "j", jay: "j", k: "k", kay: "k",
    l: "l", el: "l", ell: "l", m: "m", em: "m", n: "n", en: "n", o: "o", oh: "o", p: "p", pee: "p", pea: "p", q: "q", queue: "q",
    cue: "q", r: "r", are: "r", ar: "r", s: "s", es: "s", ess: "s", t: "t", tee: "t", tea: "t", u: "u", you: "u", v: "v", vee: "v",
    w: "w", x: "x", ex: "x", y: "y", why: "y", z: "z", zed: "z", zee: "z",
    alpha: "a", alfa: "a", bravo: "b", charlie: "c", delta: "d", echo: "e", foxtrot: "f", golf: "g", hotel: "h", india: "i",
    juliet: "j", juliett: "j", kilo: "k", lima: "l", mike: "m", november: "n", oscar: "o", papa: "p", quebec: "q", romeo: "r",
    sierra: "s", tango: "t", uniform: "u", victor: "v", whiskey: "w", whisky: "w", xray: "x", yankee: "y", zulu: "z",
    zero: "0", one: "1", two: "2", to: "2", too: "2", three: "3", four: "4", for: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    underscore: "_", dot: ".", period: ".", point: ".", at: "@", dash: "-", hyphen: "-", minus: "-", plus: "+", slash: "/",
    space: " ", hash: "#", hashtag: "#", exclamation: "!", star: "*"
  };

  // Things people say in email addresses, and what speech engines often hear instead.
  // Applied before the letters, in this order.
  const SPELL_PHRASES = [
    [/\bat the rate( of)?\b/g, " @ "], // Indian English
    [/\bat (sign|symbol|mark)\b/g, " @ "],
    [/\b(g|gee|ji|jee|g\.)[ -]?(mail|male)\b/g, " gmail "],
    [/\bg-?mail\b/g, " gmail "],
    [/\bhot[ -]?(mail|male)\b/g, " hotmail "],
    [/\bout[ -]?look\b/g, " outlook "],
    [/\bi[ -]?cloud\b/g, " icloud "],
    [/\bproton[ -]?(mail|male)\b/g, " protonmail "],
    [/\ba o l\b/g, " aol "],
    [/\byahoo\b/g, " yahoo "],
    [/\b(dot|point)\s+(com|ca|net|org|co|uk|in|edu|gov|io|me|info|us)\b/g, " .$2 "],
    [/\b(dot|point)\s+(c\s*o\s*m)\b/g, " .com "],
    [/\b(dot|point)\s+(c\s*a)\b/g, " .ca "],
    [/\bdouble[- ]?(you|u)\b/g, " w "],
    [/\bunder[ -]?score\b/g, " underscore "],
    [/\blow dash\b/g, " underscore "],
    [/\bfull stop\b/g, " dot "],
    [/\bx ray\b/g, " xray "]
  ];
  // "@gmail" means "@gmail.com" (nobody types the short one).
  const MAIL_DOMAINS = {
    gmail: "gmail.com", yahoo: "yahoo.com", hotmail: "hotmail.com", outlook: "outlook.com", icloud: "icloud.com",
    protonmail: "protonmail.com", live: "live.com", aol: "aol.com", msn: "msn.com", rogers: "rogers.com", sympatico: "sympatico.ca"
  };

  const QUICK_ADD = ["@", ".", "_", "-", ".com", ".ca", "@gmail.com", "@yahoo.com", "@outlook.com", "@hotmail.com", "@icloud.com"];

  function spellOut(raw) {
    let text = " " + String(raw || "").toLowerCase().replace(/[,!?]/g, " ") + " ";
    for (const [pattern, replacement] of SPELL_PHRASES) {
      text = text.replace(pattern, replacement);
    }
    text = text.replace(/(^|\s)([a-z])\.(?=\s|$)/g, "$1$2 "); // "d. h." -> "d h"
    const tokens = text.split(/\s+/).filter(Boolean);
    let out = "";
    let upper = false;
    let repeat = 1;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (/^(capital|uppercase|big)$/.test(token)) {
        upper = true;
        continue;
      }
      if (/^(double|triple)$/.test(token)) {
        repeat = token === "double" ? 2 : 3; // "double seven" = 77, "triple zero" = 000
        continue;
      }
      let piece = SPELL[token];
      if (piece === undefined && /^[a-z0-9@._+-]+$/.test(token)) {
        piece = token; // a whole word, number or address part: kept as it is
      }
      if (piece === undefined) {
        continue;
      }
      // "@" then "gmail" (and no ".com" said next) -> "@gmail.com"
      const next = tokens[i + 1] || "";
      // "oh" between numbers is a zero: "double oh seven" = 007, "four oh one" = 401.
      const isDigit = (word) => /^\d+$/.test(word) || /^\d$/.test(SPELL[word] || "");
      if ((token === "o" || token === "oh") && (/\d$/.test(out) || isDigit(next))) {
        piece = "0";
      }
      if (MAIL_DOMAINS[piece] && out.endsWith("@") && !next.startsWith(".")) {
        piece = MAIL_DOMAINS[piece];
      }
      if (/^@[a-z]+$/.test(piece) && MAIL_DOMAINS[piece.slice(1)] && !next.startsWith(".")) {
        piece = "@" + MAIL_DOMAINS[piece.slice(1)]; // the engine heard "@gmail" as one word
      }
      out += (upper ? piece.toUpperCase() : piece).repeat(repeat);
      upper = false;
      repeat = 1;
    }
    return out;
  }

  // Boxes for a username, email or code: spelling is easier than words there.
  function wantsSpelling(field) {
    const words = [field.name, field.id, field.type, field.getAttribute("autocomplete"), field.getAttribute("aria-label"), field.placeholder].join(" ");
    return /user|login|email|e-mail|handle|account|phone|mobile|code|otp/i.test(words);
  }

  function fieldName(field) {
    const label = (field.labels && field.labels[0] && field.labels[0].textContent) || field.getAttribute("aria-label") || field.placeholder || field.name || "";
    return label.replace(/\s+/g, " ").trim().slice(0, 40);
  }

  // Ease does not type passwords: saying one out loud is not safe.
  function noPassword() {
    openCard("stop", t("hfPasswordTitle"), t("hfPasswordText"), [["no", t("hfOk"), closeCard]], null, 60000);
  }

  function openWriter(target) {
    const focused = document.activeElement;
    const field = target || (focused && focused !== document.body && isTextField(focused) ? focused : null);
    if (field && field.type === "password") {
      noPassword();
      return;
    }
    if (field && isCardField(field)) {
      blockMoney();
      return;
    }
    const name = field ? fieldName(field) : "";
    openCard("write", field ? t("hfWriteFieldTitle", { name: name || t("hfThisBox") }) : t("hfWriteTitle"), field ? t("hfWriteFieldHint") : t("hfWriteHint"), [["no", t("hfClose"), closeCard]], null, 180000);
    // A box the user picked (held still on it) starts with what is in it, so a mistake can be fixed.
    const picked = Boolean(target);
    writer = { text: picked && !field.isContentEditable ? String(field.value || "") : "", soon: "", field, picked, spell: Boolean(field && wantsSpelling(field)) };
    const card = $(".card");
    const row = card.querySelector(".row");
    const typed = document.createElement("div");
    typed.className = "typed";
    typed.setAttribute("role", "textbox");
    typed.setAttribute("aria-readonly", "true");
    typed.setAttribute("aria-live", "polite");
    typed.setAttribute("aria-label", t("hfWriteTitle"));
    typed.dataset.empty = t("hfWriteEmpty");
    card.insertBefore(typed, row);
    const grid = document.createElement("div");
    grid.className = "grid";
    const actions = field
      ? [["here", "hfWriteHere", true], ["spell", "", false], ["delete", "", false], ["clear", "hfWriteClear", false], ["clearbox", "hfWriteClearBox", false], ["web", "hfWriteWeb", false]]
      : [["web", "hfWriteWeb", true], ["sitesearch", "hfWriteSite", false], ["go", "hfWriteGo", false], ["here", "hfWriteHere", false], ["spell", "", false], ["delete", "", false], ["clear", "hfWriteClear", false]];
    for (const [action, key, main] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.write = action;
      if (main) {
        button.className = "main";
      }
      const label = document.createElement("b");
      label.textContent = key ? t(key) : "";
      button.appendChild(label);
      button.addEventListener("click", () => writeAction(action));
      grid.appendChild(button);
    }
    card.insertBefore(grid, row);
    // Spell mode: big "quick add" buttons for the parts of an email that voices often get wrong.
    const quick = document.createElement("div");
    quick.className = "quick";
    const quickTitle = document.createElement("h3");
    quickTitle.textContent = t("hfQuickAdd");
    quick.appendChild(quickTitle);
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const chip of QUICK_ADD) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = chip;
      button.setAttribute("aria-label", t("hfQuickAddOne", { text: chip }));
      button.addEventListener("click", () => {
        if (!writer) {
          return;
        }
        // Adding "@gmail.com" when the text already has an "@": replace what came after it.
        writer.text = chip.startsWith("@") && writer.text.includes("@") ? writer.text.slice(0, writer.text.indexOf("@")) + chip : writer.text + chip;
        drawWriter();
      });
      chips.appendChild(button);
    }
    quick.appendChild(chips);
    card.insertBefore(quick, row);
    const note = document.createElement("p");
    note.className = "note";
    card.insertBefore(note, row);
    drawWriter();
    tellPanel();
  }

  // The panel listens for words (in the user's language), or for letters (in English) in Spell mode.
  function tellPanel() {
    chrome.runtime.sendMessage({ type: "hfWriting", on: Boolean(writer), spell: Boolean(writer && writer.spell) }).catch(() => {});
  }

  function drawWriter() {
    if (!writer || !shadow) {
      return;
    }
    const typed = $(".card .typed");
    typed.textContent = writer.text;
    const soon = writer.spell ? spellOut(writer.soon) : writer.soon;
    if (soon) {
      const span = document.createElement("span");
      span.className = "soon";
      span.textContent = (writer.text && !writer.spell ? " " : "") + soon;
      typed.appendChild(span);
    }
    typed.scrollTop = typed.scrollHeight;
    const has = writer.text.trim().length > 0;
    const site = Boolean(document.querySelector(SEARCH_BOX));
    const field = writeField();
    const states = {
      web: has, sitesearch: has && site, go: has && looksLikeSite(writer.text), here: has || Boolean(field && field.value),
      delete: has, clear: has, spell: true, clearbox: Boolean(field && field.value)
    };
    for (const button of shadow.querySelectorAll(".card [data-write]")) {
      const action = button.dataset.write;
      button.disabled = !states[action];
      if (action === "spell") {
        button.setAttribute("aria-pressed", String(writer.spell));
        button.firstChild.textContent = t(writer.spell ? "hfSpellOn" : "hfSpellOff");
      }
      if (action === "delete") {
        button.firstChild.textContent = t(writer.spell ? "hfWriteDeleteLetter" : "hfWriteDelete");
      }
    }
    const quick = $(".card .quick");
    if (quick) {
      quick.hidden = !writer.spell;
    }
    const note = $(".card .note");
    if (note) {
      note.textContent = writer.spell ? t("hfSpellHelp") : t("hfWriteSay");
    }
  }

  function onDictate(event) {
    if (!on || !writer || !event.detail) {
      return;
    }
    const text = String(event.detail.text || "").trim();
    if (event.detail.final) {
      const add = writer.spell ? spellOut(text) : text;
      writer.text = (writer.spell ? writer.text + add : (writer.text + " " + add).trim()).slice(0, 1000);
      writer.soon = "";
    } else {
      writer.soon = text;
    }
    clearTimeout(confirmBox && confirmBox.timer);
    if (confirmBox) {
      confirmBox.timer = setTimeout(closeCard, 180000);
    }
    drawWriter();
  }

  function onWriteAction(event) {
    if (on && writer && event.detail) {
      writeAction(event.detail.action);
    }
  }

  function writeAction(action) {
    if (!writer) {
      return;
    }
    const text = writer.text.trim();
    if (action === "delete") {
      writer.text = writer.spell ? writer.text.slice(0, -1) : writer.text.trim().split(/\s+/).slice(0, -1).join(" ");
      drawWriter();
      return;
    }
    if (action === "clear") {
      writer.text = "";
      drawWriter();
      return;
    }
    if (action === "spell" || action === "spellOn" || action === "words") {
      // The button switches Spell on and off. By voice: "spell" turns it on, "words" turns it off.
      writer.spell = action === "spell" ? !writer.spell : action === "spellOn";
      drawWriter();
      tellPanel();
      return;
    }
    if (action === "clearbox") {
      const field = writeField();
      if (field) {
        setValue(field, "");
        writer.text = "";
        drawWriter();
        say(t("hfWriteBoxEmpty"));
      }
      return;
    }
    if (action === "close") {
      closeCard();
      return;
    }
    if (/\b(\d{4}[\s-]?){3}\d{4}\b/.test(text)) {
      blockMoney(); // never type something that looks like a card number
      return;
    }
    if (action === "here") {
      const field = writeField() || [...document.querySelectorAll(SEARCH_BOX + ",input[type=text],input[type=email],input:not([type]),textarea")].find((box) => box.offsetParent && !isCardField(box));
      if (!field) {
        say(t("hfWriteNoBox"));
        return;
      }
      if (field.type === "password") {
        noPassword();
        return;
      }
      if (isCardField(field)) {
        blockMoney();
        return;
      }
      if (!text && !(field.value || field.isContentEditable)) {
        say(t("hfWriteEmptySay"));
        return;
      }
      const chosen = writer.picked && writer.field === field; // the box the user picked gets exactly the words shown
      closeCard();
      field.focus();
      if (field.isContentEditable) {
        document.execCommand("insertText", false, text);
      } else {
        setValue(field, chosen ? text : (field.value ? field.value + " " : "") + text);
      }
      say(t("hfWriteDone"), 6000);
      return;
    }
    if (!text) {
      say(t("hfWriteEmptySay"));
      return;
    }
    if (action === "web") {
      closeCard();
      chrome.runtime.sendMessage({ type: "hfTabs", action: "search", query: text }).catch(() => {});
    } else if (action === "go") {
      if (!looksLikeSite(text)) {
        say(t("hfWriteNotSite"));
        return;
      }
      closeCard();
      chrome.runtime.sendMessage({ type: "hfTabs", action: "open", words: text }).catch(() => {});
    } else if (action === "sitesearch") {
      closeCard();
      search(text);
    }
  }

  function showHelp() {
    openCard("help", t("hfHelpTitle"), t("hfHelpText"), [["no", t("hfOk"), closeCard]], [
      t("hfSayScroll"), t("hfSayVideo"), t("hfSayTabs"), t("hfSayWrite"), t("hfSayClick"), t("hfSayNumbers"), t("hfSaySearch"), t("hfSayRead"), t("hfSayRest")
    ]);
  }

  // ---------- Voice commands ----------
  // The panel sends what was heard. Commands are English words for now (see decision 11).

  function clean(text) {
    return String(text || "").toLowerCase().replace(/[.,!?¿¡"]/g, " ").replace(/\s+/g, " ").trim();
  }

  const NUMBER_WORDS = { one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

  function command(raw) {
    const text = clean(raw);
    if (!text) {
      return;
    }
    say(t("hfHeard", { text }), 2500);

    if (confirmBox) {
      if (/^(yes|yeah|yep|ok|okay|do it|sure)\b/.test(text) && confirmBox.element) {
        $(".card .yes").click();
      } else if (/^(no|nope|cancel|stop|close|ok|okay)\b/.test(text)) {
        closeCard();
      }
      return;
    }
    if (resting) {
      if (/\b(wake up|start|resume|hands free on)\b/.test(text)) {
        setRest(false);
      }
      return;
    }

    const number = text.match(/^(?:click |press |tap |number )?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|to|too|for)$/);
    if (number && numbers.length) {
      const element = numbers[(Number(number[1]) || NUMBER_WORDS[number[1]]) - 1];
      hideNumbers();
      if (element) {
        press(element);
      }
      return;
    }

    const rules = [
      [/^(rest|sleep|pause hands free|stop listening|take a break)$/, () => setRest(true)],
      [/^(help|what can i say|commands)$/, showHelp],
      [/^(show numbers|numbers|show buttons)$/, showNumbers],
      [/^(tabs|show tabs|switch tab|change tab|websites)$/, showTabs],
      [/^(write|keyboard|type|dictate|start typing|start writing|write something)$/, openWriter],
      [/^(hide numbers|clear)$/, hideNumbers],
      [/^(scroll )?(down|lower)( more)?$|^page down$/, () => scroll(1)],
      [/^(scroll )?(up|higher)( more)?$|^page up$/, () => scroll(-1)],
      [/^(go to )?(the )?top$/, () => (scroller().scrollTo({ top: 0, behavior: reduce() ? "auto" : "smooth" }))],
      [/^(go to )?(the )?bottom$/, () => { const box = scroller(); box.scrollTo({ top: box.scrollHeight, behavior: reduce() ? "auto" : "smooth" }); }],
      [/^(next|next video|skip|next reel|next one|swipe up)$/, () => nextVideo(1)],
      [/^(previous|previous video|last video|go up one|swipe down)$/, () => nextVideo(-1)],
      [/^(pause|play|stop video|stop the video|resume video|play video|pause video)$/, playPause],
      [/^(mute|unmute|sound on|sound off)$/, () => { const v = bigVideo(); if (v) { v.muted = !v.muted; } }],
      [/^(go )?back$/, goBack],
      [/^(go )?forward$/, () => history.forward()],
      [/^(read|read this|read it|read aloud)$/, readHere],
      [/^(stop reading|quiet|be quiet|silence)$/, () => speechSynthesis.cancel()],
      [/^(bigger|bigger text|zoom in|larger)$/, () => textSize(1)],
      [/^(smaller|smaller text|zoom out)$/, () => textSize(-1)],
      [/^(click|press|tap|select)( it| this| that)?$/, () => clickMarked()],
      [/^like( this| it| video)?$/, () => clickNamed("like")]
    ];
    for (const [pattern, action] of rules) {
      if (pattern.test(text)) {
        action();
        return;
      }
    }

    let match = text.match(/^(?:search|search for|find|look up) (.+)$/);
    if (match) {
      search(match[1]);
      return;
    }
    match = text.match(/^(?:type|write) (.+)$/);
    if (match) {
      typeText(match[1]);
      return;
    }
    match = text.match(/^(?:click|press|tap|open|select|go to|choose) (?:on )?(?:the )?(.+?)(?: button| link| tab)?$/);
    if (match) {
      clickNamed(match[1]);
      return;
    }
    say(t("hfNotUnderstood"), 4000);
  }

  function clickMarked() {
    const element = point && targetAt(point.x, point.y);
    if (element) {
      press(element);
    }
  }

  function clickNamed(words) {
    // Asking for a money action by voice is blocked too, even if we can not find the button.
    if (MONEY.test(words)) {
      blockMoney();
      return;
    }
    const control = find(words);
    if (!control) {
      say(t("hfNotFound", { name: words }), 4000);
      return;
    }
    control.element.scrollIntoView({ block: "center", behavior: "auto" });
    markTarget(control.element);
    press(control.element);
  }

  // ---------- Events ----------

  function onPointer(event) {
    if (!on || !event.detail) {
      return;
    }
    headUntil = Date.now() + 1000;
    if (!connected) {
      connected = true;
      say(t("hfConnected"));
    }
    const x = Math.max(0, Math.min(1, Number(event.detail.x))) * window.innerWidth;
    const y = Math.max(0, Math.min(1, Number(event.detail.y))) * window.innerHeight;
    movePointer(x, y, true);
  }

  function onMouse(event) {
    if (!on || Date.now() < headUntil || !event.isTrusted) {
      return;
    }
    movePointer(event.clientX, event.clientY, false);
  }

  // A face gesture (open mouth / raised eyebrows) clicks what the pointer is on,
  // or the nearest button within a small distance (a click should not miss by a few pixels).
  function onGesture() {
    if (!on || !point) {
      return;
    }
    $(".fill").setAttribute("stroke-dashoffset", "150.8");
    const element = nearTarget(point.x, point.y);
    if (element) {
      press(element);
    } else {
      say(t("hfNothingHere"), 2500);
    }
  }

  function nearTarget(x, y) {
    const tries = [[0, 0], [0, -18], [0, 18], [-18, 0], [18, 0], [-18, -18], [18, -18], [-18, 18], [18, 18], [0, -36], [0, 36], [-36, 0], [36, 0]];
    for (const [dx, dy] of tries) {
      const element = targetAt(Math.max(0, x + dx), Math.max(0, y + dy));
      if (element) {
        return element;
      }
    }
    return null;
  }

  // The panel tells how long the mouth (or eyebrows) has been held: the ring fills, so the user sees the click coming.
  function onGestureProgress(event) {
    if (!on || !shadow || !event.detail) {
      return;
    }
    const part = Math.max(0, Math.min(1, Number(event.detail.part) || 0));
    stopDwell(); // a gesture, not a hold
    $(".fill").setAttribute("stroke-dashoffset", String(150.8 * (1 - part)));
  }

  function onCommand(event) {
    if (on && event.detail) {
      command(event.detail.text);
    }
  }

  function onStatus(event) {
    if (on && event.detail && event.detail.text) {
      say(String(event.detail.text), 3000);
    }
  }

  function start() {
    if (on) {
      drawDock();
      return;
    }
    on = true;
    build();
    document.addEventListener("ease:hfPointer", onPointer);
    document.addEventListener("ease:hfClick", onGesture);
    document.addEventListener("ease:hfGesture", onGestureProgress);
    document.addEventListener("ease:hfDictate", onDictate);
    document.addEventListener("ease:hfWriteAction", onWriteAction);
    document.addEventListener("ease:hfCommand", onCommand);
    document.addEventListener("ease:hfStatus", onStatus);
    document.addEventListener("mousemove", onMouse, true);
    window.addEventListener("scroll", hideNumbers, true);
  }

  function stop() {
    if (!on) {
      return;
    }
    on = false;
    document.removeEventListener("ease:hfPointer", onPointer);
    document.removeEventListener("ease:hfClick", onGesture);
    document.removeEventListener("ease:hfGesture", onGestureProgress);
    document.removeEventListener("ease:hfDictate", onDictate);
    document.removeEventListener("ease:hfWriteAction", onWriteAction);
    document.removeEventListener("ease:hfCommand", onCommand);
    document.removeEventListener("ease:hfStatus", onStatus);
    document.removeEventListener("mousemove", onMouse, true);
    window.removeEventListener("scroll", hideNumbers, true);
    stopDwell();
    closeCard();
    hideNumbers();
    cancelAnimationFrame(edge.frame);
    edge = { dir: 0, since: 0, frame: 0 };
    connected = false;
    if (host) {
      host.remove();
    }
    host = null;
    shadow = null;
    resting = false;
    point = null;
    stick = null;
    carry = { x: 0, y: 0 };
  }

  // The panel asks "is Ease on this page?" (pages opened before Ease was loaded have no Ease).
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "hfPing") {
      sendResponse({ ok: true, on });
    }
  });

  Ease.engine.register({
    id: "hands-free",
    observe: false,
    apply(newSettings) {
      settings = newSettings;
      if (settings.handsFree) {
        start();
      } else {
        stop();
      }
    },
    remove() {
      stop();
    }
  });

  // For tests.
  Ease.handsFree = { command, spellOut, isMoney: (name) => MONEY.test(name), isRisky: (name) => RISKY.test(name) };
})();
