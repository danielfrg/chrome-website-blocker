<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Button } from "@ui-sdk/svelte/button";
  import { Field, FieldLabel } from "@ui-sdk/svelte/field";
  import { Input } from "@ui-sdk/svelte/input";
  import { Preferences } from "@ui-sdk/svelte/preferences";
  import { TimeInput } from "@ui-sdk/svelte/time-input";
  import { ThemeToggle } from "../../src/design-system/custom/theme-toggle";
  import { colorScheme } from "../../lib/color-scheme";
  import CheckField from "../../lib/components/CheckField.svelte";
  import ConfirmDialog from "../../lib/components/ConfirmDialog.svelte";
  import ModeSelect from "../../components/ModeSelect.svelte";
  import { Store, type Mode, type Schedule } from "../../lib/store.svelte";
  import StatusNotice from "../../components/StatusNotice.svelte";

  const store = new Store();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];

  let newDomain = $state("");
  let newMode = $state<Mode>("block");
  let confirmingReset = $state(false);

  // The schedule form is a draft that live refreshes must not clobber.
  let days = $state<number[]>([1, 2, 3, 4, 5]);
  let start = $state("09:00");
  let end = $state("18:00");
  let dirty = $state(false);
  let snapshot: Schedule | null = null;

  const sitesMessage = $derived(store.messageError ? "" : store.message);
  const sites = $derived(store.state?.config?.sites ?? []);
  const busy = $derived(store.pending || !store.state?.config);

  function loadSchedule() {
    const schedule = store.state?.config?.schedule ?? null;
    snapshot = schedule ? structuredClone($state.snapshot(schedule)) : null;
    dirty = false;
    days = [...(schedule?.days ?? [1, 2, 3, 4, 5])];
    start = schedule?.start ?? "09:00";
    end = schedule?.end ?? "18:00";
  }
  $effect(() => {
    // Re-sync from stored settings whenever they change and the user has no unsaved edits.
    void store.state?.config?.schedule;
    if (!dirty) loadSchedule();
  });

  onMount(() => store.start());

  async function focusDomain() {
    await tick();
    document.querySelector<HTMLInputElement>(".add-row input")?.focus();
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
  function markDirty() {
    dirty = true;
    store.scheduleMessage = "";
  }
  async function reset() {
    confirmingReset = false;
    if (await store.request({ type: "reset" })) loadSchedule();
  }
</script>

<Preferences preferences={[colorScheme]}>
  <main class="page">
    <header class="page-header">
      <div class="brand">
        <img src="/icon/128.png" alt="" width="28" height="28" />
        <h1>Website blocker</h1>
      </div>
      <div class="header-end">
        <p class="status-line" aria-live="polite">
          <span class="status-dot" data-status={store.statusDot} aria-hidden="true"></span>
          <span>{store.status}</span>
        </p>
        <ThemeToggle {colorScheme} />
      </div>
    </header>

    <StatusNotice {store} />

    <section class="panel" aria-labelledby="sites-heading">
      <div class="panel-head">
        <h2 id="sites-heading">Sites</h2>
        <span class="feedback-ok" role="status" aria-live="polite" hidden={!sitesMessage}>
          {sitesMessage}
        </span>
      </div>
      <fieldset disabled={busy}>
        <legend class="sr-only">Sites and blocking options</legend>
        {#if sites.length}
          <ul class="site-list">
            {#each sites as site (site.domain)}
              <li class="site-row">
                <span class="domain">{site.domain}</span>
                <div class="cell">
                  <ModeSelect
                    value={site.mode}
                    label={`Blocking for ${site.domain}`}
                    disabled={busy}
                    onchange={(mode) =>
                      store.request({ type: "setSiteMode", domain: site.domain, mode })}
                  />
                </div>
                <div class="cell">
                  <Button
                    data-variant="destructive"
                    aria-label={`Remove ${site.domain}`}
                    onclick={() => remove(site.domain)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="empty">
            <strong>No sites yet</strong>
            Add your first site below.
          </div>
        {/if}
        <form class="add-row" onsubmit={addSite}>
          <Field name="domain">
            <FieldLabel class="sr-only">Domain or website URL</FieldLabel>
            <Input placeholder="Add a site…" autocomplete="off" required bind:value={newDomain} />
          </Field>
          <div class="cell">
            <ModeSelect
              value={newMode}
              label="Blocking for new site"
              disabled={busy}
              onchange={(mode) => (newMode = mode as Mode)}
            />
          </div>
          <div class="cell">
            <Button type="submit" data-variant="solid">Add</Button>
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
        <form class="schedule-form" onsubmit={saveSchedule}>
          <fieldset class="days">
            <legend>Start days</legend>
            <div class="day-list">
              {#each dayOrder as day (day)}
                <CheckField
                  checked={days.includes(day)}
                  disabled={busy}
                  onchange={(checked) => toggleDay(day, checked)}
                >
                  {dayNames[day]}
                </CheckField>
              {/each}
            </div>
          </fieldset>
          <div class="times">
            <Field name="start">
              <FieldLabel>Start time</FieldLabel>
              <TimeInput
                disabled={busy}
                required
                bind:value={
                  () => start,
                  (v) => {
                    if (v && v !== start) {
                      start = v;
                      markDirty();
                    }
                  }
                }
              />
            </Field>
            <Field name="end">
              <FieldLabel>End time</FieldLabel>
              <TimeInput
                disabled={busy}
                required
                bind:value={
                  () => end,
                  (v) => {
                    if (v && v !== end) {
                      end = v;
                      markDirty();
                    }
                  }
                }
              />
            </Field>
          </div>
          <div class="actions">
            <Button type="submit" data-variant="solid">Save schedule</Button>
          </div>
        </form>
      </fieldset>
    </section>

    <footer>
      <Button disabled={store.pending} onclick={() => (confirmingReset = true)}>
        Reset all settings
      </Button>
    </footer>
  </main>

  {#if confirmingReset}
    <ConfirmDialog
      title="Reset all settings?"
      message="This removes all sites and the shared schedule."
      confirmLabel="Reset"
      onconfirm={reset}
      oncancel={() => (confirmingReset = false)}
    />
  {/if}
</Preferences>
