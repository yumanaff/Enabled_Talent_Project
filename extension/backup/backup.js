// Backup page.
// Save: makes a small file (ease-settings-DATE.json) with the user's settings.
// Load: reads that file on another computer. Only known settings are loaded.
//
// The file never has form drafts or reading spots (those show what the user read or typed).

(async function () {
  const Ease = globalThis.Ease;
  const t = (key, params) => Ease.i18n.t(key, params);
  const $ = (id) => document.getElementById(id);

  const settings = await Ease.storage.loadMySettings();
  await Ease.i18n.load(settings.language); // also sets right-to-left for Arabic
  Ease.i18n.translatePage();
  document.title = t("appName") + " · " + t("bkTitle");

  function say(text, isError) {
    const message = $("message");
    message.textContent = text;
    message.className = "message" + (isError ? " error" : "");
    message.hidden = false;
  }

  $("save").addEventListener("click", async () => {
    const backup = await Ease.storage.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ease-settings-" + Ease.profiles.today() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    say(t("bkSaved"));
  });

  $("file").addEventListener("change", async () => {
    const file = $("file").files[0];
    $("file").value = ""; // so the same file can be picked again
    if (!file) {
      return;
    }
    if (file.size > 1024 * 1024) {
      say(t("bkBad"), true); // a settings file is tiny
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const result = await Ease.storage.importBackup(data);
      const saved = await Ease.storage.loadMySettings();
      await Ease.i18n.load(saved.language); // the file may have another language
      Ease.i18n.translatePage();
      say(t("bkLoaded", { n: result.settings, m: result.sites }));
    } catch (error) {
      say(t("bkBad"), true);
    }
  });
})();
