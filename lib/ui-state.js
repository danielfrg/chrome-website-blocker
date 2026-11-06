import { validateConfig } from "./config.js";
import { isSiteBlocked } from "./schedule.js";

// An unpacked extension's pages can refresh before Chrome replaces its running worker.
// Never enable the new controls against an older message/configuration contract.
export function normalizeState(response) {
  if (!response || typeof response !== "object" || !("config" in response)) {
    throw new Error("No response from the extension. Try Retry.");
  }
  let config = null;
  if (response.config != null) {
    try {
      config = validateConfig(response.config);
    } catch {
      return {
        config: null,
        active: null,
        blockedCount: 0,
        warnings: [],
        saved: false,
        reloadRequired: true,
        error:
          "The background service needs an update. Reload the extension, then reopen this page.",
        nextTransition: null,
      };
    }
  }
  return {
    ...response,
    config,
    warnings: Array.isArray(response.warnings)
      ? response.warnings.filter((w) => typeof w === "string")
      : [],
    blockedCount: Number.isInteger(response.blockedCount)
      ? response.blockedCount
      : (config?.sites.filter((site) => isSiteBlocked(site, config, new Date())).length ?? 0),
    error: response.error || (config ? null : "Settings could not be loaded. Try Retry."),
    saved: response.saved === true,
    reloadRequired: false,
  };
}
