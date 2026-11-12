// Typing Filter ("bounce keys").
// With tremor or Parkinson's, one key press often types the letter twice ("hhello"),
// or a finger rests too long and the letter repeats ("helllllo").
// This filter ignores:
//   - the same key pressed again very quickly
//   - a key that repeats because it is held down
// Windows and Mac have this setting ("Filter Keys" / "Slow Keys"), but most people never find it.
//
// Only works in text boxes. Shortcuts (Ctrl, Cmd, Alt) and Backspace are never blocked.

(function () {
  const Ease = globalThis.Ease;

  const WAIT = { light: 150, strong: 300 }; // ms between two presses of the same key

  let enabled = false;
  let wait = 150;
  let lastKey = "";
  let lastTime = 0;

  function isTextBox(element) {
    if (!element) {
      return false;
    }
    if (element.isContentEditable || element.tagName === "TEXTAREA") {
      return true;
    }
    if (element.tagName !== "INPUT") {
      return false;
    }
    const type = (element.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "email", "url", "tel", "password", "number"].includes(type);
  }

  function onKeyDown(event) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      return; // typing Chinese or other languages with a helper, or a shortcut
    }
    if (event.key.length !== 1) {
      return; // Backspace, Enter, arrows and other special keys
    }
    const target = event.composedPath ? event.composedPath()[0] : event.target;
    if (!isTextBox(target)) {
      return;
    }
    const now = event.timeStamp || performance.now();
    const sameKeyTooSoon = event.key === lastKey && now - lastTime < wait;
    if (event.repeat || sameKeyTooSoon) {
      event.preventDefault(); // the letter is not typed
      return;
    }
    lastKey = event.key;
    lastTime = now;
  }

  Ease.engine.register({
    id: "typing-filter",
    observe: false,

    apply(settings) {
      const level = settings.typingFilter;
      if (!WAIT[level]) {
        this.remove();
        return;
      }
      wait = WAIT[level];
      if (!enabled) {
        enabled = true;
        document.addEventListener("keydown", onKeyDown, true);
      }
    },

    remove() {
      if (!enabled) {
        return;
      }
      enabled = false;
      document.removeEventListener("keydown", onKeyDown, true);
      lastKey = "";
    }
  });
})();
