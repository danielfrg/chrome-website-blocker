<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Button,
    Checkbox,
    EmptyState,
    SelectDropdown,
    StatusDot,
    TextInput,
    ThemeToggle,
  } from "@kenn-io/kit-ui";
  import { MODE_OPTIONS, Store, type Mode, type Schedule } from "../../lib/store.svelte";
  import StatusNotice from "../../components/StatusNotice.svelte";

  const store = new Store();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];

  let newDomain = $state("");
  let newMode = $state<Mode>("block");
  let domainInput = $state<HTMLInputElement>();

  // The schedule form is a draft that live refreshes must not clobber.
  let days = $state<number[]>([1, 2, 3, 4, 5]);
  let start = $state("09:00");
  let end = $state("17:00");
  let dirty = $state(false);
  let snapshot: Schedule | null = null;

  const sites = $derived(store.state?.config?.sites ?? []);
  const busy = $derived(store.pending || !store.state?.config);
  const hasSchedule = $derived(Boolean(store.state?.config?.schedule));

  function loadSchedule() {
    const schedule = store.state?.config?.schedule ?? null;
    snapshot = schedule ? structuredClone($state.snapshot(schedule)) : null;
    dirty = false;
    days = [...(schedule?.days ?? [1, 2, 3, 4, 5])];
    start = schedule?.start ?? "09:00";
    end = schedule?.end ?? "17:00";
  }
  $effect(() => {
    // Re-sync from stored settings whenever they change and the user has no unsaved edits.
    void store.state?.config?.schedule;
    if (!dirty) loadSchedule();
  });

  onMount(() => store.start());

  async function focusDomain() {
    await tick();
    domainInput?.focus();
  }
  async function addSite(event: Event) {
    event.preventDefault();
    const next = await store.request({ type: "addDomain", domain: newDomain, mode: newMode });
    if (next) {
      newDomain = "";
      void focusDomain();
    }
  }
  async function remove(domain: string) {
    if (await store.request({ type: "removeDomain", domain })) void focusDomain();
  }
  function toggleDay(day: number, checked: boolean) {
    dirty = true;
    store.scheduleMessage = "";
    days = checked ? [...new Set([...days, day])] : days.filter((d) => d !== day);
  }
  async function saveSchedule(event: Event) {
    event.preventDefault();
    const next = await store.request({
      type: "saveSchedule",
      expectedSchedule: snapshot,
      schedule: { days: [...days], start, end },
    });
    if (next) loadSchedule();
  }
  async function clearSchedule() {
    if (await store.request({ type: "saveSchedule", expectedSchedule: snapshot, schedule: null }))
      loadSchedule();
  }
  async function reloadSchedule() {
    if (await store.request({ type: "getState" }, false)) loadSchedule();
  }
  async function reset() {
    if (confirm("Remove all sites and the shared schedule?")) {
      if (await store.request({ type: "reset" })) loadSchedule();
    }
  }
</script>

<main class="page">
  <header class="page-header">
    <div class="brand">
      <img src="/icon/128.png" alt="" width="28" height="28" />
      <h1>Website blocker</h1>
    </div>
    <div class="header-end">
      <span class="saved" role="status" aria-live="polite">
        {store.messageError ? "" : store.message}
      </span>
      <p class="status-line" aria-live="polite">
        <StatusDot status={store.statusDot} label={store.status} />
        <span>{store.status}</span>
      </p>
      <ThemeToggle />
    </div>
  </header>

  <StatusNotice {store} />

  <section class="panel" aria-labelledby="sites-heading">
    <h2 id="sites-heading">Sites</h2>
    <fieldset disabled={busy}>
      <legend class="sr-only">Sites and blocking options</legend>
      {#if sites.length}
        <ul class="site-list">
          {#each sites as site (site.domain)}
            <li class="site-row">
              <span class="domain">{site.domain}</span>
              <div class="cell">
                <SelectDropdown
                  value={site.mode}
                  options={MODE_OPTIONS}
                  title={`Blocking for ${site.domain}`}
                  align="end"
                  onchange={(mode) =>
                    store.request({ type: "setSiteMode", domain: site.domain, mode })}
                />
              </div>
              <div class="cell">
                <Button
                  tone="danger"
                  surface="soft"
                  ariaLabel={`Remove ${site.domain}`}
                  onclick={() => remove(site.domain)}
                >
                  Remove
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState title="No sites yet" description="Add your first site below." />
      {/if}
      <form class="add-row" onsubmit={addSite}>
        <label for="domain" class="sr-only">Domain or website URL</label>
        <TextInput
          id="domain"
          name="domain"
          placeholder="Add a site…"
          autocomplete="off"
          required
          block
          bind:value={newDomain}
          bind:inputEl={domainInput}
        />
        <div class="cell">
          <SelectDropdown
            value={newMode}
            options={MODE_OPTIONS}
            title="Blocking for new site"
            align="end"
            onchange={(mode) => (newMode = mode as Mode)}
          />
        </div>
        <div class="cell">
          <Button type="submit" tone="info" surface="solid">Add</Button>
        </div>
      </form>
    </fieldset>
  </section>

  <section class="panel" aria-labelledby="schedule-heading">
    <div class="panel-head">
      <h2 id="schedule-heading">Schedule</h2>
      <span class="feedback-ok" role="status" aria-live="polite" hidden={!store.scheduleMessage}>
        {store.scheduleMessage}
      </span>
    </div>
    <fieldset disabled={busy}>
      <legend class="sr-only">Shared weekly schedule</legend>
      <form
        class="schedule-form"
        onsubmit={saveSchedule}
        oninput={() => {
          dirty = true;
          store.scheduleMessage = "";
        }}
      >
        <fieldset class="days">
          <legend>Start days</legend>
          <div class="day-list">
            {#each dayOrder as day (day)}
              <Checkbox
                label={dayNames[day]}
                checked={days.includes(day)}
                onchange={(checked) => toggleDay(day, checked)}
              />
            {/each}
          </div>
        </fieldset>
        <div class="times">
          <label>Start time <input class="time-input" type="time" bind:value={start} required /></label>
          <label>End time <input class="time-input" type="time" bind:value={end} required /></label>
        </div>
        <div class="actions">
          <Button type="submit" tone="info" surface="solid">Save schedule</Button>
          <Button onclick={reloadSchedule}>Reload schedule</Button>
          {#if hasSchedule}
            <Button tone="danger" surface="soft" onclick={clearSchedule}>Clear</Button>
          {/if}
        </div>
      </form>
    </fieldset>
  </section>

  <footer>
    <Button disabled={store.pending} onclick={reset}>Reset all settings</Button>
  </footer>
</main>

<style>
  .page {
    --control-col: 128px;
    max-width: 760px;
    margin: 0 auto;
    padding: 32px 24px 96px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .page-header,
  .header-end,
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .header-end {
    gap: 12px;
  }
  /* Reserved width so "Saving…" / "Saved" never moves the page. */
  .saved {
    min-width: 64px;
    text-align: right;
    color: var(--text-muted);
    font-size: var(--font-size-sm, 13px);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
  }
  h2 {
    font-size: var(--font-size-md);
    font-weight: 600;
  }
  .site-list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
  }
  .site-row {
    display: grid;
    grid-template-columns: 1fr var(--control-col) var(--control-col);
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-muted);
  }
  .domain {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .add-row {
    display: grid;
    grid-template-columns: 1fr var(--control-col) var(--control-col);
    gap: 12px;
    align-items: center;
    margin-top: 8px;
  }
  .schedule-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  legend {
    padding: 0;
    margin-bottom: 8px;
    font-size: var(--font-size-sm, 13px);
    color: var(--text-secondary);
  }
  .day-list,
  .times,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
  }
  .times label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 13px);
    color: var(--text-secondary);
  }
  .actions {
    gap: 8px;
  }
  /* Equal-width columns keep the row controls and the add-row controls aligned. */
  .cell {
    display: flex;
  }
  .cell > :global(*),
  .cell :global(.kit-select-dropdown__trigger) {
    width: 100%;
  }
  .cell :global(.kit-select-dropdown__trigger) {
    justify-content: space-between;
  }
  @media (max-width: 520px) {
    .site-row,
    .add-row {
      grid-template-columns: 1fr;
    }
  }
</style>
