// On-device AI helper (Chrome's built-in Prompt API, Gemini Nano).
// Used by "Explain simply" and "Show me how".
//
// Everything runs ON THIS DEVICE. The text is never sent to a server.
//
// Where it runs:
//   - In the popup and in the hidden helper page (offscreen/helper.html), the API is
//     available directly, so we call it here.
//   - On websites (content scripts), we send the request to the background, which uses
//     the helper page. See Ease.ai.ask() below.
//
// The model must be downloaded once (a large download). Chrome only starts the download
// after a click, so the popup has a "Set up" button (My Settings > AI helpers).
//
// Chrome's model writes English, Spanish and Japanese. For other languages we write in
// English, then use Chrome's on-device translator, like Summarize does.
//
// Speed:
//   - One "warm" session per system prompt is kept for 30 minutes. Each request uses a clone
//     of it, so Chrome does not load the model and read the rules again every time.
//   - warm() starts that work early (for example when the user selects text).
//   - stream() gives the answer while it is being written, so the first point shows fast.

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  const MODEL_LANGUAGES = ["en", "es", "ja"];
  const hasApi = () => typeof globalThis.LanguageModel !== "undefined";

  function targetFor(code) {
    const lang = (Ease.LANGUAGES || []).find((l) => l.code === code);
    return lang ? lang.translator : null;
  }

  function options(language) {
    const target = targetFor(language);
    const output = MODEL_LANGUAGES.includes(target) ? target : "en";
    return {
      output,
      target,
      create: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: [output] }]
      }
    };
  }

  // Translate every string inside a result (arrays and objects too).
  async function translateAll(value, from, to) {
    if (!to || to === from || typeof globalThis.Translator === "undefined") {
      return value;
    }
    let translator;
    try {
      translator = await Translator.create({ sourceLanguage: from, targetLanguage: to });
    } catch (error) {
      return value; // keep English if the translator is not ready
    }
    async function walk(item) {
      if (typeof item === "string") {
        return translator.translate(item);
      }
      if (Array.isArray(item)) {
        return Promise.all(item.map(walk));
      }
      if (item && typeof item === "object") {
        const out = {};
        for (const [key, inner] of Object.entries(item)) {
          out[key] = key === "index" || key === "done" ? inner : await walk(inner);
        }
        return out;
      }
      return item;
    }
    const result = await walk(value);
    if (translator.destroy) {
      translator.destroy();
    }
    return result;
  }

  // ---------- Warm sessions ----------
  const WARM_TIME = 30 * 60 * 1000; // keep the model ready for 30 minutes after the last use
  const warmSessions = new Map(); // "language|system" -> { promise, timer }

  function warmBase(task) {
    const opts = options(task.language);
    const key = task.language + "|" + task.system;
    let entry = warmSessions.get(key);
    if (!entry) {
      entry = {
        promise: LanguageModel.create({ ...opts.create, initialPrompts: [{ role: "system", content: task.system }] })
      };
      entry.promise.catch(() => warmSessions.delete(key)); // try again next time
      warmSessions.set(key, entry);
    }
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      warmSessions.delete(key);
      entry.promise.then((session) => session.destroy(), () => {});
    }, WARM_TIME);
    return entry.promise;
  }

  async function readyCheck(language) {
    const state = await direct.status(language);
    if (state === "download" || state === "downloading") {
      throw new Error("needs-setup");
    }
    if (state !== "ready") {
      throw new Error("no-api");
    }
  }

  // A fresh session with the rules already read.
  async function sessionFor(task, signal) {
    if (!warmSessions.has(task.language + "|" + task.system)) {
      await readyCheck(task.language); // only the first time: availability() takes time too
    }
    const base = await warmBase(task);
    return base.clone(signal ? { signal } : undefined);
  }

  async function makeTranslator(from, to) {
    if (!to || to === from || typeof globalThis.Translator === "undefined") {
      return null;
    }
    try {
      return await Translator.create({ sourceLanguage: from, targetLanguage: to });
    } catch (error) {
      return null; // keep English if the translator is not ready
    }
  }

  // Direct calls (only where the API exists).
  const direct = {
    // "ready" | "download" | "downloading" | "no"
    async status(language) {
      if (!hasApi()) {
        return "no";
      }
      try {
        const state = await LanguageModel.availability(options(language).create);
        return state === "available" ? "ready" : state === "downloadable" ? "download" : state === "downloading" ? "downloading" : "no";
      } catch (error) {
        return "no";
      }
    },

    // Must be called right after a click (Chrome needs that to start the download).
    async setUp(language, onProgress) {
      if (!hasApi()) {
        throw new Error("no-api");
      }
      const session = await LanguageModel.create({
        ...options(language).create,
        monitor(m) {
          m.addEventListener("downloadprogress", (event) => onProgress && onProgress(Math.round((event.loaded || 0) * 100)));
        }
      });
      session.destroy();
      return "ready";
    },

    // task = { system, prompt, schema, language }. Returns the parsed JSON answer.
    async ask(task) {
      if (!hasApi()) {
        throw new Error("no-api");
      }
      const opts = options(task.language);
      const session = await sessionFor(task);
      try {
        const answer = await session.prompt(task.prompt, { responseConstraint: task.schema });
        const parsed = JSON.parse(answer);
        return task.translate === false ? parsed : await translateAll(parsed, opts.output, opts.target);
      } finally {
        session.destroy();
      }
    },

    // Load the model and read the rules now, so the real request is fast.
    async warm(task) {
      if (!hasApi() || (await direct.status(task.language)) !== "ready") {
        return false;
      }
      await warmBase(task);
      return true;
    },

    // Plain-text answer, given while it is written. onText(textSoFar) is called many times.
    // Languages the model can not write: each finished line is translated, then shown.
    async stream(task, onText, signal) {
      if (!hasApi()) {
        throw new Error("no-api");
      }
      const opts = options(task.language);
      const start = Date.now();
      const timing = {};
      const session = await sessionFor(task, signal);
      timing.ready = Date.now() - start;
      const translator = opts.output !== opts.target ? await makeTranslator(opts.output, opts.target) : null;
      const done = []; // translated finished lines
      let text = "";
      async function shown(final) {
        if (!translator) {
          return text;
        }
        const lines = text.split("\n");
        const finished = final ? lines : lines.slice(0, -1);
        while (done.length < finished.length) {
          const line = finished[done.length];
          done.push(line.trim() ? await translator.translate(line) : line);
        }
        return done.join("\n");
      }
      try {
        const stream = session.promptStreaming(task.prompt, signal ? { signal } : undefined);
        for await (const chunk of stream) {
          // Newer Chrome sends only the new part. Older Chrome sent the whole text so far.
          text = text && chunk.startsWith(text) ? chunk : text + chunk;
          if (timing.first === undefined) {
            timing.first = Date.now() - start;
          }
          onText(await shown(false));
        }
        const final = await shown(true);
        timing.done = Date.now() - start;
        onText(final);
        direct.lastTiming = timing;
        return final;
      } finally {
        session.destroy();
        if (translator && translator.destroy) {
          translator.destroy();
        }
      }
    }
  };

  Ease.ai = {
    direct,
    hasApi,

    // From any context. On websites, the background answers.
    async ask(task) {
      if (hasApi()) {
        return direct.ask(task);
      }
      const reply = await chrome.runtime.sendMessage({ type: "aiAsk", task });
      if (!reply || reply.error) {
        throw new Error((reply && reply.error) || "no-api");
      }
      return reply.result;
    },

    // Start loading early. Never throws.
    warm(task) {
      if (hasApi()) {
        return direct.warm(task).catch(() => false);
      }
      return chrome.runtime.sendMessage({ type: "aiWarm", task }).catch(() => false);
    },

    // Streamed answer. Returns { done: Promise<text>, stop() }.
    stream(task, onText) {
      if (hasApi()) {
        const controller = new AbortController();
        return { done: direct.stream(task, onText, controller.signal), stop: () => controller.abort() };
      }
      // On websites: a port to the background. Closing the port stops the AI.
      const port = chrome.runtime.connect({ name: "ai" });
      let finish;
      let fail;
      const done = new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      port.onMessage.addListener((message) => {
        if (message.error) {
          fail(new Error(message.error));
        } else if (message.done) {
          if (message.timing) {
            const s = (ms) => (ms / 1000).toFixed(1) + " s";
            console.info(`[Ease AI] ready ${s(message.timing.ready)} · first words ${s(message.timing.first)} · done ${s(message.timing.done)}`);
          }
          finish(message.text);
        } else {
          onText(message.text);
        }
      });
      port.onDisconnect.addListener(() => fail(new Error("failed")));
      port.postMessage({ type: "aiStream", task });
      done.catch(() => {}).finally(() => port.disconnect());
      return { done, stop: () => port.disconnect() };
    },

    async status(language) {
      if (hasApi()) {
        return direct.status(language);
      }
      const reply = await chrome.runtime.sendMessage({ type: "aiStatus", language });
      return (reply && reply.status) || "no";
    }
  };
})();
