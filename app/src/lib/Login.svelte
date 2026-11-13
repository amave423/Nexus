<script>
  import { api, setToken } from "./api.js";
  import WinControls from "./WinControls.svelte";

  export let onDone;

  let mode = "login";
  let invite = "";
  let name = "";
  let code = "";
  let busy = false;
  let error = "";

  const ERRORS = {
    invite_invalid: "Инвайт не найден или устарел",
    invite_used: "Инвайт уже израсходован",
    name_taken: "Это имя уже занято",
    name_length: "Имя: от 2 до 24 символов",
    code_short: "Пароль: минимум 6 символов",
    bad_credentials: "Неверное имя или пароль",
  };

  async function submit() {
    error = "";
    busy = true;
    try {
      const body =
        mode === "register"
          ? { invite: invite.trim(), name: name.trim(), code }
          : { name: name.trim(), code };
      const data = await api(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        body,
      });
      setToken(data.token);
      onDone(data.user);
    } catch (e) {
      error = ERRORS[e.code] || e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <WinControls floating />
  <div class="login-card">
    <h1>{mode === "register" ? "Заходи по инвайту" : "С возвращением"}</h1>
    <p class="sub">Nexus · только свои</p>

    {#if mode === "register"}
      <div class="field">
        <label for="invite">Код приглашения</label>
        <input id="invite" bind:value={invite} placeholder="например PXI7_rxl" autocomplete="off" />
      </div>
    {/if}

    <div class="field">
      <label for="name">Имя</label>
      <input id="name" bind:value={name} placeholder="как тебя звать" autocomplete="username" />
    </div>

    <div class="field">
      <label for="code">Пароль</label>
      <input
        id="code"
        type="password"
        bind:value={code}
        placeholder="минимум 6 символов"
        autocomplete="current-password"
        on:keydown={(e) => e.key === "Enter" && submit()}
      />
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <button class="primary" on:click={submit} disabled={busy}>
      {busy ? "Секунду…" : mode === "register" ? "Создать аккаунт" : "Войти"}
    </button>

    <div class="switch-mode">
      {#if mode === "register"}
        Уже есть аккаунт? <button on:click={() => { mode = "login"; error = ""; }}>Войти</button>
      {:else}
        Первый раз? <button on:click={() => { mode = "register"; error = ""; }}>У меня инвайт</button>
      {/if}
    </div>
  </div>
</div>
