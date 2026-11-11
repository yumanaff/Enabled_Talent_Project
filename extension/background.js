// Background service worker.
// 1. Runs when the extension is installed or updated.
// 2. Tells a page when its tab starts or stops playing sound (Visual Sound Alert).
//    Chrome knows this for ALL sound in a tab, even games and ads in frames.
// 3. Closes a scam page when the user presses "Close this tab" (Scam Guard).
// 4. Copies settings to and from Chrome Sync, if the user turned it on.
// 5. Sound limiter: starts and stops the hidden page that limits a tab's sound.

importScripts("shared/defaults.js", "shared/profiles.js", "shared/storage.js", "shared/i18n.js");

chrome.runtime.onInstalled.addListener(async (details) => {
  // Make sure My Settings exists, even if empty.
  const data = await chrome.storage.local.get("mySettings");
  if (!data.mySettings) {
    await chrome.storage.local.set({ mySettings: {} });
  }

  // First install: open the welcome and setup page.
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html") });
  }
});

// "audible" changes when a tab starts or stops making sound.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (typeof changeInfo.audible !== "boolean") {
    return;
  }
  chrome.tabs.sendMessage(tabId, { type: "audible", audible: changeInfo.audible }).catch(() => {
    // The page has no Ease script (for example chrome:// pages). Nothing to do.
  });
});

// 3. Scam Guard's "Close this tab" button.
//    A page can not close its own tab, so it asks us. We only close the tab that asked.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "closeTab" && sender.tab && typeof sender.tab.id === "number") {
    chrome.tabs.remove(sender.tab.id);
  }
  // Time limits: "Go to something else" opens Chrome's new tab page in this tab.
  if (message && message.type === "goNewTab" && sender.tab && typeof sender.tab.id === "number") {
    chrome.tabs.update(sender.tab.id, { url: "chrome://newtab/" }).catch(() => chrome.tabs.update(sender.tab.id, { url: "about:blank" }));
  }
});

// 4. Chrome Sync ("Same settings on all my computers").
//    While "syncOn" is true on this computer, we copy settings both ways:
//    this computer -> Chrome Sync -> the user's other computers.
//    Form drafts and reading spots are never synced (they show what you typed and read).
//    We only write when something really changed, so the two copies do not loop forever.
const SYNC_KEYS = ["mySettings", "siteSettings", "sitesOff"];

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" && area !== "sync") {
    return;
  }
  const keys = SYNC_KEYS.filter((key) => key in changes);
  if (!keys.length) {
    return;
  }
  const { syncOn } = await chrome.storage.local.get("syncOn");
  if (!syncOn) {
    return;
  }
  const target = area === "local" ? chrome.storage.sync : chrome.storage.local;
  const current = await target.get(keys);
  for (const key of keys) {
    const value = changes[key].newValue;
    if (value === undefined || same(current[key], value)) {
      continue;
    }
    try {
      await target.set({ [key]: value });
    } catch (error) {
      // Chrome Sync has size limits (about 8 KB per item). Many website settings can go over it.
      console.warn("[Ease] Could not sync", key, error);
    }
  }
});

// 5. Sound limiter ("Limit" on Home, while a tab plays sound).
//    The popup gets a stream id for the tab (needs the user's click), then asks us to start.
//    We open one hidden "offscreen" page that plays the sound through the limiter.
//    Which tabs are limited is kept in storage.session (cleared when Chrome closes).
const HELPER_PAGE = "offscreen/helper.html"; // one hidden page for the sound limiter and the AI helpers
let aiBusy = 0; // AI requests still running: do not close the helper page
let aiLastUse = 0; // the helper page keeps the AI loaded: keep it open for 30 minutes after the last use
const AI_KEEP = 30 * 60 * 1000;

async function soundTabs() {
  const { soundTabs } = await chrome.storage.session.get("soundTabs");
  return soundTabs || {};
}

async function saveSoundTabs(tabs) {
  await chrome.storage.session.set({ soundTabs: tabs });
}

let opening = null; // two callers at once must not open two pages (Chrome allows only one)

async function openSoundPage() {
  if (!opening) {
    opening = (async () => {
      const open = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      if (!open.length) {
        await chrome.offscreen.createDocument({
          url: HELPER_PAGE,
          reasons: ["USER_MEDIA", "AUDIO_PLAYBACK", "DOM_PARSER"],
          justification: "Plays a tab's sound through the sound limiter, and runs Chrome's on-device AI for Explain simply and Show me how."
        });
      }
    })().finally(() => {
      opening = null;
    });
  }
  return opening;
}

async function closeSoundPageIfIdle() {
  const tabs = await soundTabs();
  if (!Object.keys(tabs).length && !aiBusy && Date.now() - aiLastUse > AI_KEEP && (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length) {
    await chrome.offscreen.closeDocument();
  }
}

// Tell the page, so "Maximum volume" does not turn the sound down a second time.
function tellPage(tabId, on) {
  chrome.tabs.sendMessage(tabId, { type: "soundLimiter", on }).catch(() => {});
}

async function soundEnded(tabId) {
  const tabs = await soundTabs();
  if (tabs[tabId]) {
    delete tabs[tabId];
    await saveSoundTabs(tabs);
    tellPage(tabId, false);
  }
  await closeSoundPageIfIdle();
}

async function handleSound(message, sender) {
  const tabId = message.tabId;
  if (message.type === "soundStart") {
    await openSoundPage();
    const result = await chrome.runtime.sendMessage({ target: "offscreen", type: "soundStart", tabId, streamId: message.streamId, level: message.level });
    if (!result || !result.ok) {
      await closeSoundPageIfIdle();
      return result || { ok: false };
    }
    const tabs = await soundTabs();
    tabs[tabId] = message.level;
    await saveSoundTabs(tabs);
    tellPage(tabId, true);
    return { ok: true };
  }
  if (message.type === "soundLevel") {
    const tabs = await soundTabs();
    if (tabs[tabId]) {
      tabs[tabId] = message.level;
      await saveSoundTabs(tabs);
      await chrome.runtime.sendMessage({ target: "offscreen", type: "soundLevel", tabId, level: message.level });
    }
    return { ok: true };
  }
  if (message.type === "soundStop") {
    if ((await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length) {
      await chrome.runtime.sendMessage({ target: "offscreen", type: "soundStop", tabId });
    }
    await soundEnded(tabId);
    return { ok: true };
  }
  if (message.type === "soundEnded") {
    await soundEnded(tabId);
    return { ok: true };
  }
  if (message.type === "soundState") {
    // A page (after loading) asks: is my tab limited?
    const id = sender.tab && sender.tab.id;
    return { on: Boolean(id !== undefined && (await soundTabs())[id]) };
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.target === "offscreen" || !/^sound(Start|Level|Stop|Ended|State)$/.test(message.type)) {
    return;
  }
  handleSound(message, sender).then(reply, (error) => reply({ ok: false, error: String(error && error.message) }));
  return true; // we reply later
});

chrome.tabs.onRemoved.addListener((tabId) => {
  soundEnded(tabId);
});

// 6. AI helpers ("Explain simply", "Show me how").
//    Websites can not use Chrome's on-device AI directly, so they ask us.
//    If this service worker has the API, we answer here. If not, the hidden helper page answers.

// The AI always runs in the helper page, never here: Chrome stops this service worker after
// 30 seconds without work, and then the loaded model would be lost and load again (slow).
async function aiAnswer(message) {
  aiLastUse = Date.now();
  aiBusy += 1;
  try {
    await openSoundPage();
    return await chrome.runtime.sendMessage({ ...message, target: "offscreen" });
  } finally {
    aiBusy -= 1;
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.target === "offscreen" || !["aiAsk", "aiStatus", "aiWarm"].includes(message.type)) {
    return;
  }
  aiAnswer(message).then(reply, (error) => reply({ error: String((error && error.message) || "failed") }));
  return true; // we reply later
});

// Streamed answers ("Explain simply"): the page opens a port. We pass the text along as it is written.
// When the page closes the port (panel closed), the AI stops.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai") {
    return;
  }
  port.onMessage.addListener(async (message) => {
    if (!message || message.type !== "aiStream") {
      return;
    }
    const send = (data) => {
      try {
        port.postMessage(data);
      } catch (error) {
        // the page closed the port
      }
    };
    aiLastUse = Date.now();
    aiBusy += 1;
    try {
      await openSoundPage();
    } catch (error) {
      aiBusy -= 1;
      send({ error: "failed" });
      return;
    }
    const helper = chrome.runtime.connect({ name: "ai-helper" });
    helper.onMessage.addListener(send);
    helper.onDisconnect.addListener(() => {
      aiBusy -= 1;
      try {
        port.disconnect();
      } catch (error) {
        // already closed
      }
    });
    port.onDisconnect.addListener(() => helper.disconnect());
    helper.postMessage(message);
  });
});

// Right-click on selected text: "Explain simply" (in the user's language).
async function menuTitle() {
  const { mySettings } = await chrome.storage.local.get("mySettings");
  await Ease.i18n.load((mySettings && mySettings.language) || "en", false);
  return Ease.i18n.t("exButton");
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({ id: "explain-simply", title: await menuTitle(), contexts: ["selection"] }, () => void chrome.runtime.lastError);
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.mySettings && (changes.mySettings.newValue || {}).language !== (changes.mySettings.oldValue || {}).language) {
    chrome.contextMenus.update("explain-simply", { title: await menuTitle() }, () => void chrome.runtime.lastError);
  }
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "explain-simply" && tab && typeof tab.id === "number") {
    chrome.tabs.sendMessage(tab.id, { type: "explainSelection", text: info.selectionText || "" }).catch(() => {});
  }
});
