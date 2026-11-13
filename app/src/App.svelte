<script>
  import { onMount } from "svelte";
  import { api, getToken, setToken } from "./lib/api.js";
  import Login from "./lib/Login.svelte";
  import Chat from "./lib/Chat.svelte";

  let user = null;
  let ready = false;
  let spot = null;

  onMount(async () => {
    window.addEventListener("mousemove", follow);
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

  function follow(event) {
    if (!spot) return;
    spot.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
  }

  function logout() {
    user = null;
  }
</script>

<div class="aurora"></div>
<div class="spotlight" bind:this={spot}></div>
<div class="grain"></div>

{#if !ready}
  <div class="login"><div class="empty">Загрузка…</div></div>
{:else if user}
  <Chat {user} onLogout={logout} onUser={(u) => (user = u)} />
{:else}
  <Login onDone={(u) => (user = u)} />
{/if}
