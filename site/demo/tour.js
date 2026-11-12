// "Watch it work": a short tour of Hands-free on this demo website.
// It plays the REAL hands-free code (content/modules/hands-free.js). Instead of a webcam,
// this file moves the pointer and "says" the words, like the side panel does in Chrome.
// The page around (site.js) turns Hands-free on first, then sends { cmd: "tour" }.
(function () {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fire = (type, detail) => document.dispatchEvent(new CustomEvent("ease:" + type, { detail }));
  const caption = (text) => window.parent !== window && window.parent.postMessage({ easeHub: true, op: "toast", text }, "*");
  let where = { x: 0.5, y: 0.5 };
  let running = false;

  // Glide the head pointer, like a head turning (30 small steps).
  async function glide(x, y, ms = 1000) {
    const from = { ...where };
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      where = { x: from.x + (x - from.x) * ease, y: from.y + (y - from.y) * ease };
      fire("hfPointer", where);
      await wait(ms / steps);
    }
  }

  // Hold still (with the tiny shake a real head has).
  async function hold(ms) {
    const end = Date.now() + ms;
    let i = 0;
    while (Date.now() < end) {
      fire("hfPointer", { x: where.x + (i++ % 2 ? 0.001 : -0.001), y: where.y });
      await wait(60);
    }
  }

  function spot(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }
    const r = element.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
  }

  async function say(words, steps) {
    // Words show while they are spoken, then they are final.
    for (const part of steps) {
      fire("hfDictate", { text: part, final: false });
      await wait(450);
    }
    fire("hfDictate", { text: words, final: true });
  }

  async function tour() {
    if (running) {
      return;
    }
    running = true;
    try {
      scrollTo(0, 0);
      fire("hfPointer", where);
      await wait(600);
      const close = spot(".modal .x");
      if (close) {
        caption("1 of 6 · Turn your head: the pointer follows. Hold still on ✕ to close the pop-up.");
        await glide(close.x, close.y);
        await hold(2100);
        await wait(500);
      }
      const cc = spot('[aria-label^="Subtitles"]');
      if (cc) {
        caption("2 of 6 · Hold still on a button: the ring fills, then Ease clicks. Captions are on now.");
        await glide(cc.x, cc.y, 1100);
        await hold(2100);
        await wait(700);
      }
      caption("3 of 6 · Look at the bottom edge: the page scrolls slowly.");
      await glide(0.45, 0.97, 900);
      await hold(3200);
      await glide(0.45, 0.5, 700);
      await wait(400);
      caption("4 of 6 · Say \"write\", then talk: your words appear. Then search the web, or put them in a box.");
      fire("hfCommand", { text: "write" });
      await wait(900);
      await say("cooking videos for beginners", ["cooking", "cooking videos", "cooking videos for"]);
      await wait(2600);
      fire("hfWriteAction", { action: "close" });
      await wait(500);
      caption("5 of 6 · Say \"tabs\": big buttons to change tab or open YouTube, the news, Gmail…");
      fire("hfCommand", { text: "tabs" });
      await wait(3200);
      fire("hfCommand", { text: "no" });
      await wait(400);
      caption("6 of 6 · Say \"click shop now\": Ease will not. Buying is turned off in hands-free mode, by head and by voice.");
      fire("hfCommand", { text: "click shop now" });
      await wait(3600);
      fire("hfCommand", { text: "ok" });
      await wait(300);
      await glide(0.5, 0.5, 600);
      caption("That is Hands-free. In Chrome, your webcam moves the pointer, and you talk to Ease. Try it here: hold your mouse still on a button.");
    } finally {
      running = false;
    }
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source === window.parent && data && data.easeHub && data.cmd === "tour") {
      tour();
    }
  });
})();
