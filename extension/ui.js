import { normalizeDomain } from "./lib/config.js";
import { normalizeState } from "./lib/ui-state.js";
const $ = (id) => document.getElementById(id);
const isOptions = document.body.classList.contains("options");
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOrder = [1, 2, 3, 4, 5, 6, 0];
const modes = [
  ["block", "Block"],
  ["schedule", "Schedule"],
  ["unblocked", "Unblocked"],
];
let state = null,
  pending = false,
  currentDomain = null,
  scheduleDirty = false,
  scheduleSnapshot = null,
  focusAfter = null;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function feedback(message, error = false, reloadRequired = false) {
  const inline = isOptions && !error;
  $("feedback").textContent = inline ? "" : message;
  $("feedback").hidden = inline || !message;
  if (isOptions) {
    $("header-feedback").textContent = inline ? message : "";
    $("header-feedback").hidden = !inline || !message;
  }
  $("feedback").dataset.error = String(error);
  $("retry").hidden = !error || reloadRequired;
  $("reload-extension").hidden = !reloadRequired;
}
function scheduleFeedback(message) {
  if (!isOptions) return;
  $("schedule-feedback").textContent = message;
  $("schedule-feedback").hidden = !message;
}
function busy(value) {
  pending = value;
  for (const fieldset of document.querySelectorAll("fieldset[data-controls]"))
    fieldset.disabled = value || !state?.config;
  $("retry").disabled = value;
  if ($("reset")) $("reset").disabled = value;
  updateCurrentSite();
}
function updateCurrentSite() {
  if (isOptions) return;
  const site = state?.config?.sites.find((s) => s.domain === currentDomain);
  $("current-note").textContent = currentDomain || "Open a regular website to add it here.";
  $("add-current").hidden = Boolean(site);
  $("add-current").disabled = pending || !state?.config || !currentDomain;
  $("current-mode").hidden = !site;
  if (site) $("current-mode").value = site.mode;
}
function modeSelect(site) {
  const select = node("select");
  select.id = `mode-${site.domain}`;
  select.setAttribute("aria-label", `Blocking for ${site.domain}`);
  for (const [value, label] of modes) {
    const option = node("option", label);
    option.value = value;
    select.append(option);
  }
  select.value = site.mode;
  select.addEventListener("change", () =>
    request({ type: "setSiteMode", domain: site.domain, mode: select.value }),
  );
  return select;
}
function renderSites(sites) {
  const focused = document.activeElement?.id;
  $("sites").replaceChildren();
  if (!sites.length) {
    const row = node("tr");
    const cell = node("td", "No sites yet. Add your first site below.", "empty");
    cell.colSpan = 3;
    row.append(cell);
    $("sites").append(row);
  }
  for (const site of sites) {
    const row = node("tr");
    const domain = node("td", site.domain, "domain-name");
    const mode = node("td");
    mode.append(modeSelect(site));
    const controls = node("td");
    const remove = node("button", "Remove", "text-button danger");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${site.domain}`);
    remove.addEventListener("click", () =>
      request({ type: "removeDomain", domain: site.domain }, () => {
        focusAfter = "domain";
      }),
    );
    controls.append(remove);
    row.append(domain, mode, controls);
    $("sites").append(row);
  }
  if (focused?.startsWith("mode-")) focusAfter = focused;
}
function loadSchedule() {
  scheduleSnapshot = state?.config?.schedule ? structuredClone(state.config.schedule) : null;
  scheduleDirty = false;
  const schedule = scheduleSnapshot;
  $("start").value = schedule?.start ?? "09:00";
  $("end").value = schedule?.end ?? "17:00";
  for (const input of $("days").querySelectorAll("input"))
    input.checked = (schedule?.days ?? [1, 2, 3, 4, 5]).includes(Number(input.value));
  $("clear-schedule").hidden = !schedule;
}
function render(next) {
  state = next;
  const error = Boolean(next.error),
    total = next.config?.sites.length ?? 0;
  $("status").dataset.active = String(next.active === true);
  $("status").dataset.error = String(error);
  $("status").textContent = error
    ? "Blocking needs attention"
    : !total
      ? "No sites added yet"
      : `${next.blockedCount} of ${total} ${total === 1 ? "site" : "sites"} blocked now`;
  if (error) feedback(next.error, true, next.reloadRequired);
  else if (next.warnings.length) feedback(next.warnings.join(" "), true);
  if (next.config && isOptions) {
    renderSites(next.config.sites);
    if (!scheduleDirty) loadSchedule();
  }
  busy(pending);
}
async function request(message, onSaved, announce = true) {
  if (pending) return;
  const scheduleSave = isOptions && message.type === "saveSchedule";
  busy(true);
  if (announce) {
    if (scheduleSave) {
      feedback("");
      scheduleFeedback("Saving…");
    } else feedback("Saving…");
  }
  try {
    const next = normalizeState(await chrome.runtime.sendMessage(message));
    feedback("");
    render(next);
    if (!next.error || next.saved) onSaved?.(next);
    if (scheduleSave && (next.error || next.warnings.length)) scheduleFeedback("");
    if (!next.error && announce && !next.warnings.length) {
      if (scheduleSave) scheduleFeedback("Saved");
      else feedback("Saved");
    }
  } catch (error) {
    if (scheduleSave) scheduleFeedback("");
    feedback(error.message || "Could not reach the extension. Try Retry.", true);
    $("status").textContent = "Blocking status unavailable";
    $("status").dataset.error = "true";
  } finally {
    busy(false);
    if (focusAfter) {
      $(focusAfter)?.focus();
      focusAfter = null;
    }
  }
}
$("retry").addEventListener("click", () => request({ type: "getState" }, undefined, false));
$("reload-extension").addEventListener("click", () => {
  try {
    chrome.runtime.reload();
  } catch {
    feedback(
      "Open chrome://extensions and click Reload for SiteBlocker, then reopen this page.",
      true,
      true,
    );
  }
});
if (isOptions) {
  for (const day of dayOrder) {
    const label = node("label"),
      input = node("input");
    input.type = "checkbox";
    input.value = String(day);
    label.append(input, node("span", dayNames[day]));
    $("days").append(label);
  }
  $("domain-form").addEventListener("submit", (event) => {
    event.preventDefault();
    request({ type: "addDomain", domain: $("domain").value, mode: $("new-mode").value }, () => {
      $("domain").value = "";
      focusAfter = "domain";
    });
  });
  $("schedule-form").addEventListener("input", () => {
    scheduleDirty = true;
    scheduleFeedback("");
  });
  $("schedule-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const days = [...$("days").querySelectorAll("input:checked")].map((input) =>
      Number(input.value),
    );
    request(
      {
        type: "saveSchedule",
        expectedSchedule: scheduleSnapshot,
        schedule: { days, start: $("start").value, end: $("end").value },
      },
      loadSchedule,
    );
  });
  $("reload-schedule").addEventListener("click", () =>
    request({ type: "getState" }, loadSchedule, false),
  );
  $("clear-schedule").addEventListener("click", () =>
    request(
      { type: "saveSchedule", expectedSchedule: scheduleSnapshot, schedule: null },
      loadSchedule,
    ),
  );
  $("reset").addEventListener("click", () => {
    if (confirm("Remove all sites and the shared schedule?"))
      request({ type: "reset" }, loadSchedule);
  });
} else {
  $("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("add-current").addEventListener("click", () => {
    if (currentDomain) request({ type: "addDomain", domain: currentDomain, mode: "block" });
  });
  $("current-mode").addEventListener("change", () =>
    request({ type: "setSiteMode", domain: currentDomain, mode: $("current-mode").value }),
  );
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\//.test(tab.url)) currentDomain = normalizeDomain(tab.url);
  } catch {
    /* Internal pages and unsupported hostnames cannot be added. */
  }
  updateCurrentSite();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config && !pending)
    void request({ type: "getState" }, undefined, false);
});
setInterval(() => {
  if (!document.hidden && !pending) void request({ type: "getState" }, undefined, false);
}, 60000);
void request({ type: "getState" }, undefined, false);
