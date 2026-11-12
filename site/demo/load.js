// Loads the extension's own files, in the same order as Chrome does (manifest.json).
// The list comes from ext/files.js (made by site/tools/build-demo.js).
(async function () {
  const list = window.EASE_DEMO_FILES;
  for (const file of list.scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "ext/" + file;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  // "*": a page opened from a file has no origin.
  window.parent.postMessage({ easeHub: true, op: "ready", version: list.version, host: window.EASE_DEMO_HOST }, "*");
})();
