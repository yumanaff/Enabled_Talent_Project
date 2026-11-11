// Ease accessibility audit.
// Opens every Ease screen (popup, setup, backup) and the boxes Ease adds to websites,
// then checks them with axe-core: WCAG 2.2 A and AA, plus axe best practices.
//
// Run:  npm install   (once)
//       npm run audit
// It exits with code 1 if any problem is found, so CI can stop a bad change.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { serve } = require("./server");

const EXT = path.resolve(__dirname, "../../extension") + "/";
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const TODAY = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
let BASE = "";
let problems = 0;

// A fake "chrome" object, so extension pages can run in a normal tab.
const mock = (settings) => `
  const o = { mySettings: ${JSON.stringify(settings)}, readingLog: { days: {} } };
  const area = (x) => ({ get: async (k) => { if (k == null) return JSON.parse(JSON.stringify(x)); if (typeof k === "string") k = [k]; const r = {}; for (const y of k) if (x[y] !== undefined) r[y] = JSON.parse(JSON.stringify(x[y])); return r; }, set: async (v) => Object.assign(x, JSON.parse(JSON.stringify(v))) });
  window.chrome = { storage: { local: area(o), sync: area({}), session: area({}), onChanged: { addListener() {} } }, runtime: { getURL: (p) => "${BASE}" + p, onMessage: { addListener() {} } },
    tabs: { query: async () => [{ id: 1, url: "https://www.cbc.ca/news" }], sendMessage: async () => {}, create() {}, getCurrent(f) { f && f(null); }, remove() {} } };`;

async function audit(page, name) {
  await page.addScriptTag({ content: AXE });
  const found = await page.evaluate(async (tags) => {
    const result = await axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => `[${v.impact}] ${v.id} x${v.nodes.length}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }, TAGS);
  problems += found.length;
  console.log((found.length ? "FAIL " : "ok   ") + name + (found.length ? "" : ""));
  found.forEach((line) => console.log("       " + line));
}

const screens = [
  ["Popup: Home (new user)", "popup/popup.html", { language: "en", quizNudge: true }, null],
  ["Popup: Home (profiles, goal)", "popup/popup.html", { language: "en", profiles: ["olderAdults", "focusSupport"], readingGoals: true }, null],
  ["Popup: check-in", "popup/popup.html", { language: "en", dailyCheckin: true }, null],
  ["Popup: For me", "popup/popup.html", { language: "en", profiles: ["lowStress", "steadyHands"], lowEnergyDate: TODAY }, async (p) => { await p.click('.tab[data-tab="settings"]'); await p.click("#see-for-me"); }],
  ["Popup: My Settings list", "popup/popup.html", { language: "en", profiles: ["olderAdults"] }, async (p) => p.click('.tab[data-tab="settings"]')],
  ["Popup: Reading and seeing", "popup/popup.html", { language: "en" }, async (p) => { await p.click('.tab[data-tab="settings"]'); await p.click("#cat-reading"); }],
  ["Popup: Calm and focus", "popup/popup.html", { language: "en", timeLimits: ["instagram.com|60"] }, async (p) => { await p.click('.tab[data-tab="settings"]'); await p.click("#cat-calm"); }],
  ["Popup: Safety and AI helpers", "popup/popup.html", { language: "en" }, async (p) => { await p.click('.tab[data-tab="settings"]'); await p.click("#cat-safety"); }],
  ["Popup: Caregivers and backup", "popup/popup.html", { language: "en" }, async (p) => { await p.click('.tab[data-tab="settings"]'); await p.click("#cat-care"); }],
  ["Popup: This Site", "popup/popup.html", { language: "en", profiles: ["focusSupport"] }, async (p) => p.click('.tab[data-tab="site"]')],
  ["Popup: PIN screen", "popup/popup.html", { language: "en", lockHash: "00:00" }, async (p) => p.click('.tab[data-tab="settings"]')],
  ["Popup: tools picker", "popup/popup.html", { language: "en", profiles: ["olderAdults"] }, async (p) => p.click("#tools-change")],
  ["Popup: search results", "popup/popup.html", { language: "en" }, async (p) => p.fill("#home-search", "text")],
  ["Popup: Arabic (RTL)", "popup/popup.html", { language: "ar", profiles: ["cognitiveSupport"] }, null],
  ["Setup: welcome", "onboarding/welcome.html", { language: "en" }, null],
  ["Setup: needs", "onboarding/welcome.html", { language: "en" }, async (p) => p.click("button.primary")],
  ["Setup: quiz", "onboarding/welcome.html", { language: "en" }, async (p) => { await p.click("button.primary"); await p.click("button.choice"); await p.click("button.primary"); }],
  ["Setup: for someone else", "onboarding/welcome.html#for-someone", { language: "en" }, null],
  ["Backup page", "backup/backup.html", { language: "en" }, null]
];

(async () => {
  const ext = await serve(EXT);
  const site = await serve(path.join(__dirname, "site"));
  BASE = ext.base;
  const browser = await chromium.launch();

  // 1. Extension screens
  for (const [name, file, settings, act] of screens) {
    const page = await browser.newPage({ viewport: { width: file.startsWith("popup") ? 360 : 1100, height: 700 } });
    await page.addInitScript(mock(settings));
    await page.goto(BASE + file);
    await page.waitForTimeout(600);
    if (act) {
      await act(page);
      await page.waitForTimeout(400);
    }
    await audit(page, name);
    await page.close();
  }

  // 2. Boxes Ease adds to websites (content scripts injected into test pages)
  const manifest = JSON.parse(fs.readFileSync(EXT + "manifest.json", "utf8"));
  const scripts = manifest.content_scripts[0].js.map((f) => fs.readFileSync(EXT + f, "utf8"));
  const pageMock = (settings, extra) => `
    const o = { mySettings: ${JSON.stringify(settings)}, ...${JSON.stringify(extra || {})} };
    const area = (x) => ({ get: async (k) => { if (k == null) return JSON.parse(JSON.stringify(x)); if (typeof k === "string") k = [k]; const r = {}; for (const y of k) if (x[y] !== undefined) r[y] = JSON.parse(JSON.stringify(x[y])); return r; }, set: async (v) => Object.assign(x, JSON.parse(JSON.stringify(v))) });
    window.chrome = { storage: { local: area(o), onChanged: { addListener() {} } }, runtime: { getURL: (p) => "${BASE}" + p, onMessage: { addListener() {} }, sendMessage() {} } };`;
  const run = async (name, url, settings, extra, act) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await page.addInitScript(pageMock(settings, extra));
    await page.goto(url);
    await page.waitForTimeout(300);
    for (const code of scripts) {
      await page.addScriptTag({ content: code });
    }
    await page.waitForTimeout(1200);
    if (act) {
      await act(page);
    }
    await page.waitForTimeout(600);
    await audit(page, name);
    await page.close();
  };
  const A = site.base + "article.html";
  await run("Page: scroll buttons + reading bar + icon names", A, { language: "en", scrollButtons: true, readingGoals: true, iconLabels: true, focusIndicator: true });
  await run("Page: Safe links note (hover)", A, { language: "en", safeLinks: true }, null, async (p) => { await p.hover('a[href*="paypa1"]'); await p.waitForTimeout(600); });
  await run("Page: Safe links stop (click)", A, { language: "en", safeLinks: true }, null, async (p) => { await p.click('a[href*="paypa1"]'); });
  await run("Page: Big tooltip", A, { language: "en", bigTooltips: true }, null, async (p) => { await p.hover('button[aria-label="Open menu"]'); await p.waitForTimeout(600); });
  await run("Page: Reading view", A, { language: "en" }, null, async (p) => { await p.evaluate(() => document.dispatchEvent(new CustomEvent("ease:readingView"))); });
  await run("Page: Resume reading bar", A, { language: "en", resumeReading: true }, { readingSpots: { [new URL(site.base).host + "/article.html"]: { fraction: 0.5, snippet: "", savedAt: Date.now() } } });
  await run("Page: Trigger blur (sentence)", A, { language: "en", triggerBlur: true, triggerWords: ["storm"] });
  await run("Page: Scam warning", site.base + "scam.html", { language: "en", safeLinks: true });
  

  await browser.close();
  ext.server.close();
  site.server.close();
  console.log(problems ? `\n${problems} problem(s) found.` : "\nNo accessibility problems found.");
  process.exit(problems ? 1 : 0);
})();
