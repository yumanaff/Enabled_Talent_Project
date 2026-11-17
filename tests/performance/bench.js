// Ease performance benchmark.
// Loads Ease's content scripts on a heavy page in Chromium and measures:
//   1. Start-up: how long each tool takes to apply when the page opens
//   2. New content: how long the tools take when 100 new paragraphs load (like infinite scroll)
//   3. Long tasks: any work that blocks the page for more than 50 ms
//   4. Memory: JavaScript memory used by Ease
// Every case runs several times; we report the median.
//
// Run: npm install, then npm run bench

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { makePage } = require("./make-page");

const EXT = path.resolve(__dirname, "../../extension") + "/";
const RUNS = Number(process.env.RUNS || 5);
const manifest = JSON.parse(fs.readFileSync(EXT + "manifest.json", "utf8"));
const files = manifest.content_scripts[0].js;
const CONTENT = files.map((f) => fs.readFileSync(EXT + f, "utf8"));
const MAIN_INDEX = files.indexOf("content/main.js");

// Everything on (except translation and summary, which need Chrome's AI models).
const ALL_ON = {
  language: "en", textSize: 150, lineHeight: "wide", letterSpacing: "wide", fontFamily: "atkinson",
  readingGuide: "line", readAloud: "normal", contrast: "dark", monochrome: false, highlightLinks: true,
  highlightTitles: true, hideImages: false, bigCursor: true, focusIndicator: true, skipToContent: true,
  pauseAnimations: true, biggerTargets: true, tremorFilter: "light", calmMode: true, pressureRemover: true,
  triggerBlur: true, triggerWords: ["spider", "earthquake"], formSaver: true, soundAlert: true, volumeLimit: "50",
  safeLinks: true, resumeReading: true, iconLabels: true, bigTooltips: true, hidePopups: true, sameTab: true,
  scrollButtons: true, typingFilter: "light", readingGoals: true
};

const median = (list) => { const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function server(html) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      if (req.url.startsWith("/locales/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(fs.readFileSync(EXT + req.url.slice(1)));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    s.listen(0, () => resolve({ s, base: "http://localhost:" + s.address().port + "/" }));
  });
}

// Runs once in the page, before Ease: a fake "chrome" and a timer around every tool.
const setup = (settings, base) => `
  const o = { mySettings: ${JSON.stringify(settings)} };
  const area = (x) => ({ get: async (k) => { if (typeof k === "string") k = [k]; const r = {}; for (const y of k) if (x[y] !== undefined) r[y] = x[y]; return r; }, set: async (v) => Object.assign(x, v) });
  window.chrome = { storage: { local: area(o), onChanged: { addListener() {} } }, runtime: { getURL: (p) => "${base}" + p, onMessage: { addListener() {} }, sendMessage() {} } };
  window.__times = {};
  window.__longTasks = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks += e.duration; }).observe({ type: "longtask", buffered: true });
`;

const wrapTimers = `
  (function () {
    const register = Ease.engine.register;
    Ease.engine.register = function (module) {
      const apply = module.apply;
      module.apply = function (settings) {
        const t0 = performance.now();
        const result = apply.call(this, settings);
        const ms = performance.now() - t0;
        (window.__times[module.id] = window.__times[module.id] || []).push(ms);
        return result;
      };
      return register.call(this, module);
    };
  })();
`;

// The same page without Ease: how much the page blocks by itself (for a fair comparison).
async function runBaseline(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(setup({}, base));
  await page.goto(base);
  await page.waitForLoadState("load");
  await page.evaluate(() => document.body.getBoundingClientRect());
  await page.waitForTimeout(1900);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(400);
  const longTasks = await page.evaluate(() => window.__longTasks);
  await page.close();
  return longTasks;
}

async function runOnce(browser, base, settings) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(setup(settings, base));
  await page.goto(base);
  await page.waitForLoadState("load");
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const heapBefore = (await client.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize").value;

  // Start-up: inject Ease exactly like Chrome does (all files, in order), then wait for it to apply.
  const startup = await page.evaluate(async ({ scripts, wrap, mainIndex }) => {
    const t0 = performance.now();
    scripts.forEach((code, i) => {
      if (i === mainIndex) {
        window.__mainStart = performance.now();
      }
      new Function(code)();
      if (i === 4) {
        new Function(wrap)(); // right after engine.js: time every tool
      }
    });
    // main.js applies after reading settings (async). Wait until tools have run.
    for (let i = 0; i < 200 && Object.keys(window.__times).length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 50));
    const applied = Object.values(window.__times).reduce((sum, list) => sum + list[0], 0);
    return { parse: window.__mainStart - t0, applied };
  }, { scripts: CONTENT, wrap: wrapTimers, mainIndex: MAIN_INDEX });
  const firstTimes = await page.evaluate(() => Object.fromEntries(Object.entries(window.__times).map(([k, v]) => [k, v[0]])));

  // New content: add 100 paragraphs with links, like infinite scroll, then wait for the observer.
  await page.evaluate(() => { window.__times = {}; });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    const extra = document.createElement("section");
    extra.innerHTML = Array.from({ length: 100 }, (_, i) => `<p>New comment ${i} about bike lanes and the housing plan <a href="https://example.org/c${i}">reply</a></p>`).join("");
    main.appendChild(extra);
  });
  await page.waitForTimeout(1500); // the engine waits 300 ms after changes; idle work runs after that
  const newContent = await page.evaluate(() => Object.fromEntries(Object.entries(window.__times).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)])));

  // Scroll a little (scroll listeners) and let timers finish
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(400);
  const heapAfter = (await client.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize").value;
  const longTasks = await page.evaluate(() => window.__longTasks);
  await page.close();
  return { startup, firstTimes, newContent, heapMB: (heapAfter - heapBefore) / 1048576, longTasks };
}

(async () => {
  const html = makePage();
  const { s, base } = await server(html);
  const browser = await chromium.launch();
  const runs = [];
  const baseline = [];
  for (let i = 0; i < RUNS; i++) {
    baseline.push(await runBaseline(browser, base));
    runs.push(await runOnce(browser, base, ALL_ON));
  }
  const ids = Object.keys(runs[0].firstTimes);
  const perTool = ids.map((id) => ({ id, start: median(runs.map((r) => r.firstTimes[id] || 0)), newContent: median(runs.map((r) => r.newContent[id] || 0)) }))
    .sort((a, b) => b.start + b.newContent - (a.start + a.newContent));
  const result = {
    page: { bytes: html.length, links: (html.match(/<a /g) || []).length, paragraphs: (html.match(/<p>/g) || []).length },
    runs: RUNS,
    loadScriptsMs: median(runs.map((r) => r.startup.parse)),
    applyAllMs: median(runs.map((r) => r.startup.applied)),
    newContentMs: median(runs.map((r) => Object.values(r.newContent).reduce((a, b) => a + b, 0))),
    longTasksMs: median(runs.map((r) => r.longTasks)),
    baselineLongTasksMs: median(baseline),
    heapMB: median(runs.map((r) => r.heapMB)),
    perTool
  };
  console.log(`Page: ${result.page.paragraphs} paragraphs, ${result.page.links} links, ${(result.page.bytes / 1024).toFixed(0)} KB. ${RUNS} runs, median.`);
  console.log(`Load Ease's scripts:       ${result.loadScriptsMs.toFixed(1)} ms`);
  console.log(`Apply all tools at start:  ${result.applyAllMs.toFixed(1)} ms`);
  console.log(`100 new paragraphs:        ${result.newContentMs.toFixed(1)} ms`);
  console.log(`Page blocked (long tasks):  ${result.longTasksMs.toFixed(0)} ms with Ease, ${result.baselineLongTasksMs.toFixed(0)} ms without -> Ease adds ${Math.max(0, result.longTasksMs - result.baselineLongTasksMs).toFixed(0)} ms`);
  console.log(`Memory used by Ease:       ${result.heapMB.toFixed(1)} MB`);
  console.log("\nSlowest tools (start-up ms / new content ms):");
  perTool.slice(0, 12).forEach((t) => console.log(`  ${t.id.padEnd(18)} ${t.start.toFixed(2).padStart(7)}  ${t.newContent.toFixed(2).padStart(7)}`));
  if (process.env.OUT) {
    fs.writeFileSync(process.env.OUT, JSON.stringify(result, null, 2));
  }
  await browser.close();
  s.close();
})();
