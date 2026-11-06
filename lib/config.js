export const MAX_DOMAINS = 1000;
export const SITE_MODES = ["block", "schedule", "unblocked"];
export const defaults = () => ({ version: 2, sites: [], schedule: null });

export function normalizeDomain(input) {
  if (typeof input !== "string" || !input.trim())
    throw new Error("Enter a domain, such as example.com.");
  const value = input.trim();
  if (/[\\\s*]/u.test(value) || (value.includes("://") && !/^https?:\/\/[^/]/i.test(value))) {
    throw new Error("Use a domain or an HTTP/HTTPS URL, without wildcards.");
  }
  let url;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("Enter a valid domain or HTTP/HTTPS URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP/HTTPS URL without a username or password.");
  }
  const domain = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    labels.length < 2 ||
    /^[\d.]+$/.test(domain) ||
    !labels.every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    throw new Error(
      "Use a valid domain such as example.com. IP addresses and local names are unsupported.",
    );
  }
  return domain;
}

export function validateSchedule(value) {
  const validTime = (t) => typeof t === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (
    !value ||
    !Array.isArray(value.days) ||
    !value.days.length ||
    !value.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    !validTime(value.start) ||
    !validTime(value.end) ||
    value.start === value.end
  ) {
    throw new Error("Choose at least one day and different valid start and end times.");
  }
  return { days: [...new Set(value.days)].sort(), start: value.start, end: value.end };
}

export function validateSite(value) {
  if (!value || !SITE_MODES.includes(value.mode))
    throw new Error("Choose Block, Schedule, or Unblocked.");
  return { domain: normalizeDomain(value.domain), mode: value.mode };
}

export function validateConfig(value) {
  if (!value || value.version !== 2)
    throw new Error("Unsupported settings version. Reset settings to use this version.");
  if (!Array.isArray(value.sites)) throw new Error("Invalid site settings.");
  const sites = value.sites.map(validateSite).sort((a, b) => a.domain.localeCompare(b.domain));
  if (sites.length > MAX_DOMAINS) throw new Error(`You can save up to ${MAX_DOMAINS} sites.`);
  if (new Set(sites.map((s) => s.domain)).size !== sites.length)
    throw new Error("This site is already in your table.");
  return {
    version: 2,
    sites,
    schedule: value.schedule == null ? null : validateSchedule(value.schedule),
  };
}

export function readConfig(raw) {
  const warnings = [];
  const config = defaults();
  const warn = () => {
    if (!warnings.length)
      warnings.push(
        "Some saved settings were invalid and have been ignored. Review your sites and shared schedule.",
      );
  };
  if (raw === undefined) return { config, warnings, migrated: false };
  if (!raw || typeof raw !== "object") {
    warn();
    return { config, warnings, migrated: false };
  }
  if (raw.version !== undefined && ![1, 2].includes(raw.version))
    throw new Error("Unsupported settings version. Reset settings to use this version.");
  const migrated = raw.version !== 2;
  let sites = raw.sites;
  let schedule = raw.schedule;
  if (migrated) {
    const mode =
      { off: "unblocked", always: "block", schedule: "schedule" }[raw.mode] ?? "unblocked";
    sites = Array.isArray(raw.domains) ? raw.domains.map((domain) => ({ domain, mode })) : [];
    schedule = Array.isArray(raw.schedules) ? (raw.schedules[0] ?? null) : null;
    if (raw.schedules?.length > 1)
      warnings.push("Your first saved time range is now the shared schedule. Review it below.");
  }
  if (!Array.isArray(sites)) {
    warn();
    sites = [];
  }
  for (const entry of sites) {
    try {
      const site = validateSite(entry);
      if (!config.sites.some((s) => s.domain === site.domain)) {
        if (config.sites.length >= MAX_DOMAINS) {
          warn();
          continue;
        }
        config.sites.push(site);
      }
    } catch {
      warn();
    }
  }
  if (schedule != null) {
    try {
      config.schedule = validateSchedule(schedule);
    } catch {
      warn();
    }
  }
  return { config: validateConfig(config), warnings, migrated };
}
