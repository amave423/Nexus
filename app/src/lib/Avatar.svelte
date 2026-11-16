<script>
  export let name = "";
  export let color = "#c8ff3d";
  export let avatar = null;
  export let size = 32;
  export let radius = 10;
  export let cls = "";
  export let dot = null;

  $: initial = (name || "?").trim().slice(0, 2).toUpperCase();
  $: style = `width:${size}px;height:${size}px;border-radius:${radius}px;font-size:${Math.max(
    9,
    Math.round(size * (size >= 48 ? 0.33 : 0.3))
  )}px;background:${avatar ? "transparent" : color}`;
</script>

<span class="avatar-shell">
  <span class="avatar {cls}" {style}>{#if avatar}<img src={avatar} alt={name} />{:else}{initial}{/if}</span>
  {#if dot}<i class="status" style="background:{dot}"></i>{/if}
</span>
