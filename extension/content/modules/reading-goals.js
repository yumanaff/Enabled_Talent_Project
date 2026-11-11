// Reading Goals.
// For people who find it hard to finish reading (ADHD, anxiety, fatigue).
// Seeing progress helps people keep going. Finishing feels good.
//
//   - A thin bar at the top of an article shows how much is read.
//   - At 90%, the article counts as finished: "Article finished · 2 of 3 today".
//   - At the daily goal (1, 3 or 5 articles), Ease celebrates:
//       "confetti" -> soft confetti for 3 seconds, then a "You did it!" card
//       "calm"     -> a still check mark card (no movement)
//       "none"     -> only the small message
//   - People with Seizure safe, Reduced motion or Calm mode always get the calm card.
//   - On a Low-energy day, the goal is smaller.
//   - No streaks and no "you missed a day". Only good news.
//
// Off by default. Everything stays on this device.

(function () {
  const Ease = globalThis.Ease;

  const FINISHED_AT = 0.9; // 90% of the article
  const MIN_WORDS = 350; // shorter pages are not articles
  const CONFETTI_COLORS = ["#4A5A8C", "#E8B4A0", "#A8C5A0", "#F2D492", "#B8A9D9", "#9CC5D9"];

  let enabled = false;
  let settings = null;
  let bar = null;
  let toast = null;
  let toastTimer = null;
  let card = null;
  let frame = null;
  const counted = new Set(); // pages already counted while this tab is open

  const pageKey = () => location.host + location.pathname;

  // Goal for today. A Low-energy day halves it (never below 1).
  function goalToday() {
    const goal = Number(settings.readingGoal) || 3;
    return settings.lowEnergyDate === Ease.profiles.today() ? Math.max(1, Math.ceil(goal / 2)) : goal;
  }

  // Movement is never shown to people who asked for less of it.
  function wantsCalm() {
    return settings.celebrateStyle === "calm" || settings.pauseAnimations || settings.calmMode;
  }

  // ---------- Is this an article? How far did the user read? ----------

  function reader() {
    return document.getElementById("ease-reader");
  }

  function isArticle() {
    if (reader()) {
      return true; // Reading View only opens on articles
    }
    if (!document.body || document.documentElement.scrollHeight < window.innerHeight * 2) {
      return false;
    }
    let words = 0;
    for (const p of document.body.querySelectorAll("p")) {
      const text = p.textContent.trim();
      if (text.length >= 40) {
        words += text.split(/\s+/).length;
        if (words >= MIN_WORDS) {
          return true;
        }
      }
    }
    return false;
  }

  function progress() {
    const view = reader();
    if (view) {
      const room = view.scrollHeight - view.clientHeight;
      return room > 0 ? view.scrollTop / room : 1;
    }
    const room = document.documentElement.scrollHeight - window.innerHeight;
    return room > 0 ? window.scrollY / room : 1;
  }

  // ---------- Progress bar ----------

  function drawBar(value) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "ease-reading-bar";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-label", Ease.i18n.t("rgProgress"));
      bar.style.cssText =
        "position:fixed !important;top:0 !important;left:0 !important;height:5px !important;width:0;" +
        "z-index:2147483647 !important;background:#4A5A8C !important;border-radius:0 3px 3px 0 !important;" +
        "pointer-events:none !important;transition:width 0.2s linear;";
      document.documentElement.appendChild(bar);
    }
    const percent = Math.round(Math.min(1, value) * 100);
    bar.style.width = percent + "%";
    bar.setAttribute("aria-valuenow", String(percent));
  }

  function removeBar() {
    if (bar) {
      bar.remove();
      bar = null;
    }
  }

  // ---------- Small message and celebration ----------

  function box(id, css, inner) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;z-index:2147483647;" + css;
    const shadow = host.attachShadow({ mode: "open" });
    const scale = (Number(settings.textSize) || 100) / 100;
    shadow.innerHTML = `<style>
        .box { padding: 12px 16px; border-radius: 14px; background: #FBFBF9; color: #2A2F36; border: 1px solid #DDDDD6;
               box-shadow: 0 8px 24px rgba(0,0,0,0.18); font: 400 calc(15px * ${scale}) / 1.45 system-ui, sans-serif;
               text-align: center; max-width: 92vw; }
        .big { font-size: calc(44px * ${scale}); line-height: 1; margin-bottom: 8px; }
        .title { font-weight: 700; font-size: calc(20px * ${scale}); margin-bottom: 4px; }
        .week { color: #555B66; font-size: calc(13px * ${scale}); margin-top: 6px; }
        button { margin-top: 12px; height: calc(40px * ${scale}); padding: 0 18px; border: none; border-radius: 10px;
                 background: #4A5A8C; color: #FBFBF9; font: 700 calc(14px * ${scale}) / 1 system-ui, sans-serif; cursor: pointer; }
        button:focus-visible { outline: 3px solid #34406A; outline-offset: 2px; }
      </style><div class="box" role="status">${inner}</div>`;
    document.documentElement.appendChild(host);
    return host;
  }

  function showToast(text) {
    hideToast();
    toast = box("ease-reading-toast", "bottom:16px;left:50%;transform:translateX(-50%);", "");
    toast.shadowRoot.querySelector(".box").textContent = text;
    toastTimer = setTimeout(hideToast, 4000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toast) {
      toast.remove();
      toast = null;
    }
  }

  async function celebrate(count) {
    const style = settings.celebrateStyle;
    if (style === "none") {
      showToast(Ease.i18n.t("rgGoalReached", { n: count, goal: goalToday() }));
      return;
    }
    const calm = wantsCalm();
    if (!calm) {
      confetti();
    }
    hideToast();
    card = box("ease-reading-card", "top:50%;left:50%;transform:translate(-50%,-50%);width:min(360px,90vw);", "");
    const inner = card.shadowRoot.querySelector(".box");
    const big = document.createElement("div");
    big.className = "big";
    big.setAttribute("aria-hidden", "true");
    big.textContent = calm ? "✓" : "🎉";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = Ease.i18n.t("rgDoneTitle");
    const text = document.createElement("div");
    text.textContent = Ease.i18n.t("rgDoneText", { n: count });
    const week = document.createElement("div");
    week.className = "week";
    week.textContent = Ease.i18n.t("rgWeek", { d: await Ease.storage.readingDaysThisWeek() });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = Ease.i18n.t("trClose");
    close.addEventListener("click", hideCard);
    inner.append(big, title, text, week, close);
    close.focus({ preventScroll: true });
    setTimeout(hideCard, 10000);
  }

  function hideCard() {
    if (card) {
      card.remove();
      card = null;
    }
  }

  // Soft confetti: gentle colours, slow fall, 3 seconds. Nothing flashes.
  function confetti() {
    const canvas = document.createElement("canvas");
    canvas.id = "ease-confetti";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    document.documentElement.appendChild(canvas);
    const context = canvas.getContext && canvas.getContext("2d");
    if (!context) {
      canvas.remove();
      return;
    }
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      size: 6 + Math.random() * 6,
      speed: 1.5 + Math.random() * 2,
      drift: (Math.random() - 0.5) * 1.2,
      turn: Math.random() * Math.PI,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
    }));
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = elapsed > 2400 ? Math.max(0, 1 - (elapsed - 2400) / 600) : 1; // fade out, no blink
      for (const piece of pieces) {
        piece.y += piece.speed;
        piece.x += piece.drift;
        piece.turn += 0.03;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.turn);
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        context.restore();
      }
      if (elapsed < 3000) {
        frame = requestAnimationFrame(step);
      } else {
        canvas.remove();
        frame = null;
      }
    }
    frame = requestAnimationFrame(step);
  }

  // ---------- Watching the reading ----------

  async function finished() {
    const key = pageKey();
    if (counted.has(key)) {
      return;
    }
    counted.add(key);
    const count = await Ease.storage.markPageRead(key);
    const goal = goalToday();
    const log = await Ease.storage.loadReadingLog();
    if (count >= goal && log.celebrated !== Ease.profiles.today()) {
      await Ease.storage.markCelebrated();
      celebrate(count);
    } else if (count > goal || (count === goal && log.celebrated === Ease.profiles.today())) {
      showToast(Ease.i18n.t("rgBeyond", { n: count })); // goal already reached: just good news
    } else {
      showToast(Ease.i18n.t("rgFinished", { n: count, goal }));
    }
  }

  let ticking = false;
  function onScroll() {
    if (ticking) {
      return;
    }
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!enabled || !isArticle()) {
        removeBar();
        return;
      }
      const value = progress();
      drawBar(value);
      if (value >= FINISHED_AT) {
        finished();
      }
    });
  }

  Ease.engine.register({
    id: "reading-goals",
    observe: false,

    apply(newSettings) {
      settings = newSettings;
      if (!settings.readingGoals) {
        this.remove();
        return;
      }
      if (!enabled) {
        enabled = true;
        // capture: true also catches scrolling inside Reading View
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      }
      setTimeout(onScroll, 800); // draw the bar once the page has its layout
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      const canvas = document.getElementById("ease-confetti");
      if (canvas) {
        canvas.remove();
      }
      removeBar();
      hideToast();
      hideCard();
    }
  });

  // For tests.
  Ease.readingGoals = { goalToday: () => (settings ? goalToday() : null) };
})();
