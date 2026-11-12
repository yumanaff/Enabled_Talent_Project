// A small stand-in for Chrome's extension API.
// It lets the REAL extension code run on this website, with nothing to install:
//   - demo/sample.html  runs the content scripts (the part that changes websites)
//   - demo/ext/popup/popup.html  is the real popup
// Both frames share one settings store, kept by the page around them (site.js).
// They talk with messages, so it also works when index.html is opened straight from a file.
// Nothing is saved after the page closes, and nothing is sent anywhere.
(function () {
  const here = document.currentScript ? document.currentScript.src : location.href;
  const extBase = new URL("ext/", here).href; // this file is demo/shim.js
  const hasParent = window.parent !== window;
  const isPopup = /\/popup\/popup\.html$/.test(location.pathname);
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  // The demo website always has this address (pages opened from a file have none).
  window.EASE_DEMO_HOST = "dailyexample.news";
  const TAB = { id: 1, url: "https://dailyexample.news/benefit-changes-2027", title: "Benefit changes for 2027 - The Daily Example" };

  // "*": a page opened from a file has no origin. We only send settings and demo events.
  const toParent = (data) => hasParent && window.parent.postMessage({ easeHub: true, ...data }, "*");
  const toast = (text) => toParent({ op: "toast", text });

  // The extension loads its text with fetch(), which does not work from a file. Answer from locales.js.
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, options) {
    const match = String(url).match(/locales\/([\w-]+)\.json$/);
    const text = match && window.EASE_DEMO_LOCALES && window.EASE_DEMO_LOCALES[match[1]];
    if (text) {
      return Promise.resolve(new Response(JSON.stringify(text), { headers: { "content-type": "application/json" } }));
    }
    return realFetch ? realFetch(url, options) : Promise.reject(new Error("no fetch"));
  };

  // ----- Requests to the page (with an answer) -----
  let nextId = 1;
  const waiting = new Map();
  function ask(data) {
    if (!hasParent) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      toParent({ ...data, id });
    });
  }

  // ----- Storage -----
  const changeListeners = [];
  const messageListeners = [];
  function pick(data, keys) {
    if (keys == null) {
      return clone(data);
    }
    const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const result = {};
    for (const key of list) {
      if (data[key] !== undefined) {
        result[key] = clone(data[key]);
      } else if (keys && typeof keys === "object" && !Array.isArray(keys)) {
        result[key] = keys[key];
      }
    }
    return result;
  }
  // Kept in this frame only (session, sync, or everything when the page is opened alone).
  function memoryArea(name) {
    const data = {};
    const fire = (changes) => setTimeout(() => changeListeners.forEach((listener) => listener(changes, name)), 0);
    return {
      get: async (keys) => pick(data, keys),
      async set(values) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: clone(data[key]), newValue: clone(value) };
          data[key] = clone(value);
        }
        fire(changes);
      },
      async remove(keys) {
        const changes = {};
        for (const key of [].concat(keys)) {
          changes[key] = { oldValue: clone(data[key]) };
          delete data[key];
        }
        fire(changes);
      },
      async clear() {
        Object.keys(data).forEach((key) => delete data[key]);
      }
    };
  }
  // Shared by the popup and the demo website: kept by the page.
  const sharedLocal = {
    get: async (keys) => pick((await ask({ op: "get" })) || {}, keys),
    set: (values) => ask({ op: "set", values: clone(values) }),
    remove: (keys) => ask({ op: "remove", keys: [].concat(keys) }),
    clear: () => ask({ op: "clear" })
  };

  // ----- Messages from the page -----
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || !data.easeHub) {
      return;
    }
    if (data.reply) {
      const resolve = waiting.get(data.reply);
      waiting.delete(data.reply);
      if (resolve) {
        resolve(data.result);
      }
    } else if (data.changed) {
      changeListeners.forEach((listener) => listener(data.changed, "local"));
      // In Chrome only the popup changes settings while it is open. In the demo, buttons on the page can too.
      if (data.fromPage && isPopup) {
        clearTimeout(window.__demoReload);
        window.__demoReload = setTimeout(() => location.reload(), 150);
      }
    } else if (data.cmd === "message") {
      deliver(data.message).then((result) => toParent({ op: "tabReply", to: data.id, result: clone(result) }));
    } else if (data.cmd === "explain") {
      const hard = document.getElementById("hard");
      if (!hard) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(hard);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      hard.scrollIntoView({ block: "center" });
      document.dispatchEvent(new CustomEvent("ease:explainSelection", { detail: { text: hard.textContent } }));
    }
  });

  // A message for the "tab" (the demo website), like chrome.tabs.sendMessage. Returns the first answer.
  function deliver(message) {
    return new Promise((resolve) => {
      let done = false;
      const respond = (result) => {
        if (!done) {
          done = true;
          resolve(result);
        }
      };
      let later = false;
      for (const listener of messageListeners) {
        if (listener(message, { tab: TAB }, respond) === true) {
          later = true;
        }
      }
      setTimeout(() => respond(undefined), later ? 4000 : 0);
    });
  }

  // ----- Recorded "Explain simply" answers, for browsers without Chrome's built-in AI -----
  function exampleFor(task) {
    const prompt = task.prompt || "";
    if (!/eligibility|adjusted net family income/i.test(prompt)) {
      return null;
    }
    const max = Number((prompt.match(/at most (\d+) points/) || [])[1] || 3);
    let points = [
      "You can get this money if your family earns less than a set amount.",
      "They look at the tax return of you and your partner.",
      "File your taxes by April 30, or the payments can stop."
    ];
    if (/grade 4/.test(prompt)) {
      points = ["You get money if your family earns less.", "They check your taxes.", "File by April 30, or the money stops."];
    }
    if (max <= 2) {
      points = ["File your taxes by April 30.", "If you do not, the money stops."];
    }
    return points.map((point) => "- " + point).join("\n");
  }

  window.chrome = {
    storage: {
      local: hasParent ? sharedLocal : memoryArea("local"),
      session: memoryArea("session"),
      sync: memoryArea("sync"),
      onChanged: { addListener: (listener) => changeListeners.push(listener), removeListener() {} }
    },
    i18n: { getUILanguage: () => navigator.language || "en" },
    tabs: {
      query: async () => [clone(TAB)],
      // The popup talks to the "current tab": here, the demo website.
      sendMessage: (tabId, message) => ask({ op: "tab", message: clone(message) }),
      async create(options) {
        const url = String((options && options.url) || "");
        const page = /onboarding/.test(url) ? "the setup page" : /backup/.test(url) ? "the backup page" : "a new tab";
        toast("In Chrome, this opens " + page + ".");
        return {};
      }
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    // Hands-free uses the camera in Chrome's side panel. The demo can not open it,
    // but the big buttons and "hold still to click" work here with the mouse.
    sidePanel: {
      async open() {
        toast("In Chrome, this opens the hands-free panel (camera and voice). Here, hold your mouse still on a button to click it.");
      }
    },
    tabCapture: {
      getMediaStreamId: () => Promise.reject(new Error("The sound limiter needs the real extension."))
    },
    runtime: {
      id: "demo",
      getURL: (file) => extBase + String(file).replace(/^\//, ""),
      onMessage: { addListener: (listener) => messageListeners.push(listener), removeListener() {} },
      async sendMessage(message) {
        const type = message && message.type;
        if (type === "closeTab" || type === "goNewTab") {
          toast(type === "closeTab" ? "In Chrome, this would close the tab." : "In Chrome, this would open a new tab.");
          return {};
        }
        if (type === "aiStatus") {
          return { status: "no" };
        }
        if (type === "aiAsk") {
          return { error: "no-api" }; // "Show me how" then uses simple word matching
        }
        // Hands-free "Tabs": the demo has one tab. Opening a site is only described.
        if (type === "hfTabs") {
          if (message.action === "list") {
            return {
              tabs: [{ id: 1, title: TAB.title, site: "dailyexample.news", active: true }],
              sites: [
                { name: "YouTube", url: "https://www.youtube.com/" },
                { name: "Google", url: "https://www.google.com/" },
                { name: "CBC News", url: "https://www.cbc.ca/news" },
                { name: "Wikipedia", url: "https://www.wikipedia.org/" }
              ]
            };
          }
          toast("In Chrome, this changes the tab or opens the website.");
          return { ok: true };
        }
        if (type === "soundStart") {
          toast("The sound limiter needs the real extension.");
        }
        return {};
      },
      // "Explain simply" streams its answer through a port. Here we play a recorded example.
      connect() {
        const listeners = [];
        let stopped = false;
        return {
          onMessage: { addListener: (listener) => listeners.push(listener) },
          onDisconnect: { addListener() {} },
          disconnect() {
            stopped = true;
          },
          postMessage(message) {
            const text = exampleFor(message.task || {});
            const send = (data) => !stopped && listeners.forEach((listener) => listener(data));
            if (!text) {
              setTimeout(() => send({ error: "no-api" }), 200);
              return;
            }
            toParent({ op: "aiExample" });
            const words = text.split(/(?<= )/);
            let soFar = "";
            let i = 0;
            const timer = setInterval(() => {
              if (stopped || i >= words.length) {
                clearInterval(timer);
                send({ done: true, text: soFar });
                return;
              }
              soFar += words[i++];
              send({ text: soFar });
            }, 45);
          }
        };
      }
    }
  };

  // Chrome's translator would download a language pack when the language changes, and the popup waits for it.
  // In the demo we skip it, so changing the language is instant. (Website translation needs the real extension.)
  try {
    Object.defineProperty(window, "Translator", { value: undefined, configurable: true });
  } catch (error) {
    // not possible in this browser: the demo still works, a bit slower
  }

  // The popup closes itself after some buttons. In the demo it stays open.
  if (/\/popup\/popup\.html$/.test(location.pathname)) {
    window.close = () => {};
  }
})();
