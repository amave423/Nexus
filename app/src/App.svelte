<script>
  import { onMount } from "svelte";
  import { api, getToken, setToken } from "./lib/api.js";
  import Login from "./lib/Login.svelte";
  import Chat from "./lib/Chat.svelte";

  let user = null;
  let ready = false;

  onMount(async () => {
    if (getToken()) {
      try {
        const data = await api("/api/me");
        user = data.user;
      } catch {
        setToken(null);
      }
    }
    ready = true;
  });

  function logout() {
    user = null;
  }
</script>

<div class="aurora"></div>

{#if !ready}
  <div class="login"><div class="empty">Загрузка…</div></div>
{:else if user}
  <Chat {user} onLogout={logout} onUser={(u) => (user = u)} />
{:else}
  <Login onDone={(u) => (user = u)} />
{/if}
