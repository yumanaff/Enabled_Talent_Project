// Setup page (onboarding).
// Opens on first install, or from "Redo setup" in the popup.
//
// Steps:
//   1. welcome -> language, privacy note, "help me set up" or "skip"
//   2. needs   -> the user picks what makes websites hard (no diagnosis asked)
//   3. quiz    -> "try it" questions, ONLY for the needs they picked
//   4. preview -> before and after, daily check-in choice, save
//   5. done
//
// Each need turns on a matching profile.
// Each quiz answer saves exact settings. Quiz answers win over profiles.

(async function () {
  const Ease = globalThis.Ease;
  const t = (key, params) => Ease.i18n.t(key, params);
  const app = document.getElementById("app");

  // ---------- Data ----------

  // Needs the user can pick. Each one turns on a profile and asks some questions.
  const NEEDS = [
    { id: "hardToRead", profile: "readableTypography", questions: ["font", "spacing", "guide", "read"] },
    { id: "smallFaint", profile: "largeTextContrast", questions: ["size", "contrast", "cursor"] },
    { id: "colours", profile: null, questions: ["color"] },
    { id: "motion", profile: "reducedMotion", questions: ["motion"] },
    { id: "bright", profile: "lightSensitivity", questions: ["contrast"] },
    { id: "distracted", profile: "focusSupport", questions: ["guide", "motion"] },
    { id: "pressure", profile: null, questions: ["pressure"] },
    { id: "sounds", profile: "sensoryCalm", questions: ["volume"] },
    { id: "hearing", profile: "hearingSupport", questions: [] },
    { id: "clicking", profile: "steadyHands", questions: ["cursor", "tremor"] },
    { id: "confusing", profile: "olderAdults", questions: ["size"] },
    { id: "scams", profile: "scamSafety", questions: [] }
  ];

  // Questions are always asked in this order.
  const QUESTION_ORDER = ["size", "font", "spacing", "contrast", "color", "motion", "volume", "guide", "pressure", "cursor", "tremor", "read"];

  const SAMPLE_STYLE = {
    contrast: {
      normal: "background:#FBFBF9;color:#2A2F36;",
      dark: "background:#1D2026;color:#E6E6E1;",
      high: "background:#FFFFFF;color:#000000;",
      soft: "background:#F1EADB;color:#3A3A36;"
    },
    font: {
      default: 'font-family:"Times New Roman",serif;',
      readable: "font-family:Verdana,Tahoma,sans-serif;",
      atkinson: 'font-family:"Ease Atkinson",sans-serif;',
      dyslexic: 'font-family:"Ease OpenDyslexic",sans-serif;'
    },
    spacing: {
      normal: "line-height:1.3;letter-spacing:0;word-spacing:0;",
      wide: "line-height:1.6;letter-spacing:0.06em;word-spacing:0.12em;",
      extra: "line-height:2;letter-spacing:0.12em;word-spacing:0.16em;"
    },
    guide: {
      off: "",
      line: "background:linear-gradient(transparent 36%, rgba(74,90,140,0.18) 36%, rgba(74,90,140,0.18) 64%, transparent 64%);",
      mask: "background:linear-gradient(rgba(20,22,26,0.45) 36%, transparent 36%, transparent 64%, rgba(20,22,26,0.45) 64%);"
    }
  };

  const SIZE_PX = { 100: 16, 125: 20, 150: 24, 175: 28 };

  // Each question: a title, an optional picture, and answer options.
  // Each option: label, optional preview style, settings to save, profiles to add.
  function questions() {
    const sample = t("ob_sample");
    return {
      size: {
        title: "q_size",
        options: [100, 125, 150, 175].map((size) => ({
          label: size + "%",
          preview: { text: sample, style: "font-size:" + SIZE_PX[size] + "px;" },
          settings: { textSize: size }
        }))
      },
      font: {
        title: "q_font",
        options: ["default", "readable", "atkinson", "dyslexic"].map((font) => ({
          label: t("option_" + font),
          preview: { text: sample, style: SAMPLE_STYLE.font[font] },
          settings: { fontFamily: font }
        }))
      },
      spacing: {
        title: "q_spacing",
        options: ["normal", "wide", "extra"].map((space) => ({
          label: t("option_" + space),
          preview: { text: sample, style: SAMPLE_STYLE.spacing[space] },
          settings: { lineHeight: space, letterSpacing: space }
        }))
      },
      contrast: {
        title: "q_contrast",
        options: ["normal", "dark", "high", "soft"].map((mode) => ({
          label: t("option_" + mode),
          preview: { text: sample, style: SAMPLE_STYLE.contrast[mode] + "padding:10px;border-radius:8px;" },
          settings: { contrast: mode }
        }))
      },
      color: {
        title: "q_color",
        picture: "chart",
        options: [
          { label: t("ans_colorYes"), settings: {} },
          { label: t("ans_colorNo"), settings: { highlightLinks: true }, profiles: ["colorDifferentiation"] }
        ]
      },
      motion: {
        title: "q_motion",
        picture: "busy",
        options: [
          { label: t("ans_motionNone"), settings: {} },
          { label: t("ans_motionSome"), settings: { pauseAnimations: true } },
          { label: t("ans_motionLot"), settings: { pauseAnimations: true, calmMode: true } }
        ]
      },
      volume: {
        title: "q_volume",
        options: [
          { label: t("ans_volumeOff"), settings: { volumeLimit: "off" } },
          { label: t("option_70"), settings: { volumeLimit: "70" } },
          { label: t("option_50"), settings: { volumeLimit: "50" } },
          { label: t("option_30"), settings: { volumeLimit: "30" } },
          { label: t("option_15"), settings: { volumeLimit: "15" } }
        ]
      },
      guide: {
        title: "q_guide",
        options: ["off", "line", "mask"].map((mode) => ({
          label: t("ans_guide_" + mode),
          preview: { text: sample + " " + sample, style: SAMPLE_STYLE.guide[mode] + "padding:6px;" },
          settings: { readingGuide: mode }
        }))
      },
      pressure: {
        title: "q_pressure",
        picture: "shop",
        options: [
          { label: t("ans_pressureYes"), settings: { pressureRemover: true }, profiles: ["lowStress"] },
          { label: t("ans_pressureNo"), settings: {} }
        ]
      },
      cursor: {
        title: "q_cursor",
        options: [
          { label: t("ans_cursorNormal"), cursor: 20, settings: { bigCursor: false } },
          { label: t("ans_cursorBig"), cursor: 44, settings: { bigCursor: true } }
        ]
      },
      tremor: {
        title: "q_tremor",
        options: [
          { label: t("ans_tremorNo"), settings: { tremorFilter: "off" } },
          { label: t("ans_tremorSome"), settings: { tremorFilter: "light", typingFilter: "light", biggerTargets: true } },
          { label: t("ans_tremorOften"), settings: { tremorFilter: "strong", typingFilter: "strong", biggerTargets: true, scrollButtons: true } }
        ]
      },
      read: {
        title: "q_read",
        picture: "speech",
        options: [
          { label: t("ans_readNo"), settings: { readAloud: "off" } },
          { label: t("ans_readSlow"), settings: { readAloud: "slow" } },
          { label: t("ans_readNormal"), settings: { readAloud: "normal" } }
        ]
      }
    };
  }

  // ---------- State ----------

  const state = {
    step: "welcome",
    language: "en",
    needs: new Set(),
    questionIds: [],
    index: 0,
    answers: {}, // questionId -> chosen option
    dailyCheckin: true,
    // "Set up for someone else": a caregiver answers for a parent or friend.
    // The result is saved to a file for THEIR computer. This computer's settings do not change.
    forOther: false,
    otherLanguage: "en",
    otherPin: "",
    message: "" // a short note on the welcome screen (for example after loading a file)
  };

  const saved = await Ease.storage.loadMySettings();
  state.language = saved.language;
  await Ease.i18n.load(state.language);

  // ---------- Small DOM helper ----------
  // h("button", { class: "x", onclick: fn }, "text", child)
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) {
        continue;
      }
      if (name.startsWith("on")) {
        el.addEventListener(name.slice(2), value);
      } else if (name === "class") {
        el.className = value;
      } else {
        el.setAttribute(name, value === true ? "" : value);
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) {
        continue;
      }
      el.append(child);
    }
    return el;
  }

  function progress(stepNumber) {
    return h(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-valuemin": "1",
        "aria-valuemax": "3",
        "aria-valuenow": String(stepNumber),
        "aria-label": t("ob_step", { n: stepNumber, m: 3 })
      },
      [1, 2, 3].map((n) => h("span", { class: n <= stepNumber ? "done" : "" }))
    );
  }

  function languagePicker() {
    const select = h(
      "select",
      {
        id: "language",
        onchange: async (event) => {
          state.language = event.target.value;
          // Start the language download now, while Chrome still counts the click.
          Ease.translatorSetup.prepare(state.language);
          await Ease.storage.saveMySettings({ language: state.language, translatePage: state.language !== "en" });
          await Ease.i18n.load(state.language);
          draw();
        }
      },
      Ease.LANGUAGES.map((lang) => h("option", { value: lang.code }, lang.name))
    );
    select.value = state.language;
    return h("label", { class: "lang", for: "language" }, t("language"), select);
  }

  function focusHeading() {
    const heading = app.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus();
    }
  }

  // ---------- Steps ----------

  function drawWelcome() {
    return [
      h("div", { class: "topbar" }, progress(1), languagePicker()),
      h("div", { class: "logo", "aria-hidden": "true" }, "≈"),
      h("h1", {}, t("ob_title")),
      h("p", { class: "lead" }, t("ob_intro")),
      h("div", { class: "privacy" }, t("ob_privacy")),
      h("p", {}, h("strong", {}, t("ob_consentQ"))),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "primary", onclick: () => go("needs") }, t("ob_yes")),
        h("button", { class: "secondary", onclick: skip }, t("ob_skip"))
      ),
      h(
        "div",
        { class: "other-ways" },
        h("button", { class: "text-button", onclick: startForOther }, t("ob_forOther")),
        h(
          "label",
          { class: "text-button file-label" },
          h("input", { type: "file", accept: ".json,application/json", onchange: loadSetupFile }),
          t("ob_haveFile")
        )
      ),
      state.message ? h("p", { class: "message", role: "status" }, state.message) : null
    ];
  }

  function startForOther() {
    state.forOther = true;
    state.otherLanguage = state.language;
    go("needs");
  }

  // On the parent's computer: load the file the caregiver made.
  async function loadSetupFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      if (file.size > 1024 * 1024) {
        throw new Error("bad-file");
      }
      const result = await Ease.storage.importBackup(JSON.parse(await file.text()));
      const saved = await Ease.storage.loadMySettings();
      state.language = saved.language;
      await Ease.i18n.load(state.language);
      state.message = t("bkLoaded", { n: result.settings, m: result.sites });
      go("done");
    } catch (error) {
      state.message = t("bkBad");
      draw();
    }
  }

  // Their language and an optional PIN, shown on the last step in "someone else" mode.
  function forOtherOptions() {
    const select = h(
      "select",
      {
        id: "other-language",
        onchange: (event) => {
          state.otherLanguage = event.target.value;
        }
      },
      ...Ease.LANGUAGES.map((lang) => h("option", { value: lang.code }, lang.name))
    );
    select.value = state.otherLanguage;
    const pin = h("input", {
      id: "other-pin",
      type: "password",
      inputmode: "numeric",
      maxlength: "4",
      autocomplete: "off",
      value: state.otherPin,
      oninput: (event) => {
        state.otherPin = event.target.value;
      }
    });
    return h(
      "div",
      { class: "other-box" },
      h("label", { class: "field", for: "other-language" }, h("strong", {}, t("ob_theirLanguage")), select),
      h(
        "label",
        { class: "field", for: "other-pin" },
        h("span", {}, h("strong", {}, t("ob_theirPin")), h("span", { class: "check-help" }, t("ob_theirPinHelp"))),
        pin
      ),
      state.message ? h("p", { class: "message error", role: "alert" }, state.message) : null
    );
  }

  function drawNeeds() {
    const count = state.needs.size;
    return [
      h("div", { class: "topbar" }, progress(2)),
      h("h1", { class: "step-title" }, t("ob_needsTitle")),
      h("p", { class: "lead" }, t("ob_needsSub")),
      h(
        "div",
        { class: "grid" },
        NEEDS.map((need) =>
          h(
            "button",
            {
              class: "choice",
              "aria-pressed": String(state.needs.has(need.id)),
              onclick: () => {
                if (state.needs.has(need.id)) {
                  state.needs.delete(need.id);
                } else {
                  state.needs.add(need.id);
                }
                draw(false);
              }
            },
            t("card_" + need.id)
          )
        )
      ),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "secondary", onclick: () => go("welcome") }, t("ob_back")),
        h(
          "button",
          { class: "primary", disabled: count === 0, onclick: startQuiz },
          count === 0 ? t("ob_next") : t("ob_selected", { n: count })
        )
      )
    ];
  }

  function drawPicture(kind) {
    if (kind === "chart") {
      return h(
        "div",
        { class: "picture", role: "img", "aria-label": t("ob_chartAlt") },
        h(
          "div",
          { class: "chart" },
          h("div", { class: "bar", style: "height:90px;background:#C0392B;" }),
          h("div", { class: "bar", style: "height:110px;background:#4F9A3A;" }),
          h("div", { class: "bar", style: "height:70px;background:#C0392B;" }),
          h("div", { class: "bar", style: "height:100px;background:#4F9A3A;" })
        )
      );
    }
    if (kind === "busy") {
      // A still picture only. Never show real motion or flashing here.
      return h(
        "div",
        { class: "picture" },
        h(
          "div",
          { class: "busy", "aria-hidden": "true" },
          ["↻", "▶", "★", "→", "!", "↻"].map((symbol) => h("span", {}, symbol))
        ),
        h("p", { class: "picture-note" }, t("ob_motionNote"))
      );
    }
    if (kind === "shop") {
      return h(
        "div",
        { class: "picture shop" },
        h("strong", {}, t("ob_shopItem")),
        h("span", { class: "shop-badge" }, t("ob_shopSample"))
      );
    }
    if (kind === "speech") {
      return h(
        "div",
        { class: "picture" },
        h("p", { style: "margin:0 0 10px;" }, t("ob_sample")),
        h("button", { class: "secondary", onclick: playSample }, t("ob_playSample"))
      );
    }
    return null;
  }

  function cursorPicture(size) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M6 3 L6 39 L15 30 L21 44 L28 41 L22 27 L35 27 Z");
    path.setAttribute("fill", "#1A1D22");
    path.setAttribute("stroke", "#FFFFFF");
    path.setAttribute("stroke-width", "3");
    svg.appendChild(path);
    return svg;
  }

  function drawQuiz() {
    const all = questions();
    const id = state.questionIds[state.index];
    const question = all[id];
    const chosen = state.answers[id];

    const options = question.options.map((option, i) =>
      h(
        "button",
        {
          class: "choice",
          "aria-pressed": String(chosen === i),
          onclick: () => {
            state.answers[id] = i;
            draw(false);
          }
        },
        option.preview
          ? [h("span", { class: "choice-label" }, option.label), h("span", { class: "sample", style: option.preview.style }, option.preview.text)]
          : option.cursor
            ? h("span", { class: "cursor-row" }, cursorPicture(option.cursor), option.label)
            : option.label
      )
    );

    const isLast = state.index === state.questionIds.length - 1;
    return [
      h("div", { class: "topbar" }, progress(3), h("span", { class: "lead" }, t("ob_question", { n: state.index + 1, m: state.questionIds.length }))),
      h("h1", { class: "step-title" }, t(question.title)),
      question.options[0].preview ? h("p", { class: "lead" }, t("ob_tapBest")) : null,
      drawPicture(question.picture),
      h("div", { class: "list" }, options),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "secondary", onclick: backInQuiz }, t("ob_back")),
        h(
          "button",
          {
            class: "secondary",
            onclick: () => {
              delete state.answers[id]; // "Not sure" = no change
              nextInQuiz();
            }
          },
          t("ob_notSure")
        ),
        h("button", { class: "primary", disabled: chosen === undefined, onclick: nextInQuiz }, isLast ? t("ob_seeResult") : t("ob_next"))
      )
    ];
  }

  function drawPreview() {
    const final = finalSettings();
    const s = Ease.profiles.expand({ ...Ease.DEFAULT_SETTINGS, ...Ease.profiles.combine(final.profiles), ...final.settings });

    const afterStyle =
      "font-size:" + (SIZE_PX[s.textSize] || 30) + "px;" +
      (SAMPLE_STYLE.font[s.fontFamily] || "") +
      (SAMPLE_STYLE.spacing[s.lineHeight] || "") +
      (SAMPLE_STYLE.contrast[s.contrast] || "") +
      "padding:10px;border-radius:8px;display:block;";
    const beforeStyle = 'font-size:16px;font-family:"Times New Roman",serif;line-height:1.3;padding:10px;display:block;';

    return [
      h("div", { class: "topbar" }, progress(3)),
      h("h1", { class: "step-title" }, t("ob_previewTitle")),
      h(
        "div",
        { class: "compare" },
        h("div", { class: "compare-box" }, h("span", { class: "compare-title" }, t("ob_before")), h("span", { style: beforeStyle }, t("ob_previewText"))),
        h("div", { class: "compare-box" }, h("span", { class: "compare-title" }, t("ob_after")), h("span", { style: afterStyle }, t("ob_previewText")))
      ),
      h(
        "label",
        { class: "check" },
        h("input", {
          type: "checkbox",
          checked: state.dailyCheckin,
          onchange: (event) => {
            state.dailyCheckin = event.target.checked;
          }
        }),
        h("span", {}, h("strong", {}, t("ob_checkinAsk")), h("span", { class: "check-help" }, t("ob_checkinHelp")))
      ),
      state.forOther ? forOtherOptions() : null,
      h(
        "div",
        { class: "actions" },
        h("button", { class: "secondary", onclick: () => go("quiz") }, t("ob_back")),
        h("button", { class: "primary", onclick: save }, t(state.forOther ? "ob_saveFile" : "ob_save"))
      )
    ];
  }

  // After "Save their setup file": how to use it on their computer.
  function drawDoneOther() {
    return [
      h("div", { class: "logo", "aria-hidden": "true" }, "≈"),
      h("h1", {}, t("ob_fileReadyTitle")),
      h("p", { class: "lead" }, t("ob_fileReadyText")),
      h(
        "ol",
        { class: "steps-list" },
        h("li", {}, t("ob_fileStep1")),
        h("li", {}, t("ob_fileStep2")),
        h("li", {}, t("ob_fileStep3"))
      ),
      h("div", { class: "privacy" }, t("ob_filePrivacy")),
      h("div", { class: "actions" }, h("button", { class: "primary", onclick: closeTab }, t("ob_close")))
    ];
  }

  function drawDone() {
    return [
      h("div", { class: "logo", "aria-hidden": "true" }, "≈"),
      h("h1", {}, t("ob_doneTitle")),
      state.message ? h("p", { class: "message", role: "status" }, state.message) : null,
      h("p", { class: "lead" }, t("ob_doneText")),
      h("div", { class: "privacy" }, t("ob_pinHint")),
      h("div", { class: "actions" }, h("button", { class: "primary", onclick: closeTab }, t("ob_close")))
    ];
  }

  // ---------- Navigation ----------

  // moveFocus = false when only a selection changed (keep focus where it is).
  function draw(moveFocus = true) {
    const active = document.activeElement;
    const activeIndex = active ? [...app.querySelectorAll("button")].indexOf(active) : -1;

    const steps = { welcome: drawWelcome, needs: drawNeeds, quiz: drawQuiz, preview: drawPreview, done: drawDone, doneOther: drawDoneOther };
    const nodes = steps[state.step]().filter(Boolean);
    if (state.forOther && ["needs", "quiz", "preview"].includes(state.step)) {
      // Remind the caregiver on every step: answer for THEM.
      nodes.splice(1, 0, h("div", { class: "for-other", role: "note" }, t("ob_forOtherBanner")));
    }
    app.textContent = "";
    app.append(...nodes);

    if (moveFocus) {
      focusHeading();
    } else if (activeIndex >= 0) {
      const again = app.querySelectorAll("button")[activeIndex];
      if (again) {
        again.focus();
      }
    }
  }

  function go(step) {
    if (step !== "done") {
      state.message = ""; // old notes do not follow the user to the next screen
    }
    state.step = step;
    draw();
  }

  function startQuiz() {
    const wanted = new Set();
    for (const need of NEEDS) {
      if (state.needs.has(need.id)) {
        need.questions.forEach((q) => wanted.add(q));
      }
    }
    state.questionIds = QUESTION_ORDER.filter((q) => wanted.has(q));
    state.index = 0;
    go(state.questionIds.length ? "quiz" : "preview");
  }

  function nextInQuiz() {
    speechSynthesis.cancel();
    if (state.index < state.questionIds.length - 1) {
      state.index += 1;
      draw();
    } else {
      go("preview");
    }
  }

  function backInQuiz() {
    speechSynthesis.cancel();
    if (state.index > 0) {
      state.index -= 1;
      draw();
    } else {
      go("needs");
    }
  }

  function playSample() {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(t("ob_sample"));
    const lang = Ease.LANGUAGES.find((l) => l.code === state.language);
    utterance.lang = lang ? lang.voice : "en-CA";
    speechSynthesis.speak(utterance);
  }

  // ---------- Saving ----------

  // Combine needs (profiles) and quiz answers (exact settings).
  function finalSettings() {
    const profiles = new Set();
    for (const need of NEEDS) {
      if (state.needs.has(need.id) && need.profile) {
        profiles.add(need.profile);
      }
    }
    const all = questions();
    const settings = {};
    for (const [id, index] of Object.entries(state.answers)) {
      if (!state.questionIds.includes(id)) {
        continue; // answer from a need the user un-picked
      }
      const option = all[id].options[index];
      Object.assign(settings, option.settings);
      (option.profiles || []).forEach((p) => profiles.add(p));
    }
    return { profiles: [...profiles], settings };
  }

  // "Someone else" mode: make a file for their computer. This computer does not change.
  async function saveForOther() {
    const pin = state.otherPin.trim();
    if (pin && !Ease.lock.isValidPin(pin)) {
      state.message = t("lockNeed4");
      draw(false);
      return;
    }
    state.message = "";
    const final = finalSettings();
    const mySettings = {
      ...final.settings,
      profiles: final.profiles,
      language: state.otherLanguage,
      translatePage: state.otherLanguage !== "en",
      onboardingDone: true,
      quizNudge: false,
      dailyCheckin: state.dailyCheckin,
      lockHash: pin ? await Ease.lock.makeHash(pin) : null
    };
    const file = {
      app: "Ease",
      type: "settings-backup",
      format: 1,
      savedAt: new Date().toISOString(),
      forSomeoneElse: true,
      mySettings,
      siteSettings: {},
      sitesOff: {}
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ease-setup-for-someone-" + Ease.profiles.today() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    go("doneOther");
  }

  async function save() {
    if (state.forOther) {
      saveForOther();
      return;
    }
    Ease.translatorSetup.prepare(state.language); // this click can start the language download
    const final = finalSettings();
    await Ease.storage.resetManual(); // "Redo setup" starts clean
    await Ease.storage.saveMySettings({
      ...final.settings,
      profiles: final.profiles,
      language: state.language,
      translatePage: state.language !== "en",
      onboardingDone: true,
      quizNudge: false, // the quiz is done: no need to remind
      dailyCheckin: state.dailyCheckin
    });
    go("done");
  }

  async function skip() {
    Ease.translatorSetup.prepare(state.language); // this click can start the language download
    // quizNudge: Home will offer the quiz again, in case the user wants it later.
    // dailyCheckin: the mood question stays on after Skip too (the user can turn it off any time).
    await Ease.storage.saveMySettings({ onboardingDone: true, quizNudge: true, dailyCheckin: true, language: state.language, translatePage: state.language !== "en" });
    go("done");
  }

  function closeTab() {
    chrome.tabs.getCurrent((tab) => {
      if (tab) {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
    });
  }

  // "Start the quiz" from the popup opens this page with #quiz: skip the welcome screen.
  if (location.hash === "#quiz") {
    state.step = "needs";
  }
  // "Set up Ease for someone else" from the popup.
  if (location.hash === "#for-someone") {
    state.forOther = true;
    state.otherLanguage = state.language;
    state.step = "needs";
  }

  draw();
})();
