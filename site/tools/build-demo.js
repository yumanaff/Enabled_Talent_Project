// Copies the real extension code into site/demo/ext, so the website demo runs the same code.
// Run after changing the extension:  node site/tools/build-demo.js
const fs = require("fs");
const path = require("path");

const EXT = path.resolve(__dirname, "../../extension");
const OUT = path.resolve(__dirname, "../demo/ext");
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
const scripts = manifest.content_scripts.find((c) => c.world !== "MAIN").js;

fs.rmSync(OUT, { recursive: true, force: true });
function copy(rel) {
  const from = path.join(EXT, rel);
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
scripts.forEach(copy);
["locales", "fonts", "popup", "shared/translator-setup.js"].forEach(copy);

// The real popup, with the demo's stand-in for Chrome loaded first.
const popupPath = path.join(OUT, "popup", "popup.html");
let popupHtml = fs.readFileSync(popupPath, "utf8");
const firstScript = popupHtml.indexOf("<script");
popupHtml = popupHtml.slice(0, firstScript) +
  '<script src="../locales.js"></script>\n  <script src="../../shim.js"></script>\n  ' +
  popupHtml.slice(firstScript);
fs.writeFileSync(popupPath, popupHtml);
// Pages opened straight from a file can not use fetch(). So the file list and the English text
// are written as small scripts, which load everywhere.
const enPath = path.join(OUT, "locales", "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
// The demo plays a recorded "Explain simply" answer when the browser has no built-in AI. Say so.
en.aiFooter = "Demo: if your browser has no built-in AI, this is a recorded example. In Chrome, the AI runs on your device. AI can make mistakes.";
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "files.js"), "window.EASE_DEMO_FILES = " + JSON.stringify({ version: manifest.version, scripts }) + ";\n");
// All languages: the popup has a language menu.
const locales = {};
for (const file of fs.readdirSync(path.join(OUT, "locales"))) {
  locales[file.replace(".json", "")] = JSON.parse(fs.readFileSync(path.join(OUT, "locales", file), "utf8"));
}
locales.en = en;
fs.writeFileSync(path.join(OUT, "locales.js"), "window.EASE_DEMO_LOCALES = " + JSON.stringify(locales) + ";\n");

// Time limits use the website's address. A page opened from a file has none, so the demo gives it one.
const timePath = path.join(OUT, "content/modules/time-limits.js");
const timeCode = fs.readFileSync(timePath, "utf8");
if (!timeCode.includes("Ease.timeRules.limitFor(location.hostname")) {
  throw new Error("time-limits.js changed: update the demo patch in build-demo.js");
}
fs.writeFileSync(timePath, timeCode.replace("Ease.timeRules.limitFor(location.hostname", "Ease.timeRules.limitFor(window.EASE_DEMO_HOST || location.hostname"));
// Settings for "this site" use the website's address. The demo website is always "dailyexample.news".
const mainPath = path.join(OUT, "content/main.js");
const mainCode = fs.readFileSync(mainPath, "utf8");
if (!mainCode.includes("const host = location.hostname;")) {
  throw new Error("main.js changed: update the demo patch in build-demo.js");
}
fs.writeFileSync(mainPath, mainCode.replace("const host = location.hostname;", "const host = window.EASE_DEMO_HOST || location.hostname;"));
console.log(`Copied ${scripts.length} scripts, locales and fonts (version ${manifest.version}).`);
