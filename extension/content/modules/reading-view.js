// Reading View.
// One button in the popup turns a busy article into a clean page:
// just the title, the text and the pictures. No ads, sidebars or pop-ups.
//
// The clean page is part of the website's page (not a new tab), so every other
// Ease tool still works on it: text size, font, spacing, contrast, Read Aloud,
// reading guide, translation and trigger words.
//
// Finding the article is done by Mozilla's Readability library (lib/readability, Apache 2.0).
// This file also gives the article text to the popup for "Summarize".

(function () {
  const Ease = globalThis.Ease;

  let overlay = null;
  let lastFocus = null;
  let notice = null;

  // Tags and attributes we keep from the article. Everything else is removed,
  // so nothing from the website can run inside the clean page.
  const DROP_TAGS = "script, style, link, meta, iframe, frame, object, embed, form, input, button, select, textarea, noscript, svg, canvas, video, audio, template";
  const KEEP_ATTRS = ["href", "src", "alt", "title", "colspan", "rowspan", "lang", "dir"];

  // ---------- Finding the article ----------

  function parse() {
    if (typeof Readability !== "function" || !document.body) {
      return null;
    }
    try {
      const copy = document.cloneNode(true);
      for (const ours of copy.querySelectorAll("[id^='ease-'], .ease-chip, .ease-icon-label")) {
        ours.remove();
      }
      const article = new Readability(copy, { charThreshold: 300 }).parse();
      if (!article || !article.textContent || article.textContent.trim().length < 300) {
        return null;
      }
      return article;
    } catch (error) {
      console.warn("[Ease] Reading view could not read this page:", error);
      return null;
    }
  }

  function safeUrl(value, allowData) {
    try {
      const url = new URL(value, location.href);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
        return url.href;
      }
      if (allowData && url.protocol === "data:" && /^data:image\//i.test(value)) {
        return value;
      }
    } catch (error) {
      // bad address: drop it
    }
    return null;
  }

  // Turn the article HTML into safe elements.
  function cleanContent(html) {
    const doc = new DOMParser().parseFromString(html, "text/html"); // inert: nothing runs here
    for (const element of doc.body.querySelectorAll(DROP_TAGS)) {
      element.remove();
    }
    for (const element of doc.body.querySelectorAll("*")) {
      for (const attr of [...element.attributes]) {
        const name = attr.name.toLowerCase();
        if (!KEEP_ATTRS.includes(name)) {
          element.removeAttribute(attr.name);
        } else if (name === "href" || name === "src") {
          const url = safeUrl(attr.value, name === "src");
          if (url) {
            element.setAttribute(name, url);
          } else {
            element.removeAttribute(attr.name);
          }
        }
      }
      if (element.tagName === "IMG") {
        element.setAttribute("loading", "lazy");
      }
    }
    const fragment = document.createDocumentFragment();
    for (const node of [...doc.body.childNodes]) {
      fragment.appendChild(document.importNode(node, true));
    }
    return fragment;
  }

  // ---------- The clean page ----------

  const CSS = `
    html, body { overflow: hidden !important; }
    #ease-reader {
      all: initial; display: block !important; position: fixed !important; inset: 0 !important;
      z-index: 2147483645 !important; overflow-y: auto !important;
      background: #FBFBF9 !important; color: #2A2F36 !important;
    }
    #ease-reader * { all: revert; }
    #ease-reader .er-top {
      position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 16px; background: #F1F1EC; border-bottom: 1px solid #DDDDD6;
      font: 400 0.9rem/1.3 system-ui, sans-serif; color: #555B66;
    }
    #ease-reader .er-close {
      min-height: 40px; padding: 0 16px; border: none; border-radius: 10px; cursor: pointer;
      background: #4A5A8C; color: #FBFBF9; font: 700 0.95rem/1 system-ui, sans-serif;
    }
    #ease-reader .er-close:focus-visible { outline: 3px solid #34406A; outline-offset: 2px; }
    #ease-reader .er-article {
      display: block; max-width: 40em; margin: 0 auto; padding: 24px 20px 96px;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 1.2rem; line-height: 1.7;
      color: #2A2F36; overflow-wrap: break-word;
    }
    #ease-reader .er-title { font-size: 1.9em; line-height: 1.25; margin: 0.4em 0 0.3em; }
    #ease-reader .er-meta { color: #555B66; font-size: 0.9em; margin: 0 0 1.6em; }
    #ease-reader .er-body p, #ease-reader .er-body li { margin: 0 0 1em; }
    #ease-reader .er-body h2, #ease-reader .er-body h3, #ease-reader .er-body h4 { line-height: 1.3; margin: 1.6em 0 0.5em; }
    #ease-reader .er-body a { color: #34406A; text-decoration: underline; }
    #ease-reader .er-body img, #ease-reader .er-body picture { display: block; max-width: 100%; height: auto; margin: 1em auto; border-radius: 6px; }
    #ease-reader .er-body figcaption { font-size: 0.85em; color: #555B66; text-align: center; }
    #ease-reader .er-body blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #DDDDD6; }
    #ease-reader .er-body pre { white-space: pre-wrap; background: #F1F1EC; padding: 12px; border-radius: 8px; font-size: 0.9em; }
    #ease-reader .er-body table { border-collapse: collapse; max-width: 100%; display: block; overflow-x: auto; }
    #ease-reader .er-body td, #ease-reader .er-body th { border: 1px solid #DDDDD6; padding: 6px 8px; }`;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    if (text) {
      el.textContent = text;
    }
    return el;
  }

  function showNotice(text) {
    hideNotice();
    notice = element("div", "", "");
    notice.id = "ease-reader-notice";
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);max-width:92vw;" +
      "padding:10px 14px;border-radius:12px;background:#FBFBF9;color:#2A2F36;border:1px solid #DDDDD6;" +
      "box-shadow:0 6px 18px rgba(0,0,0,0.16);font:400 14px/1.4 system-ui,sans-serif;";
    notice.textContent = text;
    document.documentElement.appendChild(notice);
    setTimeout(hideNotice, 5000);
  }

  function hideNotice() {
    if (notice) {
      notice.remove();
      notice = null;
    }
  }

  function open() {
    if (overlay) {
      return;
    }
    const article = parse();
    if (!article) {
      showNotice(Ease.i18n.t("rvNoArticle"));
      return;
    }
    lastFocus = document.activeElement;
    Ease.engine.setStyle("reading-view", CSS);

    overlay = element("div");
    overlay.id = "ease-reader";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", article.title || document.title);

    const top = element("div", "er-top");
    top.append(element("span", "", article.siteName || location.hostname));
    const close = element("button", "er-close", Ease.i18n.t("rvClose"));
    close.type = "button";
    close.addEventListener("click", closeView);
    top.append(close);

    const body = element("article", "er-article");
    if (article.lang || document.documentElement.lang) {
      body.lang = article.lang || document.documentElement.lang;
    }
    body.append(element("h1", "er-title", article.title || document.title));
    const words = article.textContent.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 200));
    const meta = [article.byline, Ease.i18n.t("rvMinutes", { n: minutes })].filter(Boolean).join(" · ");
    body.append(element("p", "er-meta", meta));
    const content = element("div", "er-body");
    content.appendChild(cleanContent(article.content));
    body.append(content);

    overlay.append(top, body);
    document.body.appendChild(overlay);
    close.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey, true);
    Ease.engine.rescan(); // let other tools (like Trigger Blur) check the new text
  }

  function closeView() {
    if (!overlay) {
      return;
    }
    overlay.remove();
    overlay = null;
    Ease.engine.removeStyle("reading-view");
    document.removeEventListener("keydown", onKey, true);
    if (lastFocus && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
    }
  }

  function onKey(event) {
    if (event.key === "Escape") {
      closeView();
    }
  }

  // The popup's "Reading view" button.
  document.addEventListener("ease:readingView", () => {
    if (overlay) {
      closeView();
    } else {
      open();
    }
  });

  // The popup asks for the article text, to make a summary.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "getArticle") {
      return false;
    }
    const article = parse();
    const text = article ? article.textContent : document.body ? document.body.innerText : "";
    sendResponse({
      title: (article && article.title) || document.title,
      text: text.replace(/\s+/g, " ").trim(),
      lang: (document.documentElement.lang || "").toLowerCase()
    });
    return false;
  });

  // Reading view has no setting: it opens only when the user asks.
  // If Ease is turned off on this site, it closes.
  Ease.engine.register({
    id: "reading-view",
    observe: false,
    apply() {},
    remove() {
      closeView();
    }
  });
})();
