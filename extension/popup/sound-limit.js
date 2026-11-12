// Sound limiter bar on Home.
// Shows only while this tab plays sound (or while the limiter is on).
//   Off: "This tab is playing sound · [Limit]"
//   On:  "Sound limit is on · [Quiet ▾] [Stop]"
// Chrome only lets us capture a tab's sound right after the user clicks, so "Limit" must be pressed
// once on each tab. The real work happens in offscreen/sound.js. See background.js part 5.

(function () {
  const Ease = globalThis.Ease;
  const LEVELS = ["70", "50", "30", "15"]; // the same levels as "Maximum volume"

  async function limitedTabs() {
    const { soundTabs } = await chrome.storage.session.get("soundTabs");
    return soundTabs || {};
  }

  Ease.soundLimit = {
    // tab: the active tab. settings: the user's settings for this website (after profiles and Calm).
    async setup(tab, settings) {
      const t = Ease.i18n.t.bind(Ease.i18n);
      const bar = document.getElementById("sound-bar");
      const select = document.getElementById("sound-level");
      const error = document.getElementById("sound-error");
      if (!bar || !tab || !/^https?:/.test(tab.url || "")) {
        return; // Chrome does not let extensions capture its own pages
      }

      for (const level of LEVELS) {
        const option = document.createElement("option");
        option.value = level;
        option.textContent = t("option_" + level);
        select.appendChild(option);
      }
      // Start at the user's own "Maximum volume", or "Quieter" if they have none.
      const fallback = LEVELS.includes(settings.volumeLimit) ? settings.volumeLimit : "50";

      function draw(level) {
        const on = Boolean(level);
        bar.classList.toggle("on", on);
        document.getElementById("sound-title").textContent = t(on ? "sndOn" : "sndPlaying");
        document.getElementById("sound-sub").textContent = t(on ? "sndOnSub" : "sndPlayingSub");
        // SVG icons have no .hidden property, so we set the attribute.
        document.getElementById("sound-icon-off").toggleAttribute("hidden", on);
        document.getElementById("sound-icon-on").toggleAttribute("hidden", !on);
        document.getElementById("sound-go").hidden = on;
        document.getElementById("sound-stop").hidden = !on;
        select.parentElement.hidden = !on;
        select.value = level || fallback;
        bar.hidden = false;
      }

      async function send(message) {
        return chrome.runtime.sendMessage({ ...message, tabId: tab.id });
      }

      document.getElementById("sound-go").addEventListener("click", async () => {
        error.hidden = true;
        try {
          // Must happen right after the click, or Chrome says no.
          const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
          const result = await send({ type: "soundStart", streamId, level: fallback });
          if (!result || !result.ok) {
            throw new Error(result && result.error);
          }
          draw(fallback);
          document.getElementById("sound-stop").focus();
        } catch (problem) {
          console.warn("[Ease] Sound limiter could not start:", problem);
          error.textContent = t("sndError");
          error.hidden = false;
        }
      });

      document.getElementById("sound-stop").addEventListener("click", async () => {
        await send({ type: "soundStop" });
        draw(null);
        document.getElementById("sound-go").focus();
      });

      select.addEventListener("change", () => {
        send({ type: "soundLevel", level: select.value });
      });

      const level = (await limitedTabs())[tab.id];
      if (level || tab.audible) {
        draw(level || null);
      }
    }
  };
})();
