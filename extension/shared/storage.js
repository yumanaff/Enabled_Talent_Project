// The only file that reads or writes chrome.storage.
// Other files must call these functions. Do not use chrome.storage directly.
//
// Data saved on the device:
//   mySettings   -> the user's choices for all websites:
//                   active profiles, language, Low-energy day, and manual changes
//   siteSettings -> { "example.com": { ...settings only for that site } }
//   sitesOff     -> { "example.com": true } sites where the extension is turned off
//   formDrafts   -> text typed into forms, kept for 24 hours (Form Saver)

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  const KEY_MY = "mySettings";
  const KEY_SITES = "siteSettings";
  const KEY_OFF = "sitesOff";
  const KEY_DRAFTS = "formDrafts";
  const DRAFT_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours
  const KEY_SPOTS = "readingSpots";
  const KEY_LOG = "readingLog"; // Reading goals: which pages were finished, per day
  const KEY_TIME = "timeUsage"; // Time limits: seconds used today per website. Never synced or backed up.
  const LOG_DAYS = 14;
  const SPOT_LIFETIME = 30 * 24 * 60 * 60 * 1000; // 30 days
  const MAX_SPOTS = 100;

  // These keys are not "manual changes". "Reset" keeps them.
  const KEEP_ON_RESET = [
    "version",
    "language",
    "profiles",
    "lowEnergyDate",
    "onboardingDone",
    "quizNudge",
    "lockHash", // "Undo my manual changes" must not remove the caregiver's lock
    "triggerBlurSize",
    "dailyCheckin",
    "checkinDate",
    "checkinMood",
    "triggerWords", // the user typed these. "Reset" must not delete them.
    "timeLimits", // the user chose these limits. "Reset" must not delete them.
    "timeLimitExtra",
    "timeLimitPin",
    "translatePage"
  ];

  async function read(key, fallback) {
    const data = await chrome.storage.local.get(key);
    return data[key] ?? fallback;
  }

  async function write(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }

  Ease.storage = {
    // Only what the user saved. No defaults, no profiles.
    async loadSaved() {
      return read(KEY_MY, {});
    },

    // Defaults + the user's saved values. (Profiles NOT included.)
    async loadMySettings() {
      const saved = await this.loadSaved();
      return { ...Ease.DEFAULT_SETTINGS, ...saved };
    },

    // Settings for all websites: defaults + profiles + manual changes.
    // The popup shows these values.
    async loadGlobalSettings() {
      const saved = await this.loadSaved();
      const fromProfiles = Ease.profiles.combine(saved.profiles ?? []);
      return { ...Ease.DEFAULT_SETTINGS, ...fromProfiles, ...saved };
    },

    // Change some settings for all websites.
    async saveMySettings(changes) {
      const saved = await this.loadSaved();
      await write(KEY_MY, { ...saved, ...changes });
    },

    // Remove all manual changes. Profiles, language and Low-energy day stay.
    async resetManual() {
      const saved = await this.loadSaved();
      const kept = {};
      for (const key of KEEP_ON_RESET) {
        if (key in saved) {
          kept[key] = saved[key];
        }
      }
      await write(KEY_MY, kept);
    },

    // Turn one profile on or off.
    async toggleProfile(id) {
      const saved = await this.loadSaved();
      const list = saved.profiles ?? [];
      const next = list.includes(id) ? list.filter((p) => p !== id) : [...list, id];
      await this.saveMySettings({ profiles: next });
    },

    // Settings saved only for one website.
    async loadSiteSettings(host) {
      const all = await read(KEY_SITES, {});
      return all[host] ?? {};
    },

    async saveSiteSettings(host, changes) {
      const all = await read(KEY_SITES, {});
      all[host] = { ...(all[host] ?? {}), ...changes };
      await write(KEY_SITES, all);
    },

    async clearSiteSettings(host) {
      const all = await read(KEY_SITES, {});
      delete all[host];
      await write(KEY_SITES, all);
    },

    // Site off switch.
    async isSiteOff(host) {
      const off = await read(KEY_OFF, {});
      return off[host] === true;
    },

    async setSiteOff(host, isOff) {
      const off = await read(KEY_OFF, {});
      if (isOff) {
        off[host] = true;
      } else {
        delete off[host];
      }
      await write(KEY_OFF, off);
    },

    // The final settings used on one website.
    async getEffectiveSettings(host) {
      const global = await this.loadGlobalSettings();
      const site = await this.loadSiteSettings(host);
      const off = await this.isSiteOff(host);
      const settings = Ease.profiles.expand({ ...global, ...site });
      return { settings, off };
    },

    // ---------- Form Saver drafts ----------
    // { "host/path": { savedAt: 1700000000000, fields: { fieldKey: "typed text" } } }
    // Drafts are deleted after 24 hours, or when the form is sent.

    async loadDraft(pageKey) {
      const all = await read(KEY_DRAFTS, {});
      const draft = all[pageKey];
      if (!draft || Date.now() - draft.savedAt > DRAFT_LIFETIME) {
        return null;
      }
      return draft;
    },

    async saveDraft(pageKey, fields) {
      const all = await read(KEY_DRAFTS, {});
      // Remove old drafts from other pages while we are here.
      for (const [key, draft] of Object.entries(all)) {
        if (Date.now() - draft.savedAt > DRAFT_LIFETIME) {
          delete all[key];
        }
      }
      if (Object.keys(fields).length === 0) {
        delete all[pageKey];
      } else {
        all[pageKey] = { savedAt: Date.now(), fields };
      }
      await write(KEY_DRAFTS, all);
    },

    async clearDraft(pageKey) {
      const all = await read(KEY_DRAFTS, {});
      delete all[pageKey];
      await write(KEY_DRAFTS, all);
    },

    // Delete everything. Used by "Delete my data".
    // ---------- Remember where I stopped reading ----------
    // One spot per page: { savedAt, fraction (0 to 1), snippet (start of the paragraph) }.
    // Old spots are deleted after 30 days. We keep at most 100.

    async loadReadingSpot(pageKey) {
      const all = await read(KEY_SPOTS, {});
      const spot = all[pageKey];
      if (!spot || Date.now() - spot.savedAt > SPOT_LIFETIME) {
        return null;
      }
      return spot;
    },

    async saveReadingSpot(pageKey, spot) {
      const all = await read(KEY_SPOTS, {});
      all[pageKey] = { ...spot, savedAt: Date.now() };
      const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt);
      keys.forEach((key, index) => {
        if (index >= MAX_SPOTS || Date.now() - all[key].savedAt > SPOT_LIFETIME) {
          delete all[key];
        }
      });
      await write(KEY_SPOTS, all);
    },

    async clearReadingSpot(pageKey) {
      const all = await read(KEY_SPOTS, {});
      if (pageKey in all) {
        delete all[pageKey];
        await write(KEY_SPOTS, all);
      }
    },

    // ---------- Reading goals ----------
    // readingLog = { days: { "2026-10-15": ["cbc.ca/news/a", ...] }, celebrated: "2026-10-15" }
    // Only the last 14 days are kept. Never synced, never in backups.

    // ---------- Time limits ----------
    // timeUsage = { date: "2026-10-20", used: { "instagram.com": 2700 }, extra: { "instagram.com": 300 } }
    // A new day starts empty.

    async loadTimeUsage() {
      const data = await read(KEY_TIME, {});
      const today = Ease.profiles.today();
      if (data.date !== today) {
        return { date: today, used: {}, extra: {} };
      }
      return { date: today, used: data.used || {}, extra: data.extra || {} };
    },

    // Add seconds of use (or of extra time) for one website. Returns the new totals.
    async addTimeUsage(site, seconds, field = "used") {
      const usage = await this.loadTimeUsage();
      usage[field][site] = (usage[field][site] || 0) + seconds;
      await write(KEY_TIME, usage);
      return usage;
    },

    async loadReadingLog() {
      const log = await read(KEY_LOG, {});
      return { days: log.days || {}, celebrated: log.celebrated || null };
    },

    // Count a finished page for today. Returns how many pages are finished today.
    async markPageRead(pageKey) {
      const log = await this.loadReadingLog();
      const today = Ease.profiles.today();
      const list = log.days[today] || [];
      if (!list.includes(pageKey)) {
        list.push(pageKey);
      }
      log.days[today] = list;
      const keep = Object.keys(log.days).sort().slice(-LOG_DAYS);
      log.days = Object.fromEntries(keep.map((day) => [day, log.days[day]]));
      await write(KEY_LOG, log);
      return list.length;
    },

    // How many of the last 7 days had at least one finished page (local time zone).
    async readingDaysThisWeek() {
      const log = await this.loadReadingLog();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const pad = (n) => String(n).padStart(2, "0");
      const from = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(start.getDate());
      return Object.entries(log.days).filter(([day, pages]) => day >= from && pages.length > 0).length;
    },

    async markCelebrated() {
      const log = await this.loadReadingLog();
      log.celebrated = Ease.profiles.today();
      await write(KEY_LOG, log);
    },

    // ---------- Backup ----------
    // The file has settings only. Never form drafts or reading spots (those show what you read).

    async exportBackup() {
      return {
        app: "Ease",
        type: "settings-backup",
        format: 1,
        savedAt: new Date().toISOString(),
        mySettings: await read(KEY_MY, {}),
        siteSettings: await read(KEY_SITES, {}),
        sitesOff: await read(KEY_OFF, {})
      };
    },

    // Checks the file carefully. Only known settings with the right type are loaded.
    // Returns { settings: number, sites: number } or throws "bad-file".
    async importBackup(data) {
      if (!data || data.app !== "Ease" || data.type !== "settings-backup" || typeof data.mySettings !== "object") {
        throw new Error("bad-file");
      }
      const clean = (object) => {
        const result = {};
        for (const [key, value] of Object.entries(object || {})) {
          if (!(key in Ease.DEFAULT_SETTINGS)) {
            continue;
          }
          const expected = Ease.DEFAULT_SETTINGS[key];
          const ok =
            expected === null
              ? value === null || typeof value === "string"
              : Array.isArray(expected)
                ? Array.isArray(value) && value.every((v) => typeof v === "string")
                : typeof value === typeof expected;
          if (ok) {
            result[key] = value;
          }
        }
        return result;
      };
      const mySettings = clean(data.mySettings);
      const siteSettings = {};
      for (const [host, values] of Object.entries(data.siteSettings || {})) {
        if (/^[a-z0-9.-]+$/i.test(host) && values && typeof values === "object") {
          siteSettings[host] = clean(values);
        }
      }
      const sitesOff = {};
      for (const [host, value] of Object.entries(data.sitesOff || {})) {
        if (/^[a-z0-9.-]+$/i.test(host) && value === true) {
          sitesOff[host] = true;
        }
      }
      await chrome.storage.local.set({ [KEY_MY]: mySettings, [KEY_SITES]: siteSettings, [KEY_OFF]: sitesOff });
      const hosts = new Set([...Object.keys(siteSettings), ...Object.keys(sitesOff)]);
      return { settings: Object.keys(mySettings).length, sites: hosts.size };
    },

    async deleteAll() {
      await chrome.storage.local.clear();
    },

    // Call the callback when any saved data changes.
    onChange(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
          callback(changes);
        }
      });
    }
  };
})();
