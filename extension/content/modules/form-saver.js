// Form Saver.
// Keeps what the user types into forms, so it is not lost if the page
// reloads, times out, or is closed by mistake.
// Helps slow typists, people with tremor, memory difficulties or fatigue.
//
// PRIVACY RULES (very important):
//   - NEVER save passwords, card numbers, security codes or ID numbers.
//   - NEVER save anything in a form that has a password field (login forms).
//   - Drafts stay on this device only, and are deleted after 24 hours.
//   - Drafts are deleted when the form is sent.

(function () {
  const Ease = globalThis.Ease;

  const pageKey = location.host + location.pathname;

  // Only these kinds of fields are saved.
  const FIELDS = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"]';

  // Field names or labels that look private. These are never saved.
  const PRIVATE = /pass|pwd|card|cc-|cvv|cvc|csc|ssn|\bsin\b|social|iban|account|routing|\bpin\b|otp|one-time|security|secret|token|health\s*card|licen[cs]e/i;

  let enabled = false;
  let offered = false; // we already showed the "Restore" bar on this page
  let saveTimer = null;
  let bar = null;

  // Is it safe to save this field?
  function isSafe(field) {
    if (field.disabled || field.readOnly || field.type === "password" || field.type === "hidden") {
      return false;
    }
    const hints = [field.name, field.id, field.autocomplete, field.getAttribute("aria-label"), field.placeholder].join(" ");
    if (PRIVATE.test(hints)) {
      return false;
    }
    const form = field.form || field.closest("form");
    if (form && form.querySelector('input[type="password"]')) {
      return false; // login or sign-up form: save nothing
    }
    return true;
  }

  function safeFields() {
    return [...document.querySelectorAll(FIELDS)].filter(isSafe);
  }

  // A stable name for each field, so we can find it again after a reload.
  function keysFor(fields) {
    const seen = {};
    return fields.map((field, index) => {
      const base = field.id ? "#" + field.id : field.name ? "n:" + field.name : "i:" + index;
      seen[base] = (seen[base] || 0) + 1;
      return base + "/" + seen[base];
    });
  }

  function saveNow() {
    const fields = safeFields();
    const keys = keysFor(fields);
    const values = {};
    fields.forEach((field, i) => {
      if (field.value.trim()) {
        values[keys[i]] = field.value.slice(0, 5000);
      }
    });
    Ease.storage.saveDraft(pageKey, values);
  }

  // Save one second after the user stops typing.
  function onInput(event) {
    if (!event.target.matches || !event.target.matches(FIELDS) || !isSafe(event.target)) {
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1000);
  }

  function onSubmit() {
    clearTimeout(saveTimer);
    Ease.storage.clearDraft(pageKey);
  }

  // Fill a field in a way that also works with React and similar sites.
  function fill(field, value) {
    const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function restore(draft) {
    const fields = safeFields();
    const keys = keysFor(fields);
    fields.forEach((field, i) => {
      const value = draft.fields[keys[i]];
      if (value && !field.value) {
        fill(field, value);
      }
    });
  }

  function hideBar() {
    if (bar) {
      bar.remove();
      bar = null;
    }
  }

  // A small bar at the top: "Ease kept what you typed · Restore · Dismiss"
  function showBar(draft) {
    const minutes = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60000));
    bar = document.createElement("div");
    bar.id = "ease-form-saver";
    bar.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;";
    const shadow = bar.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .box { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
             border-radius: 12px; background: #FBEDE5; color: #6B2E10;
             border: 1px solid #E5C9B8; box-shadow: 0 6px 18px rgba(0,0,0,0.16);
             font: 400 14px/1.4 system-ui, sans-serif; max-width: 90vw; }
      strong { font-weight: 700; }
      button { height: 36px; padding: 0 12px; border-radius: 9px; cursor: pointer;
               font: 700 14px/1 system-ui, sans-serif; }
      .restore { border: none; background: #8C3A14; color: #FFFFFF; }
      .dismiss { border: 1px solid #E5C9B8; background: transparent; color: #6B2E10; }
      button:focus-visible { outline: 3px solid #4A5A8C; outline-offset: 2px; }`;
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "status");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = Ease.i18n.t("formSavedTitle") + " ";
    text.append(title, Ease.i18n.t("formSavedAgo", { n: minutes }));
    const restoreButton = document.createElement("button");
    restoreButton.className = "restore";
    restoreButton.textContent = Ease.i18n.t("formRestore");
    restoreButton.addEventListener("click", () => {
      restore(draft);
      hideBar();
    });
    const dismissButton = document.createElement("button");
    dismissButton.className = "dismiss";
    dismissButton.textContent = Ease.i18n.t("formDismiss");
    dismissButton.addEventListener("click", () => {
      Ease.storage.clearDraft(pageKey);
      hideBar();
    });
    box.append(text, restoreButton, dismissButton);
    shadow.append(style, box);
    document.documentElement.appendChild(bar);
  }

  // Offer to restore only if a saved field is empty now.
  async function offerRestore() {
    offered = true;
    const draft = await Ease.storage.loadDraft(pageKey);
    if (!draft || !enabled) {
      return;
    }
    const fields = safeFields();
    const keys = keysFor(fields);
    const canRestore = fields.some((field, i) => draft.fields[keys[i]] && !field.value);
    if (canRestore) {
      showBar(draft);
    } else {
      offered = false; // fields may load later (for example on single-page apps)
    }
  }

  Ease.engine.register({
    id: "form-saver",
    observe: true, // forms can appear after the page loads

    apply(settings) {
      if (!settings.formSaver) {
        this.remove();
        return;
      }
      if (!enabled) {
        enabled = true;
        document.addEventListener("input", onInput, true);
        document.addEventListener("submit", onSubmit, true);
      }
      if (!offered) {
        offerRestore();
      }
    },

    remove() {
      enabled = false;
      clearTimeout(saveTimer);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      hideBar();
    }
  });
})();
