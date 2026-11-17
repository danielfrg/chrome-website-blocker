<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select";
  import { MODE_OPTIONS } from "../lib/store.svelte";

  interface Props {
    value: string;
    /** Names the select for assistive tech, e.g. "Blocking for example.com". */
    label: string;
    onchange: (mode: string) => void;
    disabled?: boolean;
  }
  let { value, label, onchange, disabled = false }: Props = $props();
</script>

<Select
  items={MODE_OPTIONS}
  bind:value={() => value, (next) => next && onchange(next)}
  {disabled}
>
  <SelectLabel class="sr-only">{label}</SelectLabel>
  <SelectTrigger>
    <SelectValue />
    <ChevronDownIcon aria-hidden="true" />
  </SelectTrigger>
  <SelectContent>
    {#each MODE_OPTIONS as item (item.value)}
      <SelectItem value={item.value}>
        {item.label}
        <SelectItemIndicator><CheckIcon aria-hidden="true" /></SelectItemIndicator>
      </SelectItem>
    {/each}
  </SelectContent>
</Select>
