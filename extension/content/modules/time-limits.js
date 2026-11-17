// Time limits.
// For ADHD and focus. The user sets a daily limit for websites that pull them in
// (for example Instagram: 1 hour). Settings: My Settings > Time limits.
//
//   - Time counts only while the user really uses the site: the tab is in front,
//     the window has focus, and the user did something in the last 2 minutes
//     (or a video is playing).
//   - 10 minutes before the end, a small chip shows the minutes left.
//   - At 5 minutes, a soft note: "Good time to finish what you are doing."
//   - When time is up, a calm cover hides the page. The user can close the tab,
//     go somewhere else, or (if turned on) take "5 more minutes" once a day,
//     after a 10-second pause. To change the limit, they go to My Settings.
//   - Kind words only. No shame, no streaks.
//
// Everything stays on this device.

(function () {
  const Ease = globalThis.Ease;

  const TICK = 15; // seconds between checks
  const IDLE_AFTER = 120000; // ms without activity = not using the site
  const CHIP_AT = 600; // seconds left: show the chip
  const NOTE_AT = 300; // seconds left: show the soft note
  const EXTRA = 300; // "5 more minutes"
  const PAUSE = 10; // seconds to wait before "5 more minutes" works

  let settings = null;
  let limit = null;
  let timer = null;
  let lastActivity = Date.now();
  let noteShown = false;
  let chip = null;
  let note = null;
  let cover = null;

  const t = (key, params) => Ease.i18n.t(key, params);
  const siteName = () => {
    const name = limit.site.split(".").slice(-2, -1)[0] || limit.site;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  function onActivity() {
    lastActivity = Date.now();
  }

  function mediaPlaying() {
    return [...document.querySelectorAll("video, audio")].some((m) => !m.paused && !m.muted && m.readyState > 2);
  }

  function inUse() {
    return document.visibilityState === "visible" && document.hasFocus() && (Date.now() - lastActivity < IDLE_AFTER || mediaPlaying());
  }

  function secondsLeft(usage) {
    return limit.minutes * 60 + (usage.extra[limit.site] || 0) - (usage.used[limit.site] || 0);
  }

  async function tick() {
    if (!limit || cover) {
      return;
    }
    const usage = inUse() ? await Ease.storage.addTimeUsage(limit.site, TICK) : await Ease.storage.loadTimeUsage();
    update(usage);
  }

  function update(usage) {
    const left = secondsLeft(usage);
    if (left <= 0) {
      showCover(usage);
      return;
    }
    hideCover();
    if (left <= CHIP_AT) {
      showChip(Math.ceil(left / 60));
    } else {
      hideChip();
    }
    if (left <= NOTE_AT && !noteShown) {
      noteShown = true;
      showNote();
    }
  }

  // ---------- Small boxes on the page (Shadow DOM, so the website can not change them) ----------

  const BASE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    .chip { display: flex; gap: 6px; align-items: center; padding: 7px 14px; border-radius: 999px;
            background: #FBFBF9; color: #2A2F36; border: 1px solid #DDDDD6; font: 700 14px/1.2 system-ui, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .note { padding: 12px 16px; border-radius: 14px; background: #FBFBF9; color: #2A2F36; border: 1px solid #DDDDD6;
            box-shadow: 0 8px 22px rgba(0,0,0,0.18); font: 400 15px/1.45 system-ui, sans-serif; max-width: 92vw; }
    .note b { display: block; }
    .wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
            background: rgba(241,241,236,0.96); backdrop-filter: blur(8px); padding: 16px; }
    .box { width: min(440px, 100%); background: #FBFBF9; color: #2A2F36; border: 1px solid #DDDDD6; border-radius: 18px;
           padding: 26px 22px; text-align: center; box-shadow: 0 10px 28px rgba(0,0,0,0.12); }
    .icon { font-size: 40px; line-height: 1; }
    h2 { font: 700 22px/1.25 system-ui, sans-serif; margin: 10px 0 6px; }
    p { font: 400 15px/1.45 system-ui, sans-serif; color: #555B66; margin: 0; }
    .buttons { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
    button { height: 46px; border-radius: 12px; font: 700 15px/1 system-ui, sans-serif; cursor: pointer;
             border: 1px solid #DDDDD6; background: #FBFBF9; color: #2A2F36; }
    button.main { background: #4A5A8C; color: #FBFBF9; border: none; }
    button.link { height: auto; border: none; background: none; color: #34406A; text-decoration: underline; padding: 10px 4px 2px; font-weight: 400; }
    button:disabled { cursor: default; text-decoration: none; color: #555B66; }
    button:focus-visible { outline: 3px solid #34406A; outline-offset: 2px; }
    .pin { display: flex; gap: 8px; justify-content: center; margin-top: 10px; }
    .pin input { width: 120px; height: 44px; border: 1px solid #A9AEB8; border-radius: 10px; text-align: center; font: 700 18px/1 system-ui; letter-spacing: 6px; }
    .error { color: #8A2B10; margin-top: 8px; min-height: 1.2em; }
    .small { font-size: 13px; margin-top: 10px; }`;

  function makeHost(id, css) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;z-index:2147483647;" + css;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BASE;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
    return { host, shadow };
  }

  function showChip(minutes) {
    if (!chip) {
      const made = makeHost("ease-time-chip", "top:12px;right:12px;");
      const box = document.createElement("div");
      box.className = "chip";
      box.setAttribute("role", "status");
      made.shadow.appendChild(box);
      chip = made.host;
    }
    chip.shadowRoot.querySelector(".chip").textContent = "⏱ " + t("timeLeftChip", { n: minutes });
  }

  function hideChip() {
    if (chip) {
      chip.remove();
      chip = null;
    }
  }

  function showNote() {
    const made = makeHost("ease-time-note", "bottom:16px;left:50%;transform:translateX(-50%);");
    const box = document.createElement("div");
    box.className = "note";
    box.setAttribute("role", "status");
    const title = document.createElement("b");
    title.textContent = t("timeNoteTitle", { site: siteName() });
    const text = document.createElement("span");
    text.textContent = t("timeNoteText");
    box.append(title, text);
    made.shadow.appendChild(box);
    note = made.host;
    setTimeout(() => {
      if (note) {
        note.remove();
        note = null;
      }
    }, 10000);
  }

  // ---------- Time is up ----------

  function button(text, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className || "";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function showCover(usage) {
    if (cover) {
      return;
    }
    hideChip();
    for (const media of document.querySelectorAll("video, audio")) {
      media.pause(); // stop the video that pulls the user back in
    }
    Ease.engine.setStyle("time-limits", "html, body { overflow: hidden !important; }");

    const made = makeHost("ease-time-cover", "inset:0;");
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "title");

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "🌿";
    const title = document.createElement("h2");
    title.id = "title";
    title.textContent = t("timeDoneTitle", { site: siteName() });
    const text = document.createElement("p");
    text.textContent = t("timeDoneText");

    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const close = button(t("scamCloseTab"), "main", () => chrome.runtime.sendMessage({ type: "closeTab" }));
    const elsewhere = button(t("timeGoElsewhere"), "", () => chrome.runtime.sendMessage({ type: "goNewTab" }));
    buttons.append(close, elsewhere);

    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");

    // "5 more minutes": once a day, after a 10-second pause (and the PIN, if the caregiver asked for it).
    const usedExtra = (usage.extra[limit.site] || 0) > 0;
    if (settings.timeLimitExtra && !usedExtra) {
      const more = button(t("timeMore", { n: PAUSE }), "link", () => startPause(more, box, error));
      buttons.appendChild(more);
    }
    const small = document.createElement("p");
    small.className = "small";
    small.textContent = t("timeChangeInSettings");

    box.append(icon, title, text, buttons, error, small);
    wrap.appendChild(box);
    made.shadow.appendChild(wrap);
    cover = made.host;
    close.focus();
  }

  function startPause(more, box, error) {
    let left = PAUSE;
    more.disabled = true;
    more.textContent = t("timeWait", { n: left });
    const countdown = setInterval(() => {
      left -= 1;
      if (left > 0) {
        more.textContent = t("timeWait", { n: left });
        return;
      }
      clearInterval(countdown);
      if (settings.timeLimitPin && settings.lockHash) {
        askPin(more, box, error);
      } else {
        grantExtra();
      }
    }, 1000);
  }

  function askPin(more, box, error) {
    more.remove();
    const row = document.createElement("form");
    row.className = "pin";
    const input = document.createElement("input");
    input.type = "password";
    input.inputMode = "numeric";
    input.maxLength = 4;
    input.setAttribute("aria-label", t("lockPin"));
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "main";
    ok.style.padding = "0 16px";
    ok.textContent = t("lockUnlock");
    row.append(input, ok);
    row.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (await Ease.lock.check(input.value, settings.lockHash)) {
        grantExtra();
      } else {
        error.textContent = t("lockWrong");
        input.value = "";
        input.focus();
      }
    });
    box.insertBefore(row, error);
    input.focus();
  }

  async function grantExtra() {
    const usage = await Ease.storage.addTimeUsage(limit.site, EXTRA, "extra");
    noteShown = false;
    hideCover();
    update(usage);
  }

  function hideCover() {
    if (cover) {
      cover.remove();
      cover = null;
      Ease.engine.removeStyle("time-limits");
    }
  }

  // ---------- Start and stop ----------

  function stopAll() {
    clearInterval(timer);
    timer = null;
    limit = null;
    hideChip();
    hideCover();
    if (note) {
      note.remove();
      note = null;
    }
    for (const type of ["pointerdown", "keydown", "scroll", "mousemove", "wheel", "touchstart"]) {
      document.removeEventListener(type, onActivity, true);
    }
  }

  Ease.engine.register({
    id: "time-limits",
    observe: false,

    async apply(newSettings) {
      settings = newSettings;
      const found = Ease.timeRules.limitFor(location.hostname, settings.timeLimits);
      if (!found) {
        this.remove();
        return;
      }
      const changed = !limit || limit.site !== found.site || limit.minutes !== found.minutes;
      limit = found;
      if (!timer) {
        for (const type of ["pointerdown", "keydown", "scroll", "mousemove", "wheel", "touchstart"]) {
          document.addEventListener(type, onActivity, { capture: true, passive: true });
        }
        timer = setInterval(tick, TICK * 1000);
      }
      if (changed) {
        hideCover(); // the limit changed in settings: check again
      }
      update(await Ease.storage.loadTimeUsage());
    },

    remove() {
      stopAll();
    }
  });

  // For tests.
  Ease.timeLimits = { secondsLeft: (usage) => (limit ? secondsLeft(usage) : null) };
})();
