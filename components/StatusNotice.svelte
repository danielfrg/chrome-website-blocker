<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button";
  import type { Store } from "../lib/store.svelte";

  let { store }: { store: Store } = $props();
</script>

{#if store.message && store.messageError}
  <div class="status-notice" role="status" aria-live="polite">
    <span>{store.message}</span>
    <Button onclick={store.retry}>{store.reloadRequired ? "Reload extension" : "Retry"}</Button>
  </div>
{/if}
