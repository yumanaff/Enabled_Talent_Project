// Time limits: small helpers used by the popup and by websites.
// A limit is saved as text: "instagram.com|60" (website | minutes per day).

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  // "https://www.Instagram.com/reels/" -> "instagram.com". Returns "" if it is not a website name.
  function cleanSite(text) {
    let site = String(text || "").trim().toLowerCase();
    site = site.replace(/^[a-z]+:\/\//, "").split(/[/?#:\s]/)[0].replace(/^www\./, "");
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(site) ? site : "";
  }

  function parse(list) {
    const result = [];
    for (const item of list || []) {
      const [site, minutes] = String(item).split("|");
      const clean = cleanSite(site);
      const number = Number(minutes);
      if (clean && number > 0) {
        result.push({ site: clean, minutes: number });
      }
    }
    return result;
  }

  // The limit for this website, or null. "m.youtube.com" matches "youtube.com".
  function limitFor(host, list) {
    const clean = String(host || "").toLowerCase().replace(/^www\./, "");
    return parse(list).find((limit) => clean === limit.site || clean.endsWith("." + limit.site)) || null;
  }

  Ease.timeRules = { cleanSite, parse, limitFor, MINUTES: [15, 30, 45, 60, 90, 120, 180] };
})();
