<script lang="ts">
  import { onMount } from "svelte";
  import { Button, SelectDropdown, ThemeToggle } from "@kenn-io/kit-ui";
  import { normalizeDomain } from "../../lib/config.js";
  import { MODE_OPTIONS, Store, type Mode } from "../../lib/store.svelte";
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

<main class="popup">
  <header class="top">
    <div class="brand">
      <img src="/icon/32.png" alt="" width="24" height="24" />
      <h1>Website blocker</h1>
    </div>
    <div class="header-end">
      <span class="saved" role="status" aria-live="polite">
        {store.messageError ? "" : store.message}
      </span>
      <ThemeToggle />
    </div>
  </header>

  <p class="sr-only" aria-live="polite">{store.status}</p>

  <StatusNotice {store} />

  {#if site}
    <div class="current">
      <span class="domain">{site.domain}</span>
      <SelectDropdown
        value={site.mode}
        options={MODE_OPTIONS}
        title={`Blocking for ${site.domain}`}
        align="end"
        {disabled}
        onchange={setMode}
      />
    </div>
  {:else if currentDomain}
    <Button
      class="full"
      tone="info"
      surface="solid"
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

<style>
  .popup {
    width: 360px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .header-end {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .saved {
    color: var(--text-muted);
    font-size: var(--font-size-sm, 13px);
  }
  .current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .domain {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  :global(.full) {
    width: 100%;
  }
</style>
