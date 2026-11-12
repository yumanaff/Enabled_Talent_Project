// Scroll Buttons.
// Big "up" and "down" buttons on the side of the page.
// For people with tremor, Parkinson's or arthritis, the scroll wheel jumps too far
// and the scroll bar is hard to drag. One big button is much easier.
//
// Each press moves most of one screen, so the user does not lose their place.

(function () {
  const Ease = globalThis.Ease;

  let host = null;
  let smooth = true;
  let scale = 1;

  // The thing that scrolls: Reading View when it is open, otherwise the page.
  function scroller() {
    return document.getElementById("ease-reader") || document.scrollingElement || document.documentElement;
  }

  function move(direction) {
    const target = scroller();
    const view = target.id === "ease-reader" ? target.clientHeight : window.innerHeight;
    const distance = Math.round(view * 0.8) * direction;
    const options = { top: distance, behavior: smooth ? "smooth" : "auto" };
    if (target.id === "ease-reader") {
      target.scrollBy(options);
    } else {
      window.scrollBy(options);
    }
  }

  function build() {
    host = document.createElement("div");
    host.id = "ease-scroll-buttons";
    host.style.cssText = "position:fixed;z-index:2147483646;right:12px;top:50%;transform:translateY(-50%);";
    const shadow = host.attachShadow({ mode: "open" });
    const size = Math.round(56 * scale);
    shadow.innerHTML = `<style>
        .bar { display: flex; flex-direction: column; gap: 10px; }
        button { width: ${size}px; height: ${size}px; border-radius: 16px; border: 1px solid #DDDDD6;
                 background: #FBFBF9; color: #34406A; box-shadow: 0 4px 12px rgba(0,0,0,0.16);
                 display: grid; place-items: center; cursor: pointer; padding: 0; }
        button:hover { background: #E8EAF1; }
        button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }
        svg { width: 60%; height: 60%; }
      </style>
      <div class="bar">
        <button type="button" class="up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
        <button type="button" class="down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      </div>`;
    const up = shadow.querySelector(".up");
    const down = shadow.querySelector(".down");
    up.setAttribute("aria-label", Ease.i18n.t("scrollUp"));
    up.title = Ease.i18n.t("scrollUp");
    down.setAttribute("aria-label", Ease.i18n.t("scrollDown"));
    down.title = Ease.i18n.t("scrollDown");
    up.addEventListener("click", () => move(-1));
    down.addEventListener("click", () => move(1));
    document.documentElement.appendChild(host);
  }

  Ease.engine.register({
    id: "scroll-buttons",
    observe: false,

    apply(settings) {
      if (!settings.scrollButtons || window.top !== window) {
        this.remove();
        return;
      }
      // No smooth sliding for people who asked for less motion.
      smooth = !settings.pauseAnimations && !settings.calmMode;
      const newScale = Math.min(1.5, (Number(settings.textSize) || 100) / 100);
      if (host && newScale !== scale) {
        this.remove(); // rebuild at the new size
      }
      scale = newScale;
      if (!host) {
        build();
      }
    },

    remove() {
      if (host) {
        host.remove();
        host = null;
      }
    }
  });
})();
