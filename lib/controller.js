import { defaults, readConfig, validateConfig, validateSchedule, validateSite } from "./config.js";
import { isBlocking, isSiteBlocked, isScheduleActive, nextTransition } from "./schedule.js";
import { compileRules } from "./rules.js";

export function createController(api, clock = () => new Date()) {
  let queue = Promise.resolve();
  const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };

  async function run(message) {
    let config = null,
      warnings = [],
      saved = false;
    try {
      await api.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
      if (message.type === "reset") config = defaults();
      else ({ config, warnings } = readConfig((await api.storage.local.get("config")).config));
      let candidate = structuredClone(config);
      switch (message.type) {
        case "getState":
          break;
        case "reset":
          break;
        case "addDomain": {
          const site = validateSite({ domain: message.domain, mode: message.mode ?? "block" });
          if (!candidate.sites.some((s) => s.domain === site.domain)) candidate.sites.push(site);
          break;
        }
        case "setSiteMode": {
          const site = validateSite({ domain: message.domain, mode: message.mode });
          const index = candidate.sites.findIndex((s) => s.domain === site.domain);
          if (index === -1)
            throw new Error(
              "This site was removed in another tab. Add it again to change its mode.",
            );
          candidate.sites[index] = site;
          break;
        }
        case "removeDomain":
          candidate.sites = candidate.sites.filter((s) => s.domain !== message.domain);
          break;
        case "saveSchedule": {
          const schedule = message.schedule == null ? null : validateSchedule(message.schedule);
          const expected =
            message.expectedSchedule == null ? null : validateSchedule(message.expectedSchedule);
          if (JSON.stringify(expected) !== JSON.stringify(candidate.schedule)) {
            throw new Error(
              "The shared schedule changed in another tab. Reload this page before saving.",
            );
          }
          candidate.schedule = schedule;
          break;
        }
        default:
          throw new Error("Unknown action. Reopen the extension and try again.");
      }
      if (message.type !== "getState") {
        candidate = validateConfig(candidate);
        try {
          await api.storage.local.set({ config: candidate });
        } catch {
          throw new Error(
            "Could not save settings. Your previous settings are unchanged. Try again.",
          );
        }
        config = candidate;
        saved = true;
        warnings = [];
      }

      // Repair alarms before applying rules so a transient rule failure still gets a retry.
      if (!(await api.alarms.get("health-check")))
        await api.alarms.create("health-check", { periodInMinutes: 1 });
      const now = clock();
      const transition = nextTransition(config, now);
      if (transition)
        await api.alarms.create("schedule-transition", { when: transition.getTime() });
      else await api.alarms.clear("schedule-transition");
      const rules = compileRules(config, now);
      const installed = await api.declarativeNetRequest.getDynamicRules();
      if (JSON.stringify(installed) !== JSON.stringify(rules)) {
        await api.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: installed.map((rule) => rule.id),
          addRules: rules,
        });
      }
      return {
        config,
        warnings,
        saved,
        active: isBlocking(config, now),
        blockedCount: config.sites.filter((s) => isSiteBlocked(s, config, now)).length,
        scheduleActive: isScheduleActive(config.schedule, now),
        error: null,
        nextTransition: transition?.toISOString() ?? null,
      };
    } catch (error) {
      const prefix = saved ? "Settings saved, but blocking could not be updated. Try Retry. " : "";
      return {
        config,
        warnings,
        saved,
        active: null,
        error: `${prefix}${error.message || "Could not update settings. Try again."}`,
        nextTransition: null,
      };
    }
  }
  return {
    handle: (message) => enqueue(() => run(message && typeof message === "object" ? message : {})),
    reconcile: () => enqueue(() => run({ type: "getState" })),
  };
}
