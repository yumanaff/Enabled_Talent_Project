// Popup logic.
// The popup only SAVES settings. The content script on each page APPLIES them.
//
// Screens:
//   Daily check-in -> shown once a day, if the user turned it on
//   Home           -> Calm, Low-energy day, search, text size, quick tools
//   My Settings    -> profiles and all tools
//   This Site      -> on/off and settings for the current website only
//
// The popup shows "global" settings: defaults + profiles + manual changes.
// When the user changes a tool, we save a MANUAL change. Manual changes win over profiles.

(async function () {
  const Ease = globalThis.Ease;
  const t = (key, params) => Ease.i18n.t(key, params);
  const $ = (id) => document.getElementById(id);

  // ---------- Tool list ----------
  // type "choice" = drop-down, "switch" = on/off.
  // "key" must match a setting in shared/defaults.js.
  // Text comes from the locale files (key name, and "option_" + value).
  // "page" = which of the 5 groups in My Settings. "sub" = small heading inside that page (optional).
  const TOOLS = [
    {
      page: "reading",
      sub: "subText",
      items: [
        { key: "lineHeight", type: "choice", options: ["normal", "wide", "extra"] },
        { key: "letterSpacing", type: "choice", options: ["normal", "wide", "extra"] },
        { key: "fontFamily", type: "choice", options: ["default", "readable", "atkinson", "dyslexic"] }
      ]
    },
    {
      page: "reading",
      sub: "groupSeeing",
      items: [
        { key: "contrast", type: "choice", options: ["normal", "dark", "high", "soft"] },
        { key: "monochrome", type: "switch" },
        { key: "highlightLinks", type: "switch" },
        { key: "highlightTitles", type: "switch" },
        { key: "bigCursor", type: "switch" },
        { key: "iconLabels", type: "switch" },
        { key: "bigTooltips", type: "switch" },
        { key: "hideImages", type: "switch" }
      ]
    },
    {
      page: "reading",
      sub: "subReadingHelp",
      items: [
        { key: "readingGuide", type: "choice", options: ["off", "line", "mask"] },
        { key: "readAloud", type: "choice", options: ["off", "slow", "normal", "fast"] },
        { key: "resumeReading", type: "switch" },
        { key: "readingGoals", type: "switch" },
        { key: "readingGoal", type: "choice", options: ["1", "3", "5"] },
        { key: "celebrateStyle", type: "choice", options: ["confetti", "calm", "none"] }
      ]
    },
    {
      page: "calm",
      items: [
        { key: "pauseAnimations", type: "switch" },
        { key: "hidePopups", type: "switch" },
        { key: "pressureRemover", type: "switch" },
        { key: "dailyCheckin", type: "switch" }
      ]
    },
    {
      page: "calm",
      sub: "groupHearing",
      items: [
        { key: "volumeLimit", type: "choice", options: ["off", "70", "50", "30", "15"] },
        { key: "soundAlert", type: "switch" }
      ]
    },
    {
      page: "calm",
      sub: "subTriggers",
      items: [
        { key: "triggerBlur", type: "switch" },
        { key: "triggerBlurSize", type: "choice", options: ["word", "sentence", "paragraph"] } // the word editor is added below
      ]
    },
    {
      page: "hands",
      items: [
        { key: "biggerTargets", type: "switch" },
        { key: "tremorFilter", type: "choice", options: ["off", "light", "strong"] },
        { key: "typingFilter", type: "choice", options: ["off", "light", "strong"] },
        { key: "scrollButtons", type: "switch" },
        { key: "sameTab", type: "switch" }
      ]
    },
    {
      page: "hands",
      sub: "subHandsFree",
      items: [
        { key: "handsFree", type: "switch" },
        { key: "handsFreeClick", type: "choice", options: ["dwell", "mouth", "brows"] },
        { key: "handsFreeHold", type: "choice", options: ["1", "1.5", "2", "3"], optionPrefix: "hold_" },
        { key: "handsFreeSpeed", type: "choice", options: ["slow", "normal", "fast"] },
        { key: "handsFreeDock", type: "switch" }
      ]
    },
    {
      page: "hands",
      sub: "subKeyboard",
      items: [
        { key: "focusIndicator", type: "switch" },
        { key: "skipToContent", type: "switch" }
      ]
    },
    {
      page: "safety",
      items: [
        { key: "safeLinks", type: "switch" },
        { key: "formSaver", type: "switch" }
      ]
    }
  ];

  // The 5 groups on the main My Settings list.
  const PAGES = [
    { id: "reading", icon: "👓", tint: "#E8EAF1" },
    { id: "calm", icon: "🌿", tint: "#E3F1E6" },
    { id: "hands", icon: "✋", tint: "#FBEDE5" },
    { id: "safety", icon: "🛡️", tint: "#EDE7F6" },
    { id: "care", icon: "👥", tint: "#F3EFE3" }
  ];

  // ---------- "My tools" on Home ----------
  // 3 tools, 1 tap away. Chosen from the user's profiles, unless they picked their own (homeTools).
  const TOOLS_FOR_PROFILE = {
    olderAdults: ["scrollButtons", "hidePopups", "bigCursor"],
    steadyHands: ["biggerTargets", "typingFilter", "scrollButtons"],
    focusSupport: ["readingGuide", "hidePopups", "readingGoals"],
    readingFocus: ["readingGuide", "lineHeight", "readAloud"],
    readableTypography: ["fontFamily", "letterSpacing", "readingGuide"],
    largeTextContrast: ["contrast", "bigCursor", "highlightLinks"],
    colorDifferentiation: ["highlightLinks", "monochrome", "contrast"],
    reducedMotion: ["pauseAnimations", "hidePopups", "contrast"],
    seizureSafe: ["pauseAnimations", "hidePopups", "volumeLimit"],
    sensoryCalm: ["volumeLimit", "hidePopups", "triggerBlur"],
    lightSensitivity: ["contrast", "pauseAnimations", "readingGuide"],
    lowStress: ["pressureRemover", "triggerBlur", "hidePopups"],
    hearingSupport: ["soundAlert", "volumeLimit", "readAloud"],
    cognitiveSupport: ["readAloud", "readingGuide", "iconLabels"],
    scamSafety: ["safeLinks", "sameTab", "hidePopups"]
  };
  const BASIC_TOOLS = ["contrast", "lineHeight"]; // always on Home as tiles, with text size
  const DEFAULT_HOME_TOOLS = ["readingGuide", "hidePopups", "pauseAnimations"];
  const MAX_HOME_TOOLS = 3;

  function homeToolsFor(settings) {
    const own = (settings.homeTools || []).filter((key) => findTool(key) && !BASIC_TOOLS.includes(key));
    if (own.length) {
      return own.slice(0, MAX_HOME_TOOLS);
    }
    const picked = [];
    for (const id of settings.profiles || []) {
      for (const key of TOOLS_FOR_PROFILE[id] || []) {
        if (!picked.includes(key) && !BASIC_TOOLS.includes(key)) {
          picked.push(key);
        }
      }
    }
    for (const key of DEFAULT_HOME_TOOLS) {
      if (!picked.includes(key)) {
        picked.push(key);
      }
    }
    return picked.slice(0, MAX_HOME_TOOLS);
  }

  const ALL_TOOLS = TOOLS.flatMap((section) => section.items);
  const findTool = (key) => ALL_TOOLS.find((tool) => tool.key === key);

  // ---------- Current website ----------
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try {
    const url = new URL(tab.url);
    if (url.protocol === "http:" || url.protocol === "https:") {
      host = url.hostname;
    }
  } catch (error) {
    host = "";
  }

  // ---------- Language ----------
  const firstSettings = await Ease.storage.loadMySettings();
  await Ease.i18n.load(firstSettings.language);
  Ease.i18n.translatePage();
  $("search").placeholder = t("searchPlaceholder");
  $("home-search").placeholder = t("searchPlaceholder");

  const languageSelect = $("language");
  for (const lang of Ease.LANGUAGES) {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    languageSelect.appendChild(option);
  }
  languageSelect.value = firstSettings.language;
  languageSelect.addEventListener("change", () => {
    const code = languageSelect.value;
    // Start the language download FIRST, while Chrome still counts this as the user's click.
    const download = Ease.translatorSetup.prepare(code, (p) => showTrStatus("trDownloading", { p }, code));
    (async () => {
      // Picking a non-English language also translates websites into it (the user can turn this off).
      await Ease.storage.saveMySettings({ language: code, translatePage: code !== "en" });
      await Ease.i18n.load(code); // so the download message is in the new language
      await download; // wait, so the download is not cut off by the reload
      location.reload(); // simplest way to redraw every text
    })();
  });

  // ---------- Translation status line ----------
  // Tells the user, in plain words, if their language is ready.

  function showTrStatus(key, params, code) {
    const lang = Ease.LANGUAGES.find((l) => l.code === code);
    const el = $("tr-status");
    el.textContent = t(key, { lang: lang ? lang.name : code, ...(params || {}) });
    el.hidden = false;
  }

  function hideTrStatus() {
    $("tr-status").hidden = true;
  }

  // The language websites are translated into (set in render()).
  let trTarget = "en";

  // Show what is going on, without downloading anything.
  async function updateTrStatus(settings) {
    const target = settings.translateTo || settings.language;
    if (!settings.translatePage || target === "en") {
      hideTrStatus();
      return;
    }
    const status = await Ease.translatorSetup.check(target);
    if (status === "needs-download") {
      showTrStatus("trNeedsSetup", null, target);
    } else if (status === "use-google" || status === "no-api") {
      showTrStatus("trUseGoogle", null, target);
    } else {
      hideTrStatus();
    }
  }

  // "Translate websites into": empty means "the same as Ease's language".
  for (const lang of Ease.LANGUAGES) {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    $("tr-to").appendChild(option);
  }
  $("tr-to").addEventListener("change", async () => {
    const code = $("tr-to").value;
    // Start the language download now, while Chrome still counts this as the user's choice.
    const download = prepareWithStatus(code);
    await Ease.storage.saveMySettings({ translateTo: code === languageSelect.value ? "" : code });
    render();
    await download;
  });

  // After a click: download the language if needed, and show progress.
  async function prepareWithStatus(code) {
    const result = await Ease.translatorSetup.prepare(code, (p) => showTrStatus("trDownloading", { p }, code));
    if (result === "ready") {
      showTrStatus("trReady", null, code);
    }
    return result;
  }

  // ---------- Small builders ----------

  // An on/off switch. data-key lets render() find and update it.
  function makeSwitch(dataKey, onClick) {
    const button = document.createElement("button");
    button.className = "switch-button";
    button.dataset.key = dataKey;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<span class="switch" aria-hidden="true"><span class="knob"></span></span>';
    button.addEventListener("click", onClick);
    return button;
  }

  // One row for one tool. Can be used many times (settings tab, Home, search).
  let rowCount = 0;
  // scope "site" = the change is saved for this website only (This Site tab).
  function makeToolRow(tool, scope) {
    const forSite = scope === "site";
    rowCount += 1;
    const id = "control-" + rowCount;
    const row = document.createElement("div");
    row.className = "tool-row";

    const label = document.createElement("label");
    label.className = "label";
    label.htmlFor = id;
    label.textContent = t(tool.labelKey || tool.key);
    row.appendChild(label);

    if (tool.type === "choice") {
      const select = document.createElement("select");
      select.id = id;
      select.className = "tool-select";
      if (forSite) {
        select.dataset.siteKey = tool.key; // filled from this site's settings in render()
      } else {
        select.dataset.key = tool.key;
      }
      for (const value of tool.options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = t((tool.optionPrefix || "option_") + value);
        select.appendChild(option);
      }
      select.addEventListener("change", async () => {
        if (forSite) {
          await Ease.storage.saveSiteSettings(host, { [tool.key]: select.value });
        } else {
          await Ease.storage.saveMySettings({ [tool.key]: select.value });
        }
        render();
      });
      row.appendChild(select);
    } else {
      const button = makeSwitch(tool.key, async () => {
        const settings = await Ease.storage.loadGlobalSettings();
        if (forSite) {
          const site = await Ease.storage.loadSiteSettings(host);
          const now = tool.key in site ? site[tool.key] : settings[tool.key];
          await Ease.storage.saveSiteSettings(host, { [tool.key]: !now });
        } else {
          await Ease.storage.saveMySettings({ [tool.key]: !settings[tool.key] });
        }
        render();
      });
      if (forSite) {
        delete button.dataset.key;
        button.dataset.siteKey = tool.key;
      }
      button.id = id;
      row.appendChild(button);
    }
    return row;
  }

  // One row for one profile, with "Helps:" line.
  function makeProfileRow(profile) {
    rowCount += 1;
    const id = "control-" + rowCount;
    const row = document.createElement("div");
    row.className = "tool-row";

    const text = document.createElement("label");
    text.className = "profile-text";
    text.htmlFor = id;

    const name = document.createElement("span");
    name.className = "label";
    name.textContent = t("profile_" + profile.id);

    const desc = document.createElement("span");
    desc.className = "profile-desc";
    desc.textContent = t("profileDesc_" + profile.id);

    const helps = document.createElement("span");
    helps.className = "profile-helps";
    const helpsLabel = document.createElement("strong");
    helpsLabel.textContent = t("helpsLabel") + " ";
    helps.append(helpsLabel, t("profileHelps_" + profile.id));

    text.append(name, desc, helps);

    const button = makeSwitch("profile:" + profile.id, async () => {
      await Ease.storage.toggleProfile(profile.id);
      render();
    });
    button.id = id;

    row.append(text, button);
    return row;
  }

  // ---------- Trigger words editor ----------
  // The user types words or phrases. Saved only on this device.

  function makeWordsEditor() {
    const box = document.createElement("div");
    box.className = "words";

    const help = document.createElement("p");
    help.className = "profile-desc";
    help.textContent = t("triggerHelp");

    const form = document.createElement("form");
    form.className = "words-form";
    const input = document.createElement("input");
    input.id = "trigger-input";
    input.type = "text";
    input.maxLength = 60;
    input.placeholder = t("triggerPlaceholder");
    input.setAttribute("aria-label", t("triggerPlaceholder"));
    const add = document.createElement("button");
    add.type = "submit";
    add.className = "small-button";
    add.textContent = t("triggerAdd");
    form.append(input, add);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const word = input.value.trim();
      if (!word) {
        return;
      }
      const settings = await Ease.storage.loadGlobalSettings();
      const list = settings.triggerWords || [];
      if (!list.some((w) => w.toLowerCase() === word.toLowerCase())) {
        // Adding a word also turns the feature on.
        await Ease.storage.saveMySettings({ triggerWords: [...list, word], triggerBlur: true });
      }
      input.value = "";
      render();
    });

    const list = document.createElement("ul");
    list.id = "trigger-list";
    list.className = "word-list";

    box.append(help, form, list);
    return box;
  }

  function renderWords(words) {
    const list = $("trigger-list");
    if (!list) {
      return;
    }
    list.textContent = "";
    for (const word of words) {
      const item = document.createElement("li");
      item.className = "word";
      const text = document.createElement("span");
      text.textContent = word;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "word-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", t("triggerRemove", { word }));
      remove.addEventListener("click", async () => {
        const settings = await Ease.storage.loadGlobalSettings();
        await Ease.storage.saveMySettings({ triggerWords: (settings.triggerWords || []).filter((w) => w !== word) });
        render();
      });
      item.append(text, remove);
      list.appendChild(item);
    }
  }

  // ---------- Build screens once ----------

  // Rebuild the Home tools only when the list changes (render() then fills in their values).
  // ---------- Home tiles ----------
  // Each tile is one tool. One tap moves to the next level, then back to the start:
  //   on/off tools:  Off -> On -> Off
  //   choices:       Normal -> Wide -> Extra wide -> Normal
  //   text size:     100% -> 125% -> ... -> 200% -> 100%
  // Small bars show the level. Tiles that are on have a blue border.

  function tileSpec(key) {
    if (key === "textSize") {
      return { key, kind: "size", steps: Ease.TEXT_SIZE_STEPS };
    }
    const tool = findTool(key);
    return tool ? { key, kind: tool.type, steps: tool.type === "choice" ? tool.options : [false, true] } : null;
  }

  function tileValueText(spec, value) {
    if (spec.kind === "size") {
      return value + "%";
    }
    if (spec.kind === "switch") {
      return t(value ? "tileOn" : "option_off");
    }
    return t("option_" + value);
  }

  // Short name for a tile ("Scam guard"), or the normal name if it is short already.
  function tileName(key) {
    const short = t("tile_" + key);
    return short !== "tile_" + key ? short : t(key);
  }

  function makeTile(key) {
    const spec = tileSpec(key);
    if (!spec) {
      return null;
    }
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.dataset.tile = key;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = Ease.TILE_ICONS[key] || Ease.TILE_ICONS.dot;
    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = tileName(key);
    const value = document.createElement("span");
    value.className = "tile-value";
    const dots = document.createElement("span");
    dots.className = "tile-dots";
    dots.setAttribute("aria-hidden", "true");
    for (let i = 1; i < spec.steps.length; i++) {
      dots.appendChild(document.createElement("i"));
    }
    tile.append(icon, name, value, dots);
    tile.addEventListener("click", async () => {
      const settings = await Ease.storage.loadGlobalSettings();
      const now = spec.steps.indexOf(settings[key]);
      const next = spec.steps[(now + 1) % spec.steps.length];
      await Ease.storage.saveMySettings({ [key]: next });
      render();
    });
    return tile;
  }

  // Show each tile's current value, level and on/off look.
  function updateTiles(settings) {
    for (const tile of document.querySelectorAll("[data-tile]")) {
      const key = tile.dataset.tile;
      const spec = tileSpec(key);
      const value = settings[key];
      const level = Math.max(0, spec.steps.indexOf(value));
      const on = key === "textSize" ? value !== 100 : isOn(key, value);
      tile.classList.toggle("on", on);
      tile.setAttribute("aria-pressed", String(on));
      tile.querySelector(".tile-value").textContent = tileValueText(spec, value);
      [...tile.querySelectorAll(".tile-dots i")].forEach((dot, index) => dot.classList.toggle("full", index < level));
      const levels = spec.steps.length - 1;
      const levelText = levels > 1 ? ", " + t("tileLevel", { n: level, m: levels }) : "";
      tile.setAttribute("aria-label", tileName(key) + ": " + tileValueText(spec, value) + levelText);
    }
  }

  let shownHomeTools = "";

  // Build the Home tiles (only when the list changes; updateTiles() fills in the values).
  function drawHomeTools(settings) {
    const keys = homeToolsFor(settings);
    if (keys.join() !== shownHomeTools) {
      shownHomeTools = keys.join();
      const box = $("quick-tools");
      box.textContent = "";
      for (const key of keys) {
        const tile = makeTile(key);
        if (tile) {
          box.appendChild(tile);
        }
      }
    }
    updateTiles(settings);
  }

  // The "Change" picker.
  async function openToolsPicker() {
    if (isLocked()) {
      askForPin("home"); // changing Home tools is a settings change
      return;
    }
    const settings = await Ease.storage.loadGlobalSettings();
    const chosen = new Set(homeToolsFor(settings));
    const list = $("tools-picker-list");
    list.textContent = "";
    const boxes = [];
    const limit = () => {
      const count = boxes.filter((b) => b.checked).length;
      boxes.forEach((b) => {
        b.disabled = !b.checked && count >= MAX_HOME_TOOLS;
      });
    };
    for (const tool of ALL_TOOLS.filter((item) => !BASIC_TOOLS.includes(item.key))) {
      const label = document.createElement("label");
      label.className = "picker-item";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = tool.key;
      box.checked = chosen.has(tool.key);
      box.addEventListener("change", limit);
      boxes.push(box);
      label.append(box, document.createTextNode(" " + t(tool.key)));
      list.appendChild(label);
    }
    limit();
    $("tools-picker").hidden = false;
    $("tools-picker").scrollIntoView({ block: "nearest" });
  }

  function buildHome() {
    for (const key of ["textSize", ...BASIC_TOOLS]) {
      $("basic-tiles").appendChild(makeTile(key));
    }
    $("tools-change").addEventListener("click", openToolsPicker);
    $("tools-cancel").addEventListener("click", () => {
      $("tools-picker").hidden = true;
    });
    $("tools-save").addEventListener("click", async () => {
      const keys = [...$("tools-picker-list").querySelectorAll("input:checked")].map((b) => b.value);
      await Ease.storage.saveMySettings({ homeTools: keys });
      $("tools-picker").hidden = true;
      render();
    });
    $("tools-auto").addEventListener("click", async () => {
      await Ease.storage.saveMySettings({ homeTools: [] }); // back to "chosen from my profiles"
      $("tools-picker").hidden = true;
      render();
    });
    // Home "Translate" button: the same as "Translate this page now" in My Settings.
    $("tr-action").addEventListener("click", () => $("tr-now").click());
    // The reading goal chip shows or hides the details.
    $("goal-chip").addEventListener("click", () => {
      const open = $("goal-card").hidden;
      $("goal-card").hidden = !open;
      $("goal-chip").setAttribute("aria-expanded", String(open));
    });
  }

  function groupTitle(key, id) {
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent = t(key);
    if (id) {
      title.id = id;
    }
    return title;
  }

  // Hands-free: the camera and the microphone run in Chrome's side panel (handsfree/panel.html).
  function makeHandsFreeOpen() {
    const box = document.createElement("div");
    box.className = "hf-open";
    const note = document.createElement("p");
    note.className = "disclaimer";
    note.textContent = t("hfPopupNote");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-button";
    button.textContent = t("hfOpenPanel");
    button.addEventListener("click", async () => {
      try {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        window.close();
      } catch (error) {
        note.textContent = t("hfPanelError");
      }
    });
    box.append(note, button);
    return box;
  }

  function buildSettings() {
    for (const profile of Ease.PROFILES) {
      $("profiles").appendChild(makeProfileRow(profile));
    }
    // Calm Mode is the first row of "Calm and focus" (it is also on Home).
    $("tools-calm").appendChild(card([makeToolRow(CALM_TOOL)]));
    // Text size is the first row of "Reading and seeing" (its number is updated in render()).
    const sizeRow = textSizeRow({ textSize: 100 });
    sizeRow.id = "size-row";

    for (const section of TOOLS) {
      const box = $("tools-" + section.page);
      const list = document.createElement("div");
      list.className = "card tool-list";
      for (const tool of section.items) {
        list.appendChild(makeToolRow(tool));
      }
      if (section.sub === "subText") {
        list.prepend(sizeRow); // Text size goes on top of the Text card
      }
      if (section.sub === "subTriggers") {
        list.appendChild(makeWordsEditor());
      }
      if (section.sub === "subHandsFree") {
        list.appendChild(makeHandsFreeOpen());
      }
      if (section.sub) {
        box.appendChild(groupTitle(section.sub));
      }
      box.appendChild(list);
    }

    // Time limits: in "Calm and focus".
    const timeCard = card([]);
    timeCard.appendChild(makeTimeLimits());
    $("tools-calm").append(groupTitle("timeTitle", "time-title"), timeCard);

    // AI helpers: in "Safety and AI helpers".
    const aiCard = card([]);
    aiCard.appendChild(makeAiCard());
    $("tools-safety").append(groupTitle("aiTitle"), aiCard);

    // The 5 group buttons on the main list.
    for (const page of PAGES) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cat";
      button.id = "cat-" + page.id;
      const icon = document.createElement("span");
      icon.className = "cat-icon";
      icon.style.background = page.tint;
      icon.textContent = page.icon;
      icon.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "cat-text";
      const name = document.createElement("span");
      name.className = "cat-name";
      name.textContent = t("cat_" + page.id);
      const desc = document.createElement("span");
      desc.className = "cat-desc";
      desc.textContent = t("catDesc_" + page.id);
      text.append(name, desc);
      const badge = document.createElement("span");
      badge.className = "cat-badge";
      badge.id = "badge-" + page.id;
      const arrow = document.createElement("span");
      arrow.className = "cat-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "›";
      button.append(icon, text, badge, arrow);
      button.addEventListener("click", () => openPage(page.id, button));
      item.appendChild(button);
      $("cats").appendChild(item);
    }
  }

  // ---------- Pages inside My Settings ----------
  // The main list, or one page. "‹" goes back to the main list, and focus returns to the button the user came from.

  let openedFrom = null;

  function pageTitle(id) {
    if (id === "forme") {
      return t("forMeTitle");
    }
    if (id === "profiles") {
      return t("groupProfiles");
    }
    return t("cat_" + id);
  }

  function openPage(id, from) {
    openedFrom = from || null;
    $("set-main").hidden = true;
    $("set-page").hidden = false;
    for (const page of document.querySelectorAll(".set-pg")) {
      page.hidden = page.id !== "page-" + id;
    }
    const info = PAGES.find((p) => p.id === id);
    $("page-title").textContent = (info ? info.icon + " " : "") + pageTitle(id);
    $("main").scrollTop = 0;
    $("page-title").focus();
  }

  function closePage() {
    $("set-page").hidden = true;
    $("set-main").hidden = false;
    $("main").scrollTop = 0;
    if (openedFrom && document.contains(openedFrom)) {
      openedFrom.focus();
    }
    openedFrom = null;
  }

  $("page-back").addEventListener("click", closePage);
  $("see-for-me").addEventListener("click", (event) => openPage("forme", event.currentTarget));
  $("prof-change").addEventListener("click", (event) => openPage("profiles", event.currentTarget));

  // Keys shown on each page, to count how many are on.
  function pageKeys(id) {
    return TOOLS.filter((section) => section.page === id).flatMap((section) => section.items.map((item) => item.key));
  }

  // The main list: profile chips, and "3 on" on each group.
  function drawSettingsMain(settings) {
    const chips = $("prof-chips");
    chips.textContent = "";
    for (const id of settings.profiles || []) {
      if (!Ease.PROFILES.some((p) => p.id === id)) {
        continue;
      }
      const chip = document.createElement("li");
      chip.className = "prof-chip";
      chip.textContent = "✓ " + t("profile_" + id);
      chips.appendChild(chip);
    }
    const none = chips.childElementCount === 0;
    chips.hidden = none;
    $("prof-none").hidden = !none;

    for (const page of PAGES) {
      let count = 0;
      let text = "";
      if (page.id === "care") {
        text = settings.lockHash ? t("lockPin") : "";
      } else {
        count = pageKeys(page.id).filter((key) => isOn(key, settings[key])).length;
        if (page.id === "reading") {
          count += (settings.textSize !== 100 ? 1 : 0) + (settings.translatePage ? 1 : 0);
        }
        if (page.id === "calm") {
          count += (settings.calmMode ? 1 : 0) + ((settings.timeLimits || []).length ? 1 : 0);
        }
        text = count ? t("catOn", { n: count }) : t("catNone");
      }
      const badge = $("badge-" + page.id);
      badge.textContent = text;
      badge.hidden = !text;
      badge.classList.toggle("off", page.id !== "care" && count === 0);
    }
  }

  function makeAiCard() {
    const box = document.createElement("div");
    box.className = "words ai-card";
    const help = document.createElement("p");
    help.className = "profile-desc";
    help.textContent = t("aiHelp");
    const status = document.createElement("p");
    status.id = "ai-status";
    status.className = "ai-status";
    status.setAttribute("role", "status");
    const setUp = document.createElement("button");
    setUp.type = "button";
    setUp.id = "ai-setup";
    setUp.className = "primary-button wide-small";
    setUp.textContent = t("aiSetUp");
    setUp.hidden = true;
    const needs = document.createElement("p");
    needs.className = "profile-desc";
    needs.textContent = t("aiNeeds");
    setUp.addEventListener("click", () => {
      // Must start right away in the click: Chrome only downloads after a click.
      const started = Ease.ai.direct.setUp(currentLanguage(), (p) => {
        status.textContent = t("aiDownloading", { p });
      });
      setUp.disabled = true;
      status.textContent = t("aiDownloading", { p: 0 });
      started.then(drawAiStatus, () => {
        status.textContent = t("aiNotAvailable");
        setUp.disabled = false;
      });
    });
    box.append(help, status, setUp, needs, makeToolRow({ key: "explainSimply", type: "switch" }));
    return box;
  }

  function currentLanguage() {
    return $("language").value || "en";
  }

  async function drawAiStatus() {
    const status = $("ai-status");
    if (!status) {
      return;
    }
    const state = await Ease.ai.direct.status(currentLanguage());
    status.textContent = t({ ready: "aiReady", download: "aiDownload", downloading: "aiDownloadingWait", no: "aiNo" }[state]);
    status.dataset.state = state;
    $("ai-setup").hidden = state !== "download";
    $("ai-setup").disabled = false;
  }

  // ---------- Time limits editor ----------
  // A daily limit for websites that pull the user in. Saved as "site|minutes".

  function minutesLabel(minutes) {
    if (minutes < 60) {
      return t("timeMin", { n: minutes });
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? t("timeHoursMin", { h: hours, m: rest }) : t(hours === 1 ? "timeHour" : "timeHours", { n: hours });
  }

  async function saveLimits(list) {
    await Ease.storage.saveMySettings({ timeLimits: list.map((l) => l.site + "|" + l.minutes) });
    render();
  }

  function makeTimeLimits() {
    const box = document.createElement("div");
    box.className = "words time-limits";

    const help = document.createElement("p");
    help.className = "profile-desc";
    help.textContent = t("timeHelp");

    const list = document.createElement("ul");
    list.id = "time-list";
    list.className = "time-list";

    const form = document.createElement("form");
    form.className = "words-form";
    const input = document.createElement("input");
    input.id = "time-input";
    input.type = "text";
    input.maxLength = 80;
    input.placeholder = "instagram.com";
    input.setAttribute("aria-label", t("timeAddLabel"));
    const add = document.createElement("button");
    add.type = "submit";
    add.className = "small-button";
    add.textContent = t("triggerAdd");
    form.append(input, add);

    const error = document.createElement("p");
    error.id = "time-error";
    error.className = "time-error";
    error.setAttribute("role", "alert");

    const thisSite = document.createElement("button");
    thisSite.type = "button";
    thisSite.id = "time-this-site";
    thisSite.className = "small-button wide-small";
    thisSite.hidden = true;

    async function addSite(text) {
      const site = Ease.timeRules.cleanSite(text);
      if (!site) {
        error.textContent = t("timeBadSite");
        return;
      }
      error.textContent = "";
      const settings = await Ease.storage.loadGlobalSettings();
      const limits = Ease.timeRules.parse(settings.timeLimits);
      if (!limits.some((l) => l.site === site)) {
        limits.push({ site, minutes: 60 });
        await saveLimits(limits);
      }
      input.value = "";
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      addSite(input.value);
    });
    thisSite.addEventListener("click", () => addSite(host));

    box.append(help, list, form, error, thisSite);
    box.appendChild(makeToolRow({ key: "timeLimitExtra", type: "switch" }));
    box.appendChild(makeToolRow({ key: "timeLimitPin", type: "switch" }));
    return box;
  }

  async function renderTimeLimits(settings) {
    const list = $("time-list");
    if (!list) {
      return;
    }
    const limits = Ease.timeRules.parse(settings.timeLimits);
    const usage = await Ease.storage.loadTimeUsage();
    list.textContent = "";
    for (const limit of limits) {
      const used = Math.floor((usage.used[limit.site] || 0) / 60);
      const total = limit.minutes + Math.floor((usage.extra[limit.site] || 0) / 60);
      const item = document.createElement("li");
      item.className = "time-item";

      const text = document.createElement("div");
      text.className = "time-site";
      const name = document.createElement("b");
      name.textContent = limit.site;
      const sub = document.createElement("span");
      sub.textContent = used ? t("timeUsed", { used, total }) : t("timeNotUsed");
      const bar = document.createElement("span");
      bar.className = "time-bar";
      bar.setAttribute("aria-hidden", "true");
      const fill = document.createElement("i");
      fill.style.width = Math.min(100, Math.round((used / total) * 100)) + "%";
      bar.appendChild(fill);
      text.append(name, sub, bar);

      const select = document.createElement("select");
      select.className = "tool-select";
      select.setAttribute("aria-label", t("timeLimitFor", { site: limit.site }));
      for (const minutes of Ease.timeRules.MINUTES) {
        const option = document.createElement("option");
        option.value = String(minutes);
        option.textContent = minutesLabel(minutes);
        select.appendChild(option);
      }
      select.value = String(limit.minutes);
      select.addEventListener("change", () => {
        saveLimits(limits.map((l) => (l.site === limit.site ? { site: l.site, minutes: Number(select.value) } : l)));
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "word-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", t("timeRemove", { site: limit.site }));
      remove.addEventListener("click", () => saveLimits(limits.filter((l) => l.site !== limit.site)));

      item.append(text, select, remove);
      list.appendChild(item);
    }
    // "Add this website" when the user is on a website that has no limit yet.
    const thisSite = $("time-this-site");
    const clean = Ease.timeRules.cleanSite(host);
    thisSite.hidden = !clean || limits.some((l) => l.site === clean);
    thisSite.textContent = t("timeAddThis", { site: clean });
    // The PIN option only makes sense when a caregiver PIN is set.
    const pinRow = document.querySelector('[data-key="timeLimitPin"]');
    if (pinRow) {
      pinRow.disabled = !settings.lockHash;
      pinRow.title = settings.lockHash ? "" : t("timePinNeedsLock");
    }
  }

  // ---------- Search ----------
  // Matches the words people see: tool names, profile names, descriptions, "Helps" lines.

  const searchIndex = [
    ...ALL_TOOLS.map((tool) => ({
      text: t(tool.key).toLowerCase(),
      build: () => makeToolRow(tool)
    })),
    ...Ease.PROFILES.map((profile) => ({
      text: [t("profile_" + profile.id), t("profileDesc_" + profile.id), t("profileHelps_" + profile.id)]
        .join(" ")
        .toLowerCase(),
      build: () => makeProfileRow(profile)
    }))
  ];

  // Search works in two places: Home and My Settings.
  function runSearch(inputId, resultsId) {
    const query = $(inputId).value.trim().toLowerCase();
    const results = $(resultsId);
    results.textContent = "";
    if (query.length < 2) {
      results.hidden = true;
      return;
    }
    // Short words ("on", "to", "a") match almost everything, so we skip them (unless it is the only word).
    const allWords = query.split(/\s+/);
    const words = allWords.filter((word) => word.length >= 3).length ? allWords.filter((word) => word.length >= 3) : allWords;
    const matches = searchIndex.filter((entry) => words.some((word) => entry.text.includes(word)));
    // On Home, "Show me how" is the answer when no setting matches, so we do not say "Nothing found".
    if (matches.length === 0 && !(inputId === "home-search" && host && query.length >= 3)) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = t("noResults");
      results.appendChild(empty);
    } else {
      for (const entry of matches.slice(0, 6)) {
        results.appendChild(entry.build());
      }
    }
    // On Home: "Show me how on this page" (points to the right button on the website).
    if (inputId === "home-search" && host && query.length >= 3) {
      const goal = $(inputId).value.trim();
      const ask = document.createElement("button");
      ask.type = "button";
      ask.className = "smh-ask";
      ask.textContent = t("smhAsk", { goal });
      ask.addEventListener("click", async () => {
        await chrome.tabs.sendMessage(tab.id, { type: "showMeHow", goal }).catch(() => {});
        window.close(); // the help appears on the website
      });
      results.prepend(ask);
    }
    results.hidden = false;
    render();
  }

  $("search").addEventListener("input", () => runSearch("search", "search-results"));

  // ---------- Helpers row on Home ----------
  // Show me how: the Home search box is where you type what you want to do.
  $("help-smh").addEventListener("click", () => {
    const box = $("home-search");
    box.placeholder = t("smhPlaceholder");
    $("smh-hint").textContent = t("smhHomeHint");
    $("smh-hint").hidden = false;
    box.focus();
    if (box.value.trim()) {
      runSearch("home-search", "home-search-results");
    }
  });

  // Explain simply: works on the page itself. Here we explain how, and say if the AI is ready.
  $("help-explain").addEventListener("click", async () => {
    const tip = $("explain-tip");
    tip.hidden = !tip.hidden;
    $("help-explain").setAttribute("aria-expanded", String(!tip.hidden));
    if (tip.hidden) {
      return;
    }
    const settings = await Ease.storage.loadGlobalSettings();
    $("explain-turn-on").hidden = settings.explainSimply !== false;
    const state = await Ease.ai.status(settings.language).catch(() => "no");
    const status = $("explain-tip-status");
    status.hidden = state === "ready";
    status.textContent = state === "download" || state === "downloading" ? t("aiNeedsSetup") : t("aiNotAvailable");
  });
  $("explain-turn-on").addEventListener("click", async () => {
    await Ease.storage.saveMySettings({ explainSimply: true });
    $("explain-turn-on").hidden = true;
    render();
  });

  // Time limits: open the settings for them (My Settings > Calm and focus).
  $("help-time").addEventListener("click", (event) => {
    showTab("settings");
    if (!isLocked()) {
      openPage("calm", event.currentTarget);
      $("time-title").scrollIntoView({ block: "start" });
      const addThis = $("time-this-site");
      if (addThis && !addThis.hidden) {
        addThis.focus({ preventScroll: true });
      }
    }
  });

  // Today's use for this website, under "Time limits" (or "Set a limit").
  async function drawHelpers(settings) {
    $("home-hf-state").textContent = settings.handsFree ? t("hfHomeOn") : "";
    $("home-handsfree").classList.toggle("on", Boolean(settings.handsFree));
    const limit = host ? Ease.timeRules.limitFor(host, settings.timeLimits) : null;
    if (!limit) {
      $("help-time-status").textContent = t("timeSetShort");
      return;
    }
    const usage = await Ease.storage.loadTimeUsage();
    const used = Math.floor((usage.used[limit.site] || 0) / 60); // same numbers as My Settings > Time limits
    const total = limit.minutes + Math.floor((usage.extra[limit.site] || 0) / 60);
    $("help-time-status").textContent = t("timeShort", { used, total });
  }
  $("home-search").addEventListener("input", () => runSearch("home-search", "home-search-results"));

  // ---------- Tabs ----------

  // ---------- Reading goals on Home ----------
  // "Today: 2 of 3 articles" and "You read on 4 days this week". Only good news, no streaks.

  async function drawGoalCard(settings) {
    if (!settings.readingGoals) {
      $("goal-card").hidden = true;
      $("goal-chip").hidden = true;
      return;
    }
    const log = await Ease.storage.loadReadingLog();
    const today = Ease.profiles.today();
    let goal = Number(settings.readingGoal) || 3;
    if (settings.lowEnergyDate === today) {
      goal = Math.max(1, Math.ceil(goal / 2)); // same rule as the page
    }
    const done = (log.days[today] || []).length;
    $("goal-today").textContent = t(done >= goal ? "rgTodayDone" : "rgToday", { n: done, goal });
    $("goal-fill").style.width = Math.min(100, Math.round((done / goal) * 100)) + "%";
    $("goal-week").textContent = t("rgWeek", { d: await Ease.storage.readingDaysThisWeek() });
    // Small chip in the header. The card with details opens when the chip is clicked.
    $("goal-chip").textContent = "📖 " + done + "/" + goal;
    $("goal-chip").setAttribute("aria-label", t(done >= goal ? "rgTodayDone" : "rgToday", { n: done, goal }));
    $("goal-chip").classList.toggle("done", done >= goal);
    $("goal-chip").hidden = false;
  }

  // ---------- "What's on" in My Settings ----------
  // Shows only the settings that are on, grouped by where they came from:
  //   Today only (Low-energy day) -> each profile -> my own changes.
  // So a person with 3 profiles does not have to scroll through every setting.

  const CALM_TOOL = { key: "calmMode", type: "switch", labelKey: "calmTitle" };

  function isOn(key, value) {
    return value !== undefined && JSON.stringify(value) !== JSON.stringify(Ease.DEFAULT_SETTINGS[key]);
  }

  // The tools that belong to this person, and why. Tools stay in the list when they are off,
  // so the user can turn them back on (or off on one website only).
  // Returns [{ source: "profile" | "mine", profile?, keys: [...] }].
  function groupForMe(settings, saved) {
    const tools = [CALM_TOOL, ...ALL_TOOLS];
    const used = new Set();
    const groups = [];
    for (const id of settings.profiles || []) {
      const profile = Ease.PROFILES.find((p) => p.id === id);
      if (!profile) {
        continue;
      }
      const keys = [];
      if ("textSize" in profile.settings && !used.has("textSize")) {
        keys.push("textSize");
        used.add("textSize");
      }
      for (const tool of tools) {
        if (tool.key in profile.settings && !used.has(tool.key)) {
          keys.push(tool.key);
          used.add(tool.key);
        }
      }
      groups.push({ source: "profile", profile: id, keys });
    }
    // Things the user changed themselves (on, or turned off), that no profile covers.
    const mine = [];
    if (!used.has("textSize") && ("textSize" in saved || settings.textSize !== 100)) {
      mine.push("textSize");
    }
    for (const tool of tools) {
      if (!used.has(tool.key) && (tool.key in saved || isOn(tool.key, settings[tool.key]))) {
        mine.push(tool.key);
      }
    }
    if (mine.length) {
      groups.push({ source: "mine", keys: mine });
    }
    return groups;
  }

  function sourceTitle(text, why, actionText, onAction) {
    const head = document.createElement("div");
    head.className = "on-source";
    const name = document.createElement("span");
    name.className = "on-name";
    name.textContent = text;
    if (why) {
      const small = document.createElement("span");
      small.className = "on-why";
      small.textContent = " · " + why;
      name.appendChild(small);
    }
    head.appendChild(name);
    if (actionText) {
      const action = document.createElement("button");
      action.className = "link-button";
      action.textContent = actionText;
      action.addEventListener("click", onAction);
      head.appendChild(action);
    }
    return head;
  }

  // Text size as a row with A− / A+ (the same buttons as on Home).
  function textSizeRow(settings) {
    const row = document.createElement("div");
    row.className = "tool-row";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = t("textSize");
    const stepper = document.createElement("span");
    stepper.className = "stepper";
    const minus = document.createElement("button");
    minus.className = "step";
    minus.textContent = "A−";
    minus.setAttribute("aria-label", t("smallerText"));
    minus.addEventListener("click", () => changeTextSize(-1));
    const value = document.createElement("span");
    value.className = "size-value";
    value.textContent = settings.textSize + "%";
    const plus = document.createElement("button");
    plus.className = "step";
    plus.textContent = "A+";
    plus.setAttribute("aria-label", t("biggerText"));
    plus.addEventListener("click", () => changeTextSize(1));
    stepper.append(minus, value, plus);
    row.append(label, stepper);
    return row;
  }

  function card(rows) {
    const box = document.createElement("div");
    box.className = "card tool-list";
    rows.forEach((row) => box.appendChild(row));
    return box;
  }

  function toolFor(key) {
    return key === "calmMode" ? CALM_TOOL : findTool(key);
  }

  // Draw the "For me" list.
  //   scope "global": My Settings (changes apply everywhere)
  //   scope "site":   This Site tab (changes apply to this website only, marked "Only here")
  // Returns how many tools are on.
  async function drawForMe(box, settings, scope, site) {
    const saved = await Ease.storage.loadSaved();
    const forSite = scope === "site";
    const values = forSite ? { ...settings, ...site } : settings;
    const today = Ease.profiles.today();
    box.textContent = "";
    let onCount = 0;

    // Today only (a whole-day choice, so only in My Settings)
    if (!forSite && settings.lowEnergyDate === today) {
      onCount += 1;
      box.appendChild(sourceTitle(t("onToday")));
      const row = document.createElement("div");
      row.className = "tool-row";
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = t("lowEnergyTitle");
      const small = document.createElement("small");
      small.className = "on-sub";
      small.textContent = t("lowEnergyOn");
      label.appendChild(small);
      const button = makeSwitch("lowEnergyToday", async () => {
        await Ease.storage.saveMySettings({ lowEnergyDate: null });
        render();
      });
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-label", t("lowEnergyTitle"));
      button.removeAttribute("data-key"); // not a normal setting: render() must not touch it
      row.append(label, button);
      box.appendChild(card([row]));
    }

    const groups = groupForMe(settings, saved);
    for (const group of groups) {
      const keys = forSite ? group.keys.filter((key) => key !== "textSize") : group.keys; // site text size is above
      if (group.source === "profile") {
        const why = t("profileHelps_" + group.profile).split(",")[0];
        if (forSite) {
          box.appendChild(sourceTitle(t("profile_" + group.profile), why));
        } else {
          box.appendChild(
            sourceTitle(t("profile_" + group.profile), why, t("onProfileOff"), async () => {
              await Ease.storage.toggleProfile(group.profile);
              render();
            })
          );
        }
      } else if (forSite) {
        box.appendChild(sourceTitle(t("onMineShort")));
      } else {
        box.appendChild(
          sourceTitle(t("onMine"), "", t("onUndoMine"), async () => {
            await Ease.storage.resetManual();
            render();
          })
        );
      }
      if (!keys.length) {
        const empty = document.createElement("p");
        empty.className = "on-empty";
        empty.textContent = t("onProfileCovered");
        box.appendChild(empty);
        continue;
      }
      const rows = keys.map((key) => {
        const row = key === "textSize" ? textSizeRow(settings) : makeToolRow(toolFor(key), scope);
        if (forSite && key in site) {
          const tag = document.createElement("span");
          tag.className = "here-tag";
          tag.textContent = t("onlyHere");
          row.querySelector(".label").appendChild(tag);
        }
        return row;
      });
      onCount += keys.filter((key) => (key === "textSize" ? values.textSize !== 100 : isOn(key, values[key]))).length;
      box.appendChild(card(rows));
    }

    if (!groups.length && !box.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "on-empty";
      empty.textContent = t("onNothing");
      box.appendChild(empty);
    }
    return { onCount, hasTools: groups.length > 0 };
  }

  async function drawWhatsOn(settings) {
    const result = await drawForMe($("whats-on"), settings, "global");
    $("see-for-me").textContent = t("profSee", { n: result.onCount });
  }

  // ---------- Settings lock ----------
  // With a PIN, My Settings and This Site ask for it first. Home always works.

  let lockHash = null;
  let unlocked = false;
  let pendingTab = null;

  function isLocked() {
    return Boolean(lockHash) && !unlocked;
  }

  function applyLockState() {
    $("lock-open").textContent = t(lockHash ? "lockRemove" : "lockSetButton");
    languageSelect.disabled = isLocked();
    languageSelect.title = isLocked() ? t("lockedTitle") : "";
    $("search-box").hidden = isLocked(); // search results can change settings
    $("home-again").hidden = isLocked(); // reset and the quiz change settings too
    document.querySelector(".home-search").hidden = isLocked();
    if (isLocked()) {
      $("search-results").hidden = true;
      $("home-search-results").hidden = true;
    }
  }

  function askForPin(tabName) {
    pendingTab = tabName;
    for (const id of ["tab-home", "tab-settings", "tab-site"]) {
      $(id).hidden = true;
    }
    $("pin-ask").hidden = false;
    $("pin-error").hidden = true;
    $("pin-input").value = "";
    $("pin-input").focus();
  }

  async function tryUnlock() {
    const ok = await Ease.lock.check($("pin-input").value, lockHash);
    if (!ok) {
      $("pin-error").textContent = t("lockWrong");
      $("pin-error").hidden = false;
      $("pin-input").select();
      return;
    }
    unlocked = true; // until the popup closes
    $("pin-ask").hidden = true;
    applyLockState();
    showTab(pendingTab || "settings");
  }

  $("pin-unlock").addEventListener("click", tryUnlock);
  $("pin-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      tryUnlock();
    }
  });
  $("pin-cancel").addEventListener("click", () => {
    $("pin-ask").hidden = true;
    showTab("home");
  });

  // Set a new lock, or remove the lock.
  $("lock-open").addEventListener("click", async () => {
    if (lockHash) {
      await Ease.storage.saveMySettings({ lockHash: null });
      lockHash = null;
      showSettingsNote(t("lockRemoved"));
      render();
      return;
    }
    $("lock-set").hidden = false;
    $("pin-set-error").hidden = true;
    $("pin-new").value = "";
    $("pin-new2").value = "";
    $("pin-new").focus();
  });

  $("pin-set-cancel").addEventListener("click", () => {
    $("lock-set").hidden = true;
  });

  $("pin-save").addEventListener("click", async () => {
    const pin = $("pin-new").value;
    const error = !Ease.lock.isValidPin(pin) ? "lockNeed4" : pin !== $("pin-new2").value ? "lockNoMatch" : null;
    if (error) {
      $("pin-set-error").textContent = t(error);
      $("pin-set-error").hidden = false;
      return;
    }
    lockHash = await Ease.lock.makeHash(pin);
    await Ease.storage.saveMySettings({ lockHash });
    unlocked = true; // the person who set it can keep working now
    $("lock-set").hidden = true;
    showSettingsNote(t("lockDone"));
    render();
  });

  // A short message under the Sync row (also used for lock messages).
  function showSettingsNote(text) {
    $("sync-status").textContent = text;
    $("sync-status").hidden = false;
  }

  // ---------- Chrome Sync ----------
  // The switch is saved as "syncOn" (outside mySettings, so each computer decides for itself).
  // background.js copies settings between this computer and Chrome Sync while it is on.

  const SYNC_KEYS = ["mySettings", "siteSettings", "sitesOff"];

  async function drawSync() {
    const { syncOn } = await chrome.storage.local.get("syncOn");
    $("sync-switch").setAttribute("aria-pressed", String(Boolean(syncOn)));
  }

  async function turnSyncOn(useOther) {
    if (useOther) {
      const fromSync = await chrome.storage.sync.get(SYNC_KEYS);
      await chrome.storage.local.set({ ...fromSync, syncOn: true });
      location.reload(); // redraw with the other computer's settings and language
      return;
    }
    const here = await chrome.storage.local.get(SYNC_KEYS);
    try {
      await chrome.storage.sync.set(here);
    } catch (error) {
      await chrome.storage.sync.set({ mySettings: here.mySettings || {} }); // too many website settings: sync the main ones
    }
    await chrome.storage.local.set({ syncOn: true });
    $("sync-ask").hidden = true;
    showSettingsNote(t("syncOnNote"));
    drawSync();
  }

  $("sync-switch").addEventListener("click", async () => {
    const { syncOn } = await chrome.storage.local.get("syncOn");
    if (syncOn) {
      await chrome.storage.local.set({ syncOn: false });
      showSettingsNote(t("syncOffNote"));
      drawSync();
      return;
    }
    // Another computer may have saved settings already. Ask which ones to keep.
    const fromSync = await chrome.storage.sync.get("mySettings");
    const here = await Ease.storage.loadSaved();
    if (fromSync.mySettings && JSON.stringify(fromSync.mySettings) !== JSON.stringify(here)) {
      $("sync-ask").hidden = false;
      return;
    }
    turnSyncOn(false);
  });

  $("sync-use-other").addEventListener("click", () => turnSyncOn(true));
  $("sync-keep").addEventListener("click", () => turnSyncOn(false));

  // ---------- Set up for someone else ----------

  $("setup-other").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html#for-someone") });
    window.close();
  });

  function showTab(name) {
    if (name !== "home" && isLocked()) {
      askForPin(name);
      return;
    }
    $("pin-ask").hidden = true;
    for (const button of document.querySelectorAll(".tab")) {
      if (button.dataset.tab === name) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    }
    $("tab-home").hidden = name !== "home";
    $("tab-settings").hidden = name !== "settings";
    if (name === "settings" && !$("set-page").hidden) {
      closePage();
    }
    $("tab-site").hidden = name !== "site";
    $("main").scrollTop = 0;
  }

  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  }

  // ---------- Daily check-in ----------

  // The check-in sits inside <main> (so the page always has one main area).
  // While it shows, the tab panels and the tab bar are hidden.
  function showCheckin(show) {
    $("checkin").hidden = !show;
    $("tabs").hidden = show;
    if (show) {
      for (const id of ["tab-home", "tab-settings", "tab-site", "pin-ask"]) {
        $(id).hidden = true;
      }
    } else {
      showTab("home");
    }
  }

  for (const button of document.querySelectorAll(".mood")) {
    button.addEventListener("click", async () => {
      const mood = button.dataset.mood;
      const today = Ease.profiles.today();
      const changes = { checkinDate: today, checkinMood: mood };
      const settings = await Ease.storage.loadMySettings();
      if (mood === "tired") {
        changes.lowEnergyDate = today; // tired = Low-energy day
      } else if (settings.lowEnergyDate === today) {
        changes.lowEnergyDate = null; // feeling better: turn it off
      }
      await Ease.storage.saveMySettings(changes);
      showCheckin(false);
      render();
    });
  }

  $("checkin-never").addEventListener("click", async () => {
    await Ease.storage.saveMySettings({ dailyCheckin: false });
    showCheckin(false);
    render();
  });

  $("mood-link").addEventListener("click", () => showCheckin(true));

  // ---------- Render: show saved values on screen ----------

  async function render() {
    const settings = await Ease.storage.loadGlobalSettings();
    const today = Ease.profiles.today();
    const activeProfiles = settings.profiles ?? [];

    // Calm and Low-energy day
    $("calm").setAttribute("aria-pressed", String(Boolean(settings.calmMode)));
    $("calm-status").textContent = t(settings.calmMode ? "calmOn" : "calmOff");
    const lowEnergyOn = settings.lowEnergyDate === today;
    $("low-energy").setAttribute("aria-pressed", String(lowEnergyOn));
    $("low-energy-status").textContent = t(lowEnergyOn ? "lowEnergyOn" : "lowEnergyOff");

    // Today's mood in the header. Always there, so the user can tell Ease how they feel any time.
    const moodLink = $("mood-link");
    if (settings.checkinDate === today && settings.checkinMood) {
      moodLink.textContent = t("moodToday_" + settings.checkinMood);
    } else {
      moodLink.textContent = t("moodAsk");
    }
    moodLink.hidden = false;

    // Text size
    // (text size is shown on its Home tile)

    // Trigger words
    renderWords(settings.triggerWords || []);
    renderTimeLimits(settings);
    drawHelpers(settings);
    drawAiStatus();

    drawHomeTools(settings);
    await drawWhatsOn(settings); // before the loop below, so its controls get their values
    $("size-row").querySelector(".size-value").textContent = settings.textSize + "%";
    drawSettingsMain(settings);
    $("tr-action").hidden = !host;

    // Every tool and profile control, wherever it is on screen
    for (const control of document.querySelectorAll("[data-key]")) {
      const key = control.dataset.key;
      if (key.startsWith("profile:")) {
        const id = key.slice("profile:".length);
        control.setAttribute("aria-pressed", String(activeProfiles.includes(id)));
      } else if (control.tagName === "SELECT") {
        control.value = settings[key];
      } else {
        control.setAttribute("aria-pressed", String(Boolean(settings[key])));
      }
    }

    $("quiz-nudge").hidden = !settings.quizNudge;
    // New users: the quiz picks their tools. Until then, the quiz reminder takes the place of "My tools".
    const showTools = !settings.quizNudge;
    $("my-tools-head").hidden = !showTools;
    $("quick-tools").hidden = !showTools;
    drawGoalCard(settings);
    lockHash = settings.lockHash || null;
    applyLockState();

    // Translation card. Websites can be translated into a language other than Ease's own.
    trTarget = settings.translateTo || settings.language;
    $("tr-to").value = trTarget;
    const langInfo = Ease.LANGUAGES.find((l) => l.code === trTarget);
    const langName = langInfo ? langInfo.name : trTarget;
    $("tr-title").textContent = t("trCardTitle", { lang: langName });
    $("tr-switch").setAttribute("aria-pressed", String(Boolean(settings.translatePage)));
    if ($("tr-status").hidden || !settings.translatePage) {
      updateTrStatus(settings); // do not hide a download that is in progress
    }

    // This Site
    if (!host) {
      $("tr-now").disabled = true;
      $("reading-view").disabled = true;
      $("summarize").disabled = true;
      $("site-tr-switch").disabled = true;
      $("site-host").textContent = t("noSite");
      $("site-label").textContent = "";
      for (const id of ["site-switch", "home-site-off", "site-smaller", "site-bigger", "site-reset"]) {
        $(id).disabled = true;
      }
      $("home-site-off").textContent = t("turnOffHere");
      $("site-size-value").textContent = "—";
      return;
    }
    const off = await Ease.storage.isSiteOff(host);
    const site = await Ease.storage.loadSiteSettings(host);
    $("site-host").textContent = host;
    $("site-label").textContent = t(off ? "siteOffLabel" : "siteOnLabel");
    $("site-switch").setAttribute("aria-pressed", String(!off));
    $("home-site-off").textContent = t(off ? "turnOnHere" : "turnOffHere");
    $("site-size-value").textContent = (site.textSize ?? settings.textSize) + "%";

    // Translation on this site: the site choice wins over the main switch.
    // My tools on this site: the same list as "For me", but changes are for this website only.
    await drawForMe($("site-for-me"), settings, "site", site);
    const here = { ...settings, ...site };
    for (const control of document.querySelectorAll("[data-site-key]")) {
      const key = control.dataset.siteKey;
      if (control.tagName === "SELECT") {
        control.value = here[key];
      } else {
        control.setAttribute("aria-pressed", String(Boolean(here[key])));
      }
    }

    const translateHere = site.translatePage ?? Boolean(settings.translatePage);
    $("site-tr-switch").setAttribute("aria-pressed", String(translateHere));
    const note = $("tr-site-note");
    note.hidden = !(settings.translatePage && !translateHere);
    note.textContent = t("trSiteOffNote");
  }

  // ---------- Actions ----------

  $("calm").addEventListener("click", async () => {
    const settings = await Ease.storage.loadGlobalSettings();
    await Ease.storage.saveMySettings({ calmMode: !settings.calmMode });
    render();
  });

  $("low-energy").addEventListener("click", async () => {
    const settings = await Ease.storage.loadMySettings();
    const today = Ease.profiles.today();
    await Ease.storage.saveMySettings({ lowEnergyDate: settings.lowEnergyDate === today ? null : today });
    render();
  });

  function nextSize(current, direction) {
    const steps = Ease.TEXT_SIZE_STEPS;
    const index = Math.max(0, steps.indexOf(current));
    return steps[Math.min(steps.length - 1, Math.max(0, index + direction))];
  }

  async function changeTextSize(direction) {
    const settings = await Ease.storage.loadGlobalSettings();
    await Ease.storage.saveMySettings({ textSize: nextSize(settings.textSize, direction) });
    render();
  }

  async function changeSiteTextSize(direction) {
    const settings = await Ease.storage.loadGlobalSettings();
    const site = await Ease.storage.loadSiteSettings(host);
    const current = site.textSize ?? settings.textSize;
    await Ease.storage.saveSiteSettings(host, { textSize: nextSize(current, direction) });
    render();
  }

  $("site-smaller").addEventListener("click", () => changeSiteTextSize(-1));
  $("site-bigger").addEventListener("click", () => changeSiteTextSize(1));

  async function toggleSite() {
    const off = await Ease.storage.isSiteOff(host);
    await Ease.storage.setSiteOff(host, !off);
    render();
  }
  $("site-switch").addEventListener("click", toggleSite);
  $("home-site-off").addEventListener("click", toggleSite);

  // Main translation switch (all websites).
  $("tr-switch").addEventListener("click", async () => {
    const turningOn = $("tr-switch").getAttribute("aria-pressed") !== "true";
    // Start the download first, while Chrome still counts the click.
    const download = turningOn ? prepareWithStatus(trTarget) : null;
    const settings = await Ease.storage.loadGlobalSettings();
    await Ease.storage.saveMySettings({ translatePage: !settings.translatePage });
    render();
    await download;
  });

  // Translation for this website only.
  $("site-tr-switch").addEventListener("click", async () => {
    const settings = await Ease.storage.loadGlobalSettings();
    const site = await Ease.storage.loadSiteSettings(host);
    const translateHere = site.translatePage ?? Boolean(settings.translatePage);
    await Ease.storage.saveSiteSettings(host, { translatePage: !translateHere });
    render();
  });

  // "Translate this page now": turn translation on (here and everywhere if needed),
  // then ask the page to show the offer again. Closing the popup lets the user click it.
  $("tr-now").addEventListener("click", async () => {
    // Start the download first, while Chrome still counts the click.
    const download = prepareWithStatus(trTarget);
    $("tr-now").disabled = true;
    const settings = await Ease.storage.loadGlobalSettings();
    if (!settings.translatePage) {
      await Ease.storage.saveMySettings({ translatePage: true });
    }
    const site = await Ease.storage.loadSiteSettings(host);
    if (site.translatePage === false) {
      await Ease.storage.saveSiteSettings(host, { translatePage: true });
    }
    await download; // the page can now translate straight away, with no extra click
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "translateNow" });
    } catch (error) {
      // The page has no Ease script yet (for example it was open before Ease was installed).
    }
    window.close();
  });

  $("site-reset").addEventListener("click", async () => {
    await Ease.storage.clearSiteSettings(host);
    render();
  });

  $("reset").addEventListener("click", async () => {
    await Ease.storage.resetManual();
    render();
  });

  // ---------- Home: Hands-free, Reset to default, Redo the quiz ----------

  async function openHandsFree(errorBox) {
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
      window.close();
    } catch (error) {
      errorBox.textContent = t("hfPanelError");
      errorBox.hidden = false;
    }
  }
  $("home-handsfree").addEventListener("click", () => openHandsFree($("hf-home-error")));

  // Reset asks first (one tap by mistake must not undo someone's setup). No time limit: some people tap slowly.
  $("home-reset").addEventListener("click", () => {
    $("home-reset-note").hidden = true;
    $("home-reset-ask").hidden = false;
    $("home-reset").setAttribute("aria-expanded", "true");
    $("home-reset-yes").focus();
  });
  $("home-reset-no").addEventListener("click", () => {
    $("home-reset-ask").hidden = true;
    $("home-reset").setAttribute("aria-expanded", "false");
    $("home-reset").focus();
  });
  $("home-reset-yes").addEventListener("click", async () => {
    await Ease.storage.resetManual(); // also turns Hands-free off: the panel and every page stop
    $("home-reset-ask").hidden = true;
    $("home-reset").setAttribute("aria-expanded", "false");
    $("home-reset-note").textContent = t("homeResetDone");
    $("home-reset-note").hidden = false;
    render();
  });
  $("home-quiz").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html#quiz") });
    window.close();
  });

  // ---------- Reading view ----------

  $("reading-view").addEventListener("click", async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "readingView" });
      window.close();
    } catch (error) {
      // The page has no Ease script (it was open before Ease was installed): reload it first.
      showSummaryStatus(t("rvReload"));
    }
  });

  // ---------- Summarize ----------

  let summaryVoice = "en-CA";

  function showSummaryStatus(text) {
    $("summary").hidden = false;
    $("summary-status").textContent = text;
  }

  // Show the points in the list.
  function showPoints(points) {
    const list = $("summary-list");
    list.textContent = "";
    for (const point of points) {
      const li = document.createElement("li");
      li.textContent = point;
      list.appendChild(li);
    }
  }

  // The last summary for this page is kept until the browser closes (chrome.storage.session,
  // never saved to disk). So closing the popup does not lose it.
  const summaryKey = "summary:" + (tab && tab.url ? tab.url : "");

  async function showSavedSummary() {
    if (!host || !chrome.storage.session) {
      return;
    }
    const saved = (await chrome.storage.session.get(summaryKey))[summaryKey];
    if (saved && saved.points && saved.points.length) {
      $("summary").hidden = false;
      showPoints(saved.points);
      summaryVoice = saved.voice;
      $("summary-list").lang = summaryVoice;
      $("summary-read").hidden = !("speechSynthesis" in window);
    }
  }

  const SLOW_LIMIT = 5 * 60 * 1000; // 5 minutes

  $("summarize").addEventListener("click", async () => {
    const language = languageSelect.value;
    // Start Chrome's Summarizer FIRST, while Chrome still counts this click (needed for the download).
    let phase = "starting";
    const started = Ease.summarize.start(language, (p) => {
      if (phase !== "starting") {
        return;
      }
      // After 100%, Chrome still has to set the model up. This can take a few minutes the first time.
      showSummaryStatus(p >= 100 ? t("sumAlmost") : t("sumGetting", { p }));
    });
    started.catch(() => {}); // errors are handled below
    started.then(() => {
      phase = "writing";
      showSummaryStatus(t("sumWorking"));
    }, () => {});
    $("summarize").disabled = true;
    $("summary-list").textContent = "";
    $("summary-read").hidden = true;
    showSummaryStatus(t("sumWorking"));
    let slowTimer;
    try {
      const article = await chrome.tabs.sendMessage(tab.id, { type: "getArticle" });
      const tooSlow = new Promise((resolve, reject) => {
        slowTimer = setTimeout(() => reject(new Error("too-slow")), SLOW_LIMIT);
      });
      const result = await Promise.race([Ease.summarize.run(started, article, language, showPoints), tooSlow]);
      phase = "done";
      showPoints(result.points);
      const voiceLang = Ease.LANGUAGES.find((l) => l.translator === result.language);
      summaryVoice = voiceLang ? voiceLang.voice : "en-CA";
      $("summary-list").lang = summaryVoice;
      $("summary-status").textContent = "";
      $("summary-read").hidden = !("speechSynthesis" in window) || result.points.length === 0;
      if (chrome.storage.session && result.points.length) {
        chrome.storage.session.set({ [summaryKey]: { points: result.points, voice: summaryVoice } });
      }
    } catch (error) {
      phase = "done";
      const code = error && error.message;
      const noScript = /Receiving end|Could not establish/i.test(code || "");
      const key = noScript
        ? "rvReload"
        : code === "no-api" || code === "unavailable"
          ? "sumUnavailable"
          : code === "no-text"
            ? "sumNoText"
            : code === "too-slow"
              ? "sumSlow"
              : "sumFailed";
      showSummaryStatus(t(key));
    }
    clearTimeout(slowTimer);
    $("summarize").disabled = false;
  });

  $("summary-read").addEventListener("click", () => {
    speechSynthesis.cancel();
    const text = [...$("summary-list").children].map((li) => li.textContent).join(" ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = summaryVoice;
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
  });

  // ---------- Backup ----------

  $("backup").addEventListener("click", () => {
    // A full tab, because Chrome closes the popup when a file window opens.
    chrome.tabs.create({ url: chrome.runtime.getURL("backup/backup.html") });
    window.close();
  });

  // ---------- Quiz reminder ----------
  // Shown on Home after the user skipped the setup quiz.

  $("quiz-start").addEventListener("click", async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html#quiz") });
    window.close();
  });

  $("quiz-hide").addEventListener("click", async () => {
    await Ease.storage.saveMySettings({ quizNudge: false });
    $("quiz-nudge").hidden = true;
  });

  $("redo-setup").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html") });
    window.close();
  });

  // ---------- Start ----------

  buildHome();
  buildSettings();
  showSavedSummary();
  drawSync();
  const today = Ease.profiles.today();
  showCheckin(Boolean(firstSettings.dailyCheckin) && firstSettings.checkinDate !== today);
  render();
  Ease.soundLimit.setup(tab, (await Ease.storage.getEffectiveSettings(host)).settings);
})();
