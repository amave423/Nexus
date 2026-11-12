<script>
  import logo from "./logo.svg?raw";
</script>

<div class="brand">{@html logo}</div>

<style>
  .brand :global(svg) {
    display: block;
    width: 150px;
    height: auto;
  }
</style>
