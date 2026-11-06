import { createController } from "../../lib/controller.js";

export default defineBackground({
  type: "module",
  main() {
    const controller = createController(chrome);
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (sender.id !== chrome.runtime.id) return false;
      controller
        .handle(message)
        .then(respond, (error: Error) =>
          respond({ config: null, active: null, warnings: [], error: error.message }),
        );
      return true;
    });
    chrome.runtime.onInstalled.addListener(() => {
      void controller.reconcile();
    });
    chrome.runtime.onStartup.addListener(() => {
      void controller.reconcile();
    });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (["health-check", "schedule-transition"].includes(alarm.name)) void controller.reconcile();
    });
    // Also repair alarms whenever Chrome starts a fresh worker instance.
    void controller.reconcile();
  },
});
