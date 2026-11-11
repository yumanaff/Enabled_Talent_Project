// Ease sound limiter: the hidden ("offscreen") page.
//
// Why a hidden page: a background service worker can not play sound.
// How it works:
//   1. The popup gets a "stream id" for the tab (Chrome needs the user's click for this).
//   2. Here we turn the id into the tab's live sound.
//      While Chrome captures a tab, the tab itself goes silent.
//   3. We play the sound again, through the limiter (limiter-worklet.js).
// Several tabs can be limited at the same time. Each has its own limiter.

const running = new Map(); // tabId -> { context, stream, node }

// Level names are the same as "Maximum volume". The number is squared (see volume-limiter.js).
function levelGain(level) {
  const percent = Number(level) || 50;
  return (percent / 100) ** 2;
}

async function start(tabId, streamId, level) {
  stop(tabId);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false
  });
  const context = new AudioContext();
  await context.audioWorklet.addModule("limiter-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "ease-limiter", { outputChannelCount: [2] });
  node.parameters.get("level").value = levelGain(level);
  source.connect(node).connect(context.destination);
  running.set(tabId, { context, stream, node });

  // The capture ends when the tab closes (or Chrome stops it). Tell the background.
  for (const track of stream.getAudioTracks()) {
    track.addEventListener("ended", () => {
      stop(tabId);
      chrome.runtime.sendMessage({ target: "background", type: "soundEnded", tabId });
    });
  }
}

function setLevel(tabId, level) {
  const item = running.get(tabId);
  if (item) {
    // A short fade (50 ms), so the change does not click.
    item.node.parameters.get("level").setTargetAtTime(levelGain(level), item.context.currentTime, 0.05);
  }
}

function stop(tabId) {
  const item = running.get(tabId);
  if (!item) {
    return;
  }
  running.delete(tabId);
  item.stream.getTracks().forEach((track) => track.stop()); // the tab plays its own sound again
  item.context.close();
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.target !== "offscreen" || !/^sound/.test(message.type)) {
    return; // not a sound message (the AI helper answers those)
  }
  if (message.type === "soundStart") {
    start(message.tabId, message.streamId, message.level).then(
      () => reply({ ok: true }),
      (error) => reply({ ok: false, error: String(error && error.message) })
    );
    return true; // we reply later
  }
  if (message.type === "soundLevel") {
    setLevel(message.tabId, message.level);
  } else if (message.type === "soundStop") {
    stop(message.tabId);
  }
  reply({ ok: true, count: running.size });
});
