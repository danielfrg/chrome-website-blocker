import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  vite: () => ({
    // Kit UI ships Svelte/TypeScript source; compile it with the extension.
    optimizeDeps: { exclude: ["@kenn-io/kit-ui"] },
  }),
  manifest: {
    name: "Website blocker",
    description: "Block websites permanently or in a schedule. No data collected.",
    minimum_chrome_version: "120",
    permissions: ["declarativeNetRequest", "storage", "alarms", "activeTab"],
    action: { default_title: "Website blocker" },
    content_security_policy: {
      extension_pages:
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",
    },
  },
});
