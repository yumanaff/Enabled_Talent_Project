// Hands-free side panel.
// The camera follows the head (MediaPipe Face Landmarker, on this computer) and moves a pointer
// on the current tab. The microphone hears commands. The tab does the rest (content/modules/hands-free.js).
// Messages to the tab: { type: "hfPointer", x, y }  x, y = 0..1 of the window
//                      { type: "hfClick" }          a face gesture (open mouth / raise eyebrows)
//                      { type: "hfCommand", text }  what the user said
//                      { type: "hfStatus", text }   a short message to show on the page
// The camera picture never leaves this panel. Nothing is saved.
import { FaceLandmarker, FilesetResolver } from "../lib/mediapipe/vision_bundle.mjs";

const Ease = globalThis.Ease;
const t = (key, params) => Ease.i18n.t(key, params);
const $ = (id) => document.getElementById(id);

// How far the pointer moves for a head move, by "Pointer speed".
// Up and down use about the same gain as left and right, so a small nod is a small move.
const GAIN = { slow: [2.2, 2.4], normal: [2.8, 3.0], fast: [3.6, 3.9] };
const DOWN = 1.8; // looking down is a smaller head move than looking up (the screen is below the eyes), so it counts more
const STILL = 0.012; // head moves smaller than this (from the middle) do not move the pointer
const GESTURE_HOLD = 250; // ms a gesture must last (so blinking or a quick word does not click)

let settings = null;
let landmarker = null;
let stream = null;
let running = false;
let tabId = null;
let center = null; // {yaw, pitch, brows}
let smooth = null;
let gesture = { on: false, since: 0 };
let recognition = null;
let lastFace = 0;
let trail = []; // where the pointer was in the last second (to go back when the mouth starts to open)
let frozen = null; // {calmSince}: the mouth (or eyebrows) moved, so the pointer waits

// ---------- Settings ----------

async function loadSettings() {
  settings = await Ease.storage.loadMySettings();
  $("use-head").checked = settings.handsFreeHead !== false;
  $("use-voice").checked = settings.handsFreeVoice !== false;
  $("use-dock").checked = settings.handsFreeDock !== false;
  // The picture is hidden unless the user chose to see it (the button above the camera box).
  const showing = settings.handsFreePreview === true;
  document.querySelector(".view").classList.toggle("hidden", !showing);
  $("picture-toggle").setAttribute("aria-pressed", String(showing));
  $("picture-toggle").lastElementChild.textContent = t(showing ? "hfHidePicture" : "hfShowPicture");
  $("click-way").value = settings.handsFreeClick || "dwell";
  $("hold").value = settings.handsFreeHold || "1.5";
  $("speed").value = settings.handsFreeSpeed || "normal";
  $("hold").disabled = $("click-way").value !== "dwell";
}

function bindSetting(id, key, read) {
  $(id).addEventListener("change", async () => {
    await Ease.storage.saveMySettings({ [key]: read($(id)) });
    await loadSettings();
    if (running && key === "handsFreeVoice") {
      if (settings.handsFreeVoice) {
        startVoice();
      } else {
        stopVoice();
      }
    }
  });
}

// ---------- The current tab ----------

// The website tab the user looks at: the active tab of this window.
// (If the panel is not in a normal window, use the last normal window the user used.)
async function findTab() {
  let tab = null;
  try {
    const win = await chrome.windows.getCurrent();
    if (win.type === "normal") {
      [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    }
    if (!tab || isOurPage(tab)) {
      const windows = (await chrome.windows.getAll({ windowTypes: ["normal"] })).filter((w) => w.type === "normal");
      const last = windows.find((w) => w.focused) || windows[0];
      [tab] = last ? await chrome.tabs.query({ active: true, windowId: last.id }) : [];
    }
  } catch (error) {
    tab = null;
  }
  tabId = tab && !isOurPage(tab) ? tab.id : null;
  tabReady = false;
  showTab(tab);
}

function isOurPage(tab) {
  return String(tab.url || "").startsWith(chrome.runtime.getURL(""));
}

function showTab(tab) {
  const host = tab && /^https?:/.test(tab.url || "") ? new URL(tab.url).hostname : "";
  $("tab-name").textContent = host ? t("hfWorkingOn", { site: host }) : t("hfNoSite");
}

// Tabs that were open before Ease was installed or reloaded have no Ease yet. Add it once.
let tabReady = false;
let injecting = null;
async function makeReady() {
  if (tabReady || tabId == null) {
    return tabReady;
  }
  if (!injecting) {
    injecting = (async () => {
      const id = tabId;
      try {
        await chrome.tabs.sendMessage(id, { type: "hfPing" });
        return true;
      } catch (error) {
        // no Ease on this page yet
      }
      try {
        await addEase(id);
        return true;
      } catch (error) {
        // chrome:// pages, the Chrome Web Store, and similar: no extension can work there
        $("tab-name").textContent = t("hfCanNotWork");
        return false;
      }
    })();
  }
  tabReady = await injecting;
  injecting = null;
  return tabReady;
}

// No answer from the page: Ease is missing, or an old copy is left from before Ease was reloaded.
// Turn the old copy off (so it never clicks twice), then add a fresh copy.
async function addEase(id) {
  await chrome.scripting.executeScript({
    target: { tabId: id },
    func: () => {
      try {
        if (globalThis.Ease && globalThis.Ease.engine) {
          globalThis.Ease.engine.removeAll();
        }
      } catch (error) {
        // the old copy is broken: removing its boxes below is enough
      }
      document.querySelectorAll("[id^='ease-']").forEach((element) => element.remove());
      globalThis.Ease = undefined;
    }
  });
  const scripts = chrome.runtime.getManifest().content_scripts[0].js;
  await chrome.scripting.executeScript({ target: { tabId: id }, files: scripts });
}

async function toTab(message) {
  if (tabId == null || !(await makeReady())) {
    return;
  }
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    tabReady = false; // the page changed: check again next time
  });
}

// ---------- Camera and face ----------

async function loadModel() {
  if (landmarker) {
    return landmarker;
  }
  const files = await FilesetResolver.forVisionTasks(chrome.runtime.getURL("lib/mediapipe/wasm"));
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: chrome.runtime.getURL("lib/mediapipe/face_landmarker.task"), delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true // jaw open, eyebrows up: the click gestures
  });
  try {
    landmarker = await FaceLandmarker.createFromOptions(files, options("GPU"));
  } catch (error) {
    landmarker = await FaceLandmarker.createFromOptions(files, options("CPU")); // no graphics card
  }
  return landmarker;
}

function setState(key, good) {
  $("face-state").textContent = t(key);
  $("face-state").classList.toggle("good", Boolean(good));
}

async function startCamera() {
  setState("hfLoading");
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  await loadModel();
  center = null;
  smooth = null;
  frame();
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  stream = null;
  $("video").srcObject = null;
  const canvas = $("dots");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function frame() {
  if (!running || !stream) {
    return;
  }
  const video = $("video");
  if (video.readyState >= 2) {
    const result = landmarker.detectForVideo(video, performance.now());
    onFace(result);
  }
  if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(frame);
  } else {
    requestAnimationFrame(frame);
  }
}

function score(result, name) {
  const list = result.faceBlendshapes && result.faceBlendshapes[0];
  const item = list && list.categories.find((c) => c.categoryName === name);
  return item ? item.score : 0;
}

// Head turn and tilt from three points: the nose, and the outer corners of the eyes.
// Divided by the eye distance, so it works near or far from the camera.
function pose(points) {
  const nose = points[1];
  const left = points[33];
  const right = points[263];
  const midX = (left.x + right.x) / 2;
  const midY = (left.y + right.y) / 2;
  const eyes = Math.hypot(right.x - left.x, right.y - left.y) || 1;
  return { yaw: (nose.x - midX) / eyes, pitch: (nose.y - midY) / eyes };
}

function brows(result) {
  return Math.max(score(result, "browInnerUp"), (score(result, "browOuterUpLeft") + score(result, "browOuterUpRight")) / 2);
}

function onFace(result) {
  const points = result.faceLandmarks && result.faceLandmarks[0];
  drawDots(points);
  if (!points) {
    if (Date.now() - lastFace > 800) {
      setState("hfNoFace");
    }
    return;
  }
  if (Date.now() - lastFace > 800) {
    setState("hfFace", true);
  }
  lastFace = Date.now();
  const now = pose(points);
  if (!center) {
    // The first look is the middle. Also remember the face at rest (mouth closed, eyebrows down).
    center = { ...now, brows: brows(result), jaw: Math.min(score(result, "jawOpen"), 0.2) };
    toTab({ type: "hfStatus", text: t("hfCentered") });
  }

  // ----- Click gestures -----
  // Opening the mouth moves the nose, and so the pointer. So:
  //   1. As soon as the mouth (or the eyebrows) START to move, the pointer stops,
  //      and goes back to where it was a moment before. The click lands on what the user looked at.
  //   2. Open for 0.25 s = one click. The ring on the page fills while you hold.
  //   3. The pointer moves again only after the face is back at rest for a moment.
  const way = settings.handsFreeClick;
  const mouth = Math.max(0, score(result, "jawOpen") - center.jaw);
  const browUp = Math.max(0, brows(result) - center.brows);
  const moving = mouth > 0.07 || (way === "brows" && browUp > 0.12);
  const active = way === "mouth" ? mouth > 0.22 : way === "brows" ? browUp > 0.25 : false;
  const ms = performance.now();
  if (moving) {
    if (frozen) {
      frozen.calmSince = 0; // moving again
    } else {
      frozen = { calmSince: 0 };
      const before = trail.find((spot) => ms - spot.at <= 200); // the oldest spot in the last 0.2 s
      if (before && smooth) {
        smooth = { x: before.x, y: before.y };
        toTab({ type: "hfPointer", x: smooth.x, y: smooth.y });
      }
    }
    if (active) {
      if (!gesture.since) {
        gesture.since = ms;
      }
      const part = Math.min(1, (ms - gesture.since) / GESTURE_HOLD);
      if (!gesture.on) {
        toTab({ type: "hfGesture", part });
      }
      if (!gesture.on && part >= 1) {
        gesture.on = true;
        toTab({ type: "hfClick" });
      }
    } else if (!gesture.on && gesture.since) {
      gesture.since = 0;
      toTab({ type: "hfGesture", part: 0 });
    }
    return;
  }
  if (gesture.since || gesture.on) {
    toTab({ type: "hfGesture", part: 0 });
  }
  gesture = { on: false, since: 0 };
  if (frozen) {
    if (!frozen.calmSince) {
      frozen.calmSince = ms;
    }
    if (ms - frozen.calmSince < 250) {
      return; // let the head settle after the mouth closes
    }
    frozen = null;
  }

  if (settings.handsFreeHead === false) {
    return;
  }
  const [gainX, gainY] = GAIN[settings.handsFreeSpeed] || GAIN.normal;
  // The camera sees a mirror: turning to your right moves the nose to the left of the picture.
  const x = clamp(0.5 - soft(now.yaw - center.yaw) * gainX);
  const tilt = soft(now.pitch - center.pitch);
  const y = clamp(0.5 + tilt * gainY * (tilt > 0 ? DOWN : 1));
  // Smooth: big moves follow fast, small shakes are calmed.
  if (!smooth) {
    smooth = { x, y };
  }
  const distance = Math.hypot(x - smooth.x, y - smooth.y);
  const follow = Math.min(0.35, 0.08 + distance * 2.5); // slower, smoother glide
  smooth.x += (x - smooth.x) * follow;
  smooth.y += (y - smooth.y) * follow;
  trail.push({ at: performance.now(), x: smooth.x, y: smooth.y });
  trail = trail.filter((spot) => performance.now() - spot.at < 1000);
  toTab({ type: "hfPointer", x: smooth.x, y: smooth.y });
}

// A small "still zone" around the middle, then a smooth start, so tiny head moves do not jump the pointer.
function soft(delta) {
  const size = Math.abs(delta);
  if (size <= STILL) {
    return 0;
  }
  const past = size - STILL;
  const eased = past < 0.05 ? (past * past) / 0.1 : past - 0.025; // gentle at first, then normal
  return Math.sign(delta) * eased;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function drawDots(points) {
  const canvas = $("dots");
  const video = $("video");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) {
    return;
  }
  ctx.fillStyle = "rgba(154,166,212,0.9)";
  for (const index of [33, 263, 10, 152, 13, 14, 105, 334]) {
    ctx.beginPath();
    ctx.arc(points[index].x * canvas.width, points[index].y * canvas.height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#E03131";
  ctx.beginPath();
  ctx.arc(points[1].x * canvas.width, points[1].y * canvas.height, 8, 0, Math.PI * 2);
  ctx.fill();
}

function recenter() {
  center = null;
  smooth = null;
  frozen = null;
  trail = [];
}

// ---------- Voice ----------
// Commands are English words for now. Chrome turns speech into text: on this computer when it can,
// otherwise Chrome uses Google's speech service (we say so in the panel).

const Recognition = self.SpeechRecognition || self.webkitSpeechRecognition;

// "Write" mode: everything the user says becomes text in a big box on the page (not commands).
// The words are heard in the user's own language, so they can search in Hindi, French...
let writing = false;
let spelling = false;
const WRITE_LANG = { en: "en-US", fr: "fr-CA", es: "es-ES", it: "it-IT", hi: "hi-IN", pa: "pa-IN", ar: "ar-SA", tl: "fil-PH", zh_CN: "zh-CN", zh_HK: "yue-Hant-HK" };
// Short control words while writing (English): they act instead of being typed.
const WRITE_ACTIONS = [
  [/^(search|search it|search the web|google it)$/, "web"],
  [/^(search this site|search here)$/, "sitesearch"],
  [/^(go|go there|go to it|open it|open website)$/, "go"],
  [/^(put it here|put it in|type it|enter|enter it|done)$/, "here"],
  [/^(delete|delete word|delete last word|undo|back space|backspace)$/, "delete"],
  [/^(clear|clear all|start again)$/, "clear"],
  [/^(clear box|clear the box|empty the box|empty box)$/, "clearbox"],
  [/^(spell|spell mode|spell it|letters|letter by letter)$/, "spellOn"],
  [/^(words|word mode|normal mode)$/, "words"],
  [/^(close|cancel|stop writing|stop)$/, "close"]
];

async function startVoice() {
  if (!Recognition) {
    $("voice-note").textContent = t("hfVoiceNone");
    return;
  }
  stopVoice();
  // Spelling uses English letter names ("dee", "underscore"), so it listens in English.
  const lang = writing && !spelling ? WRITE_LANG[settings.language] || "en-US" : "en-US";
  recognition = new Recognition();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = writing; // show words while they are spoken
  let local = false;
  if (Recognition.available) {
    try {
      const state = await Recognition.available({ langs: [lang], processLocally: true });
      if (state === "available") {
        local = true;
      } else if (state === "downloadable" && Recognition.install) {
        Recognition.install({ langs: [lang], processLocally: true }).catch(() => {}); // ready next time
      }
    } catch (error) {
      local = false;
    }
  }
  if (local) {
    recognition.processLocally = true;
  }
  const english = (settings.language || "en").startsWith("en") ? "" : " " + t("hfVoiceEnglish");
  $("voice-note").textContent = t(local ? "hfVoiceLocal" : "hfVoiceCloud") + english;
  recognition.onresult = (event) => {
    if (writing) {
      onWriting(event);
      return;
    }
    const last = event.results[event.results.length - 1];
    const text = last[0].transcript.trim();
    if (!text) {
      return;
    }
    $("heard").textContent = text;
    if (/^(center|centre|center the pointer|middle)$/i.test(text.replace(/[.!?]/g, ""))) {
      recenter();
      return;
    }
    tabCommand(text).then((done) => {
      if (!done) {
        toTab({ type: "hfCommand", text });
      }
    });
  };
  recognition.onstart = () => {
    $("heard").textContent = t("hfListening");
  };
  recognition.onerror = (event) => {
    const messages = {
      "not-allowed": "hfNeedAccessText",
      "service-not-allowed": "hfNeedAccessText",
      "audio-capture": "hfNoMic",
      network: "hfVoiceNetwork",
      "language-not-supported": "hfVoiceNone"
    };
    if (event.error === "no-speech" || event.error === "aborted") {
      return; // normal: nobody spoke for a while
    }
    $("voice-note").textContent = messages[event.error] ? t(messages[event.error]) : t("hfVoiceError", { error: event.error });
    if (messages[event.error]) {
      recognition = null; // do not restart again and again
    }
  };
  recognition.onend = () => {
    // Chrome stops listening after a while. Keep listening while hands-free runs.
    if (running && recognition && settings.handsFreeVoice !== false) {
      setTimeout(() => recognition && recognition.start(), 250);
    }
  };
  recognition.start();
}

function onWriting(event) {
  let interim = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const piece = event.results[i][0].transcript.trim();
    if (!event.results[i].isFinal) {
      interim += (interim ? " " : "") + piece;
      continue;
    }
    if (!piece) {
      continue;
    }
    $("heard").textContent = piece;
    const plain = piece.toLowerCase().replace(/[.,!?。！？]/g, "").trim();
    const action = WRITE_ACTIONS.find(([pattern]) => pattern.test(plain));
    if (action) {
      toTab({ type: "hfWriteAction", action: action[1] });
    } else {
      toTab({ type: "hfDictate", text: piece, final: true });
    }
  }
  toTab({ type: "hfDictate", text: interim, final: false });
}

// The page opened or closed its "Write" box: listen for words, or for commands again.
function setWriting(on, spell) {
  if (writing === on && spelling === Boolean(spell)) {
    return;
  }
  writing = on;
  spelling = Boolean(on && spell);
  if (running && settings.handsFreeVoice !== false) {
    startVoice();
  }
}

function stopVoice() {
  if (recognition) {
    const old = recognition;
    recognition = null;
    old.onend = null;
    old.abort();
  }
}

// ---------- Tabs and websites (voice) ----------
// "open YouTube", "go to cbc.ca", "new tab", "next tab", "close tab", "tabs".
// The background switches and opens tabs. Anything else goes to the page ("open Shorts" clicks a button there).

async function tabCommand(raw) {
  const text = raw.toLowerCase().replace(/[,!?]/g, "").replace(/\.(?=\s|$)/g, "").replace(/\s+/g, " ").trim(); // keep the dot in "cbc.ca"
  let windowId;
  try {
    const win = await chrome.windows.getCurrent();
    windowId = win.type === "normal" ? win.id : undefined; // otherwise the background uses the last normal window
  } catch (error) {
    windowId = undefined;
  }
  const ask = (message) => chrome.runtime.sendMessage({ type: "hfTabs", windowId, ...message }).catch(() => ({ ok: false }));
  if (/^(next tab|tab right)$/.test(text)) {
    await ask({ action: "next" });
    return true;
  }
  if (/^(previous tab|last tab|tab left)$/.test(text)) {
    await ask({ action: "previous" });
    return true;
  }
  if (/^(close tab|close this tab|close the tab)$/.test(text)) {
    await ask({ action: "close" });
    return true;
  }
  if (/^(new tab|open a new tab|open new tab)$/.test(text)) {
    await ask({ action: "open", words: "google" });
    return true;
  }
  if (/^(tabs|show tabs|show my tabs|switch tab|switch tabs|change tab|other tabs|websites)$/.test(text)) {
    toTab({ type: "hfCommand", text: "tabs" });
    return true;
  }
  const match = text.match(/^(?:open|go to|launch|start|take me to|show me) (.+)$/);
  if (match) {
    const result = await ask({ action: "open", words: match[1] });
    return Boolean(result && result.ok);
  }
  return false;
}

// ---------- Start / stop ----------

// Show "A helper needs to do this once" only when Chrome has not allowed the camera yet.
async function showAccess() {
  let state = "prompt";
  try {
    state = (await navigator.permissions.query({ name: "camera" })).state;
  } catch (error) {
    state = "prompt";
  }
  $("access").hidden = state === "granted";
}

async function start() {
  running = true;
  tellBackground();
  $("start").setAttribute("aria-pressed", "true");
  $("start").textContent = t("hfStop");
  if (!settings.handsFree) {
    await Ease.storage.saveMySettings({ handsFree: true });
  }
  await findTab();
  if (settings.handsFreeVoice !== false) {
    startVoice();
  }
  try {
    await startCamera();
    $("access").hidden = true;
  } catch (error) {
    console.warn("[Ease] Hands-free camera:", error);
    if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
      $("access").hidden = false; // a helper must allow the camera once (grant.html)
      setState("hfNeedAccess");
    } else {
      setState("hfNoCamera");
      $("face-state").textContent += " (" + ((error && (error.name || error.message)) || "error") + ")";
    }
    stop();
    if (!$("access").hidden) {
      setState("hfNeedAccess");
    }
  }
}

// Stop = everything stops: camera, voice, and (on the pages) the pointer, hold-to-click, the big buttons.
// turnOff = false when the setting is already off (someone switched it off in the popup).
function stop(turnOff = true) {
  running = false;
  stopVoice();
  stopCamera();
  setWriting(false);
  $("start").setAttribute("aria-pressed", "false");
  $("start").textContent = t("hfStart");
  setState("hfOff");
  tellBackground();
  if (turnOff && settings && settings.handsFree) {
    Ease.storage.saveMySettings({ handsFree: false });
  }
}

// The background turns hands-free off if this panel closes while it runs (closing = stopping).
let backgroundPort = null;
function tellBackground() {
  try {
    if (!backgroundPort) {
      backgroundPort = chrome.runtime.connect({ name: "hf-panel" });
      backgroundPort.onDisconnect.addListener(() => (backgroundPort = null));
    }
    backgroundPort.postMessage({ running });
  } catch (error) {
    backgroundPort = null;
  }
}

async function init() {
  await loadSettings();
  await Ease.i18n.load(settings.language);
  Ease.i18n.translatePage();
  document.title = t("hfTitle");
  await loadSettings(); // again, now that the text is loaded (the picture button label)
  bindSetting("use-head", "handsFreeHead", (el) => el.checked);
  bindSetting("use-voice", "handsFreeVoice", (el) => el.checked);
  bindSetting("use-dock", "handsFreeDock", (el) => el.checked);
  $("picture-toggle").addEventListener("click", async () => {
    await Ease.storage.saveMySettings({ handsFreePreview: settings.handsFreePreview !== true });
    await loadSettings();
  });
  bindSetting("click-way", "handsFreeClick", (el) => el.value);
  bindSetting("hold", "handsFreeHold", (el) => el.value);
  bindSetting("speed", "handsFreeSpeed", (el) => el.value);
  $("start").addEventListener("click", () => (running ? stop() : start()));
  $("center").addEventListener("click", recenter);
  $("allow").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("handsfree/grant.html") }));
  chrome.tabs.onActivated.addListener(findTab);
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (id === tabId && change.status === "complete") {
      findTab(); // a new page in the same tab
    }
  });
  chrome.windows.onFocusChanged.addListener(findTab);
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "hfGranted") {
      showAccess();
    }
    if (message && message.type === "hfWriting") {
      setWriting(Boolean(message.on), Boolean(message.spell));
    }
  });
  Ease.storage.onChange(async () => {
    await loadSettings();
    if (running && !settings.handsFree) {
      stop(false); // switched off in the popup (or Reset to default): stop the camera and voice too
    }
  });
  await showAccess();
  await findTab();
}

init();

// For tests.
globalThis.EaseHandsFreePanel = { onWriting, setWriting, get writing() { return writing; }, get spelling() { return spelling; }, tabCommand, addEase, pose, onFace, recenter, get center() { return center; }, get pointer() { return smooth; } };
