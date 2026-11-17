<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "@ui-sdk/svelte/button";
  import { Preferences } from "@ui-sdk/svelte/preferences";
  import { ThemeToggle } from "../../src/design-system/custom/theme-toggle";
  import { colorScheme } from "../../lib/color-scheme";
  import ModeSelect from "../../components/ModeSelect.svelte";
  import { normalizeDomain } from "../../lib/config.js";
  import { Store, type Mode } from "../../lib/store.svelte";
  import StatusNotice from "../../components/StatusNotice.svelte";

  const store = new Store();
  let currentDomain = $state<string | null>(null);

  const site = $derived(store.state?.config?.sites.find((s) => s.domain === currentDomain));
  const disabled = $derived(store.pending || !store.state?.config);

  onMount(() => {
    const stop = store.start();
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url && /^https?:\/\//.test(tab.url)) currentDomain = normalizeDomain(tab.url);
      } catch {
        /* Internal pages and unsupported hostnames cannot be added. */
      }
    })();
    return stop;
  });

  const setMode = (mode: string) =>
    store.request({ type: "setSiteMode", domain: currentDomain, mode: mode as Mode });
</script>

<Preferences preferences={[colorScheme]}>
  <main class="popup">
    <header class="popup-top">
      <div class="brand">
        <img src="/icon/32.png" alt="" width="24" height="24" />
        <h1>Website blocker</h1>
      </div>
      <div class="header-end">
        <span class="saved" role="status" aria-live="polite">
          {store.messageError ? "" : store.message}
        </span>
        <ThemeToggle {colorScheme} />
      </div>
    </header>

    <p class="sr-only" aria-live="polite">{store.status}</p>

    <StatusNotice {store} />

    {#if site}
      <div class="current">
        <span class="domain">{site.domain}</span>
        <ModeSelect
          value={site.mode}
          label={`Blocking for ${site.domain}`}
          {disabled}
          onchange={setMode}
        />
      </div>
    {:else if currentDomain}
      <Button
        class="full"
        data-variant="solid"
        {disabled}
        onclick={() => store.request({ type: "addDomain", domain: currentDomain, mode: "block" })}
      >
        Block {currentDomain}
      </Button>
    {:else}
      <p class="muted">Open a regular website to block it.</p>
    {/if}

    <Button class="full" onclick={() => chrome.runtime.openOptionsPage()}>
      Manage sites &amp; schedule
    </Button>
  </main>
</Preferences>
