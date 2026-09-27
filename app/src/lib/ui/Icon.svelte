<script lang="ts">
  let { name, size }: { name: string; size?: number } = $props();
</script>

<svg width={size} height={size} aria-hidden="true"><use href="#i-{name}" /></svg>
