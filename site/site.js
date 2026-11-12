// The Ease website: "Calm this site", and the live demo panel.
// The demo website (demo/sample.html) runs the real extension code.
// This file only changes its settings, like the extension's popup does.
(function () {
  "use strict";

  // The product name is not final. Change it here, and every [data-name] on the page follows.
  const NAME = "Ease";
  document.querySelectorAll("[data-name]").forEach((el) => (el.textContent = NAME));

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  // ---------- Calm this site ----------
  // On when the visitor turns it on, or when their computer asks for less motion.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function savedCalm() {
    try {
      return localStorage.getItem("calmSite");
    } catch (error) {
      return null;
    }
  }
  function setCalm(on, remember) {
    root.classList.toggle("calm", on);
    $("calm-site").setAttribute("aria-pressed", String(on));
    $("no-motion").setAttribute("aria-pressed", String(on));
    if (remember) {
      try {
        localStorage.setItem("calmSite", on ? "on" : "off");
      } catch (error) {
        // private window: just do not remember
      }
    }
    document.dispatchEvent(new Event("site:calm"));
  }
  const saved = savedCalm();
  setCalm(saved ? saved === "on" : reduce.matches, false);
  reduce.addEventListener("change", () => savedCalm() || setCalm(reduce.matches, false));
  $("calm-site").addEventListener("click", () => setCalm(!root.classList.contains("calm"), true));
  $("no-motion").addEventListener("click", () => setCalm(!root.classList.contains("calm"), true));
  // Dock: which noisy layers are off. The 3D story listens to "site:layers".
  window.easeLayersOff = new Set();
  document.querySelectorAll("#dock [data-layer]").forEach((button) => {
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (on) {
        window.easeLayersOff.add(button.dataset.layer);
      } else {
        window.easeLayersOff.delete(button.dataset.layer);
      }
      document.dispatchEvent(new Event("site:layers"));
    });
  });
  $("big-text").addEventListener("click", (event) => {
    const on = !root.classList.contains("big-text");
    root.classList.toggle("big-text", on);
    event.currentTarget.setAttribute("aria-pressed", String(on));
  });

  // ---------- Live demo ----------
  // Two frames run the real extension code:
  //   #popup-frame: the real popup     #frame: the noisy demo website
  // This page keeps the one settings store they share (like chrome.storage.local in Chrome).
  // They talk with messages, so it also works when index.html is opened straight from a file.
  const frame = $("frame");
  const popupFrame = $("popup-frame");
  const HOST = "dailyexample.news";
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const store = {
    mySettings: { onboardingDone: true, language: "en", quizNudge: false, profiles: [] },
    siteSettings: {},
    sitesOff: {}
  };
  let ready = false;

  // The message under the demo, and a copy floating at the bottom of the screen
  // (on a laptop the demo is often taller than the screen, so the message below it is out of sight).
  let floatTimer = 0;
  function toast(text) {
    $("toast").textContent = text;
    const note = $("float-note");
    note.textContent = text;
    note.hidden = !text;
    clearTimeout(floatTimer);
    floatTimer = setTimeout(() => (note.hidden = true), 9000);
  }
  function send(win, data) {
    if (win) {
      win.postMessage({ easeHub: true, ...data }, "*");
    }
  }
  function frames() {
    return [frame.contentWindow, popupFrame.contentWindow];
  }
  // Save values, and tell both frames what changed (like chrome.storage.onChanged).
  // fromPage = true: a button on this page changed it (not the popup). The popup then redraws.
  function save(values, fromPage) {
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { oldValue: clone(store[key]), newValue: clone(value) };
      store[key] = clone(value);
    }
    frames().forEach((win) => send(win, { changed: changes, fromPage: Boolean(fromPage) }));
  }
  function remove(keys) {
    const changes = {};
    for (const key of keys) {
      changes[key] = { oldValue: clone(store[key]) };
      delete store[key];
    }
    frames().forEach((win) => send(win, { changed: changes }));
  }

  // Messages from the popup to "the current tab" wait here for the demo website's answer.
  const tabAnswers = new Map();
  let nextTab = 1;

  window.addEventListener("message", (event) => {
    const data = event.data;
    const from = event.source;
    if (!data || !data.easeHub || !frames().includes(from)) {
      return;
    }
    const answer = (result) => send(from, { reply: data.id, result: clone(result) });
    switch (data.op) {
      case "get":
        answer(store);
        break;
      case "set":
        save(data.values || {});
        answer();
        break;
      case "remove":
        remove(data.keys || []);
        answer();
        break;
      case "clear":
        remove(Object.keys(store));
        answer();
        break;
      case "tab": {
        const id = nextTab++;
        tabAnswers.set(id, answer);
        send(frame.contentWindow, { cmd: "message", message: data.message, id });
        break;
      }
      case "tabReply": {
        const reply = tabAnswers.get(data.to);
        tabAnswers.delete(data.to);
        if (reply) {
          reply(data.result);
        }
        break;
      }
      case "toast":
        toast(data.text);
        break;
      case "aiExample":
        $("explain-note").textContent = "Your browser has no built-in AI here, so this is a recorded example. In Chrome with the AI set up, the answer is made on your computer.";
        break;
      case "ready":
        if (from === frame.contentWindow) {
          ready = true;
          $("demo").classList.add("demo-ready");
        }
        break;
    }
  });

  // Start the frames only now, so no message is sent before this page listens.
  popupFrame.src = popupFrame.dataset.src;
  frame.src = frame.dataset.src;

  // Before / after: the same "Turn off on this site" switch the popup has.
  $("before-after").addEventListener("click", (event) => {
    const off = !(store.sitesOff && store.sitesOff[HOST]);
    save({ sitesOff: { ...(store.sitesOff || {}), [HOST]: off } }, true);
    event.currentTarget.setAttribute("aria-pressed", String(off));
    event.currentTarget.firstChild.textContent = off ? "Show it with " : "Show the website without ";
    toast(off ? "This is the website without " + NAME + "." : NAME + " is on again.");
  });

  // ---------- Helpers ----------
  function showFrame() {
    frame.scrollIntoView({ block: "center", behavior: root.classList.contains("calm") ? "auto" : "smooth" });
  }
  function notReady() {
    if (!ready) {
      toast("The demo website is still loading. Try again in a moment.");
      $("hf-status").textContent = "The demo is still loading. Try again in a moment.";
    }
    return !ready;
  }
  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  $("try-explain").addEventListener("click", () => {
    if (notReady()) {
      return;
    }
    if (store.mySettings.explainSimply === false) {
      save({ mySettings: { ...store.mySettings, explainSimply: true } }, true);
    }
    showFrame();
    send(frame.contentWindow, { cmd: "explain" });
  });
  $("smh-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const goal = $("smh-goal").value.trim();
    if (notReady() || !goal) {
      return;
    }
    showFrame();
    send(frame.contentWindow, { cmd: "message", message: { type: "showMeHow", goal } });
  });
  $("try-time").addEventListener("click", () => {
    if (notReady()) {
      return;
    }
    save({ timeUsage: { date: today(), used: { [HOST]: 15 * 60 }, extra: {} } }, true);
    save({ mySettings: { ...store.mySettings, timeLimits: [HOST + "|15"] } }, true);
    showFrame();
    toast("The demo website now has a 15-minute daily limit, and the time is used up. You can see it in My Settings > Calm and focus.");
  });
  // "Watch it work": turn Hands-free on, show the demo website, and play the tour inside it (demo/tour.js).
  $("hf-tour").addEventListener("click", () => {
    if (notReady()) {
      return;
    }
    if (!store.mySettings.handsFree) {
      save({ mySettings: { ...store.mySettings, handsFree: true, handsFreeHold: "1.5" } }, true);
      $("try-hands").setAttribute("aria-pressed", "true");
    }
    $("hf-status").textContent = "Playing the tour in the demo above. Watch the pointer and the message at the bottom of the screen.";
    showFrame();
    setTimeout(() => send(frame.contentWindow, { cmd: "tour" }), 900);
  });
  $("try-hands").addEventListener("click", (event) => {
    if (notReady()) {
      return;
    }
    const on = !store.mySettings.handsFree;
    save({ mySettings: { ...store.mySettings, handsFree: on, handsFreeHold: "1.5" } }, true);
    event.currentTarget.setAttribute("aria-pressed", String(on));
    showFrame();
    toast(on ? "Hands-free is on. Hold your mouse still on a link in the demo website. The big buttons are on its right side." : "Hands-free is off.");
    $("hf-status").textContent = on ? "Hands-free is on in the demo above: hold your mouse still on a button, or use the big buttons on its right side." : "Hands-free is off in the demo.";
  });
  $("reset-time").addEventListener("click", () => {
    if (notReady()) {
      return;
    }
    save({ timeUsage: { date: today(), used: {}, extra: {} } }, true);
    save({ mySettings: { ...store.mySettings, timeLimits: [] } }, true);
    toast("Time limit removed.");
  });
})();
