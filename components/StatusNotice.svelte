<script lang="ts">
  import { Notice } from "@kenn-io/kit-ui";
  import type { Store } from "../lib/store.svelte";

  let { store }: { store: Store } = $props();
</script>

{#if store.message && store.messageError}
  <div role="status" aria-live="polite">
    <Notice
      tone="error"
      message={store.message}
      actionLabel={store.reloadRequired ? "Reload extension" : "Retry"}
      onaction={store.retry}
    />
  </div>
{/if}
