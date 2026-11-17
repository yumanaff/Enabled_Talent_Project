// Summarize.
// Makes 3 to 5 short points from the article on the current page.
// It uses Chrome's built-in Summarizer, which runs ON THIS DEVICE.
// The page text is never sent to a server.
//
// Chrome supports summaries in English, Spanish and Japanese.
// For other languages, we make the summary in English, then use
// Chrome's on-device translator to change it into the user's language.
//
// Chrome downloads the Summarizer model once, and only after a click.
// So start() must be called FIRST in the click handler, before any "await".

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  const SUMMARY_LANGUAGES = ["en", "es", "ja"];
  const MAX_INPUT = 12000; // characters. Long pages: we use the beginning.

  function targetFor(code) {
    const lang = Ease.LANGUAGES.find((l) => l.code === code);
    return lang ? lang.translator : null;
  }

  // Turn "* First point\n* Second point" into ["First point", "Second point"].
  function toPoints(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => line.replace(/^[\s*\-•·\d.)]+/, "").trim())
      .filter((line) => line.length > 1)
      .slice(0, 5);
  }

  Ease.summarize = {
    // Call this straight away in the click handler.
    // Returns a promise of a Summarizer, or throws an Error with a simple code.
    start(userLanguage, onProgress) {
      if (typeof Summarizer === "undefined") {
        return Promise.reject(new Error("no-api"));
      }
      const target = targetFor(userLanguage);
      const outputLanguage = SUMMARY_LANGUAGES.includes(target) ? target : "en";
      return Summarizer.create({
        type: "key-points",
        format: "plain-text",
        length: "short",
        outputLanguage,
        sharedContext: "A web page. The reader may be tired or find reading hard. Use short, simple sentences.",
        monitor(m) {
          m.addEventListener("downloadprogress", (event) => {
            if (onProgress) {
              onProgress(Math.round((event.loaded || 0) * 100));
            }
          });
        }
      })
        .then((summarizer) => ({ summarizer, outputLanguage }))
        .catch((error) => {
          const name = error && error.name;
          throw new Error(name === "NotSupportedError" || name === "OperationError" ? "unavailable" : name === "NotAllowedError" ? "needs-click" : "failed");
        });
    },

    // Make the points. Returns { points: [...], language: "en" | "es" | ... }
    // onPartial(points) shows the points while Chrome is still writing them,
    // so the user sees something quickly. (Not used when we translate after.)
    async run(started, article, userLanguage, onPartial) {
      const { summarizer, outputLanguage } = await started;
      const text = (article && article.text) || "";
      if (text.length < 400) {
        throw new Error("no-text");
      }
      const target = targetFor(userLanguage);
      const willTranslate = target && target !== outputLanguage;
      const show = !willTranslate && onPartial ? onPartial : null;

      async function write(input) {
        const options = { context: article.title || "" };
        if (!summarizer.summarizeStreaming) {
          return summarizer.summarize(input, options);
        }
        let result = "";
        for await (const chunk of summarizer.summarizeStreaming(input, options)) {
          result += chunk; // each chunk has the next few words
          if (show) {
            show(toPoints(result));
          }
        }
        return result;
      }

      let result;
      try {
        result = await write(text.slice(0, MAX_INPUT));
      } catch (error) {
        // Too long for this computer: try a shorter part.
        result = await write(text.slice(0, 4000));
      }
      if (summarizer.destroy) {
        summarizer.destroy();
      }
      let points = toPoints(result);
      let language = outputLanguage;

      // Change the points into the user's language, if Chrome can do it on this device.
      if (willTranslate && typeof Translator !== "undefined") {
        try {
          const translator = await Translator.create({ sourceLanguage: outputLanguage, targetLanguage: target });
          points = await Promise.all(points.map((point) => translator.translate(point)));
          language = target;
          if (translator.destroy) {
            translator.destroy();
          }
        } catch (error) {
          // The language is not downloaded yet: keep the summary in English.
        }
      }
      return { points, language };
    },

    toPoints
  };
})();
