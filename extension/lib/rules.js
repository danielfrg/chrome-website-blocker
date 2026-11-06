import { isSiteBlocked } from "./schedule.js";

export function compileRules(config, now) {
  return config.sites.map((site, index) => ({
    id: index + 1,
    // The most-specific configured hostname wins, including explicit Unblocked exceptions.
    priority: site.domain.split(".").length,
    action: { type: isSiteBlocked(site, config, now) ? "block" : "allow" },
    condition: {
      regexFilter: `^https?://([a-z0-9-]+\\.)*${site.domain.replace(/\./g, "\\.")}\\.?(:[0-9]+)?/`,
      isUrlFilterCaseSensitive: false,
      resourceTypes: ["main_frame"],
    },
  }));
}
