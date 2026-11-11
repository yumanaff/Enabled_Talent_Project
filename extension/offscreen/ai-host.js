// Answers AI requests from the background (for "Explain simply" and "Show me how").
// The real work is in shared/ai.js. Nothing leaves this computer.

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.target !== "offscreen") {
    return;
  }
  if (message.type === "aiAsk") {
    globalThis.Ease.ai.direct.ask(message.task).then(
      (result) => reply({ result }),
      (error) => reply({ error: String((error && error.message) || "failed") })
    );
    return true;
  }
  if (message.type === "aiWarm") {
    globalThis.Ease.ai.direct.warm(message.task).then(reply, () => reply(false));
    return true;
  }
  if (message.type === "aiStatus") {
    globalThis.Ease.ai.direct.status(message.language).then((status) => reply({ status }));
    return true;
  }
});

// Streamed answers: the background opens a port and passes the text on to the website.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai-helper") {
    return;
  }
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener((message) => {
    if (!message || message.type !== "aiStream") {
      return;
    }
    const send = (data) => {
      try {
        port.postMessage(data);
      } catch (error) {
        // closed
      }
    };
    globalThis.Ease.ai.direct
      .stream(message.task, (text) => send({ text }), controller.signal)
      .then((text) => send({ done: true, text, timing: globalThis.Ease.ai.direct.lastTiming }), (error) => send({ error: String((error && error.message) || "failed") }))
      .finally(() => port.disconnect());
  });
});
