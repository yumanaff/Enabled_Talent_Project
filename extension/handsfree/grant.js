// Chrome can not ask for the camera inside the side panel. This tab asks once.
// After "Allow", the side panel can use the camera and the microphone.
(async function () {
  const Ease = globalThis.Ease;
  const mine = await Ease.storage.loadMySettings();
  await Ease.i18n.load(mine.language);
  Ease.i18n.translatePage();
  const result = document.getElementById("result");
  document.getElementById("grant").addEventListener("click", async () => {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (error) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true }); // no microphone: head only
      } catch (second) {
        result.textContent = Ease.i18n.t("hfGrantDenied");
        return;
      }
    }
    stream.getTracks().forEach((track) => track.stop());
    result.textContent = Ease.i18n.t("hfGrantDone");
    chrome.runtime.sendMessage({ type: "hfGranted" }).catch(() => {});
  });
})();
