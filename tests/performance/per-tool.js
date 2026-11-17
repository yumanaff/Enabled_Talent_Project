// Turns on ONE tool at a time and measures how long the page is blocked (long tasks),
// compared with no tools. Finds tools whose CSS makes the browser redraw the whole page.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { makePage } = require("./make-page");
const EXT = path.resolve(__dirname, "../../extension") + "/";
const manifest = JSON.parse(fs.readFileSync(EXT + "manifest.json", "utf8"));
const CONTENT = manifest.content_scripts[0].js.map((f) => fs.readFileSync(EXT + f, "utf8"));
const RUNS = Number(process.env.RUNS || 3);
const median = (l) => { const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const ONE = process.env.COMBOS ? JSON.parse(process.env.COMBOS) : { none: {}, textSize: { textSize: 150 }, lineHeight: { lineHeight: "wide" }, letterSpacing: { letterSpacing: "wide" }, fontFamily: { fontFamily: "atkinson" },
  contrast_dark: { contrast: "dark" }, contrast_soft: { contrast: "soft" }, monochrome: { monochrome: true }, highlightLinks: { highlightLinks: true }, highlightTitles: { highlightTitles: true },
  bigCursor: { bigCursor: true }, focusIndicator: { focusIndicator: true }, pauseAnimations: { pauseAnimations: true }, calmMode: { calmMode: true }, biggerTargets: { biggerTargets: true },
  readingGuide: { readingGuide: "line" }, triggerBlur: { triggerBlur: true, triggerWords: ["bike"] }, pressureRemover: { pressureRemover: true }, iconLabels: { iconLabels: true }, hidePopups: { hidePopups: true }, safeLinks: { safeLinks: true }, readingGoals: { readingGoals: true }, scrollButtons: { scrollButtons: true } };
(async () => {
  const html = makePage();
  const s = http.createServer((req, res) => { if (req.url.startsWith("/locales/")) { res.end(fs.readFileSync(EXT + req.url.slice(1))); return; } res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); });
  await new Promise((r) => s.listen(0, r));
  const base = "http://localhost:" + s.address().port + "/";
  const browser = await chromium.launch();
  const rows = [];
  for (const [name, extra] of Object.entries(ONE)) {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.addInitScript(`const o = { mySettings: ${JSON.stringify({ language: "en", ...extra })} };
        const area = (x) => ({ get: async (k) => { if (typeof k === "string") k = [k]; const r = {}; for (const y of k) if (x[y] !== undefined) r[y] = x[y]; return r; }, set: async (v) => Object.assign(x, v) });
        window.chrome = { storage: { local: area(o), onChanged: { addListener() {} } }, runtime: { getURL: (p) => "${base}" + p, onMessage: { addListener() {} }, sendMessage() {} } };
        window.__lt = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt += e.duration; }).observe({ type: "longtask", buffered: true });`);
      await page.goto(base); await page.waitForLoadState("load");
      await page.evaluate(() => document.body.getBoundingClientRect());
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => window.__lt);
      if (name !== "none") {
        await page.evaluate((scripts) => scripts.forEach((code) => new Function(code)()), CONTENT);
      }
      await page.waitForTimeout(1800);
      await page.mouse.wheel(0, 4000); await page.waitForTimeout(500);
      times.push((await page.evaluate(() => window.__lt)) - before);
      await page.close();
    }
    rows.push([name, median(times)]);
    console.log(name.padEnd(16), median(times).toFixed(0).padStart(6), "ms blocked");
  }
  await browser.close(); s.close();
})();
