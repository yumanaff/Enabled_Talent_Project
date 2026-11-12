// Volume Limiter.
// Sets a maximum volume for every video and audio on the page.
// Helps people sensitive to loud or sudden sounds (autism, hyperacusis,
// migraine, PTSD, tinnitus).
//
// Setting "volumeLimit": "off" | "70" | "50" | "30" | "15"
// Shown as: A bit quieter, Quieter, Quiet, Very quiet.
//
// How it works: if a page sets the volume higher than the limit,
// we turn it back down to the limit.
//
// Why we square the number: ears hear loudness on a log scale, but a
// video's volume is a straight line. Volume 0.3 is only 10 dB quieter,
// and sounds about HALF as loud, not 30%. Users told us "30%" was still
// too loud with the laptop at full volume.
// Squaring makes the level close to how loud it sounds:
//   70 -> 0.49 (-6 dB)   50 -> 0.25 (-12 dB)   30 -> 0.09 (-21 dB)   15 -> 0.0225 (-33 dB)
//
// HONEST LIMIT: this caps the maximum volume of <video> and <audio> elements.
// It does not soften sudden peaks inside a sound, and it does not reach
// sounds made with the Web Audio API (some games). We tried a sound
// compressor inside the page, but it makes videos from other websites go silent.
// The SOUND LIMITER (Home → "Limit", offscreen/sound.js) solves both: it works on the
// whole tab's sound. While it runs on this tab, we step aside, so the sound is not
// turned down twice.

(function () {
  const Ease = globalThis.Ease;

  let enabled = false;
  let cap = 1;
  let tabLimiterOn = false; // the sound limiter handles this tab
  const wanted = new WeakMap(); // the volume the page asked for, before we turned it down

  function limit(media) {
    if (tabLimiterOn) {
      return;
    }
    if (media.volume > cap) {
      wanted.set(media, media.volume);
      media.volume = cap;
    }
  }

  // The sound limiter started or stopped on this tab.
  function onTabLimiter(event) {
    tabLimiterOn = Boolean(event.detail && event.detail.on);
    for (const media of document.querySelectorAll("video, audio")) {
      if (tabLimiterOn && wanted.has(media)) {
        media.volume = wanted.get(media); // give the volume back; the limiter does the work now
      }
    }
    if (!tabLimiterOn && enabled) {
      limitAll();
    }
  }
  document.addEventListener("ease:soundLimiter", onTabLimiter);

  // A new page in a limited tab: ask if the limiter is still running.
  function askTabLimiter() {
    try {
      chrome.runtime.sendMessage({ type: "soundState" }).then(
        (answer) => onTabLimiter({ detail: { on: Boolean(answer && answer.on) } }),
        () => {}
      );
    } catch (error) {
      // the extension was updated: this old page script can not talk to it any more
    }
  }

  function limitAll() {
    for (const media of document.querySelectorAll("video, audio")) {
      limit(media);
    }
  }

  // Media events do not bubble, but "capture" listeners on document still get them.
  function onMediaEvent(event) {
    if (event.target && (event.target.tagName === "VIDEO" || event.target.tagName === "AUDIO")) {
      limit(event.target);
    }
  }

  Ease.engine.register({
    id: "volume-limiter",
    observe: true, // new videos can load later

    apply(settings) {
      const percent = Number(settings.volumeLimit);
      if (!percent) {
        this.remove();
        return;
      }
      cap = (percent / 100) ** 2; // see the note at the top
      if (!enabled) {
        enabled = true;
        document.addEventListener("volumechange", onMediaEvent, true);
        document.addEventListener("play", onMediaEvent, true);
        document.addEventListener("loadedmetadata", onMediaEvent, true);
        askTabLimiter();
      }
      limitAll();
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      cap = 1;
      document.removeEventListener("volumechange", onMediaEvent, true);
      document.removeEventListener("play", onMediaEvent, true);
      document.removeEventListener("loadedmetadata", onMediaEvent, true);
      // We do not turn volume back up. The user can change it themselves.
    }
  });
})();
