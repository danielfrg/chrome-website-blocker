import { normalizeState } from "./ui-state.js";

export type Mode = "block" | "schedule" | "unblocked";
export interface Site {
  domain: string;
  mode: Mode;
}
export interface Schedule {
  days: number[];
  start: string;
  end: string;
}
export interface Config {
  version: number;
  sites: Site[];
  schedule: Schedule | null;
}
export interface AppState {
  config: Config | null;
  active: boolean | null;
  blockedCount: number;
  warnings: string[];
  error: string | null;
  saved: boolean;
  reloadRequired: boolean;
}

export const MODE_OPTIONS = [
  { value: "block", label: "Block" },
  { value: "schedule", label: "Schedule" },
  { value: "unblocked", label: "Unblocked" },
];

/** Shared view-model for the popup and the options page. Talks to the background controller. */
export class Store {
  state = $state<AppState | null>(null);
  pending = $state(false);
  message = $state("");
  messageError = $state(false);
  reloadRequired = $state(false);
  scheduleMessage = $state("");
  unavailable = $state(false);

  status = $derived.by(() => {
    if (this.unavailable) return "Blocking status unavailable";
    const s = this.state;
    if (!s) return "Loading sites…";
    if (s.error) return "Blocking needs attention";
    const total = s.config?.sites.length ?? 0;
    if (!total) return "No sites added yet";
    return `${s.blockedCount} of ${total} ${total === 1 ? "site" : "sites"} blocked now`;
  });
  statusDot = $derived<"working" | "idle" | "unclean">(
    this.unavailable || this.state?.error ? "unclean" : this.state?.active ? "working" : "idle",
  );

  private setFeedback(message: string, error = false, reloadRequired = false) {
    this.message = message;
    this.messageError = error && Boolean(message);
    this.reloadRequired = reloadRequired;
  }

  private render(next: AppState) {
    this.state = next;
    this.unavailable = false;
    if (next.error) this.setFeedback(next.error, true, next.reloadRequired);
    else if (next.warnings.length) this.setFeedback(next.warnings.join(" "), true);
  }

  /** Sends a message to the controller; resolves to the new state, or null when busy/failed. */
  async request(message: Record<string, unknown>, announce = true): Promise<AppState | null> {
    if (this.pending) return null;
    const scheduleSave = message.type === "saveSchedule";
    this.pending = true;
    if (announce) {
      if (scheduleSave) {
        this.setFeedback("");
        this.scheduleMessage = "Saving…";
      } else this.setFeedback("Saving…");
    }
    try {
      const next = normalizeState(await chrome.runtime.sendMessage(message)) as AppState;
      this.setFeedback("");
      this.render(next);
      if (scheduleSave && (next.error || next.warnings.length)) this.scheduleMessage = "";
      if (!next.error && announce && !next.warnings.length) {
        if (scheduleSave) this.scheduleMessage = "Saved";
        else this.setFeedback("Saved");
      }
      return !next.error || next.saved ? next : null;
    } catch (error) {
      if (scheduleSave) this.scheduleMessage = "";
      this.setFeedback(
        (error as Error).message || "Could not reach the extension. Try Retry.",
        true,
      );
      this.unavailable = true;
      return null;
    } finally {
      this.pending = false;
    }
  }

  refresh = () => this.request({ type: "getState" }, false);

  retry = () => {
    if (this.reloadRequired) {
      try {
        chrome.runtime.reload();
      } catch {
        this.setFeedback(
          "Open chrome://extensions and click Reload for Website blocker, then reopen this page.",
          true,
          true,
        );
      }
    } else void this.refresh();
  };

  /** Starts the initial load plus live refresh; returns a cleanup function. */
  start(): () => void {
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && changes.config && !this.pending) void this.refresh();
    };
    chrome.storage.onChanged.addListener(onChanged);
    const timer = setInterval(() => {
      if (!document.hidden && !this.pending) void this.refresh();
    }, 60000);
    void this.refresh();
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      clearInterval(timer);
    };
  }
}
