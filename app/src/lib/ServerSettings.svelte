<script>
  import { createEventDispatcher } from "svelte";
  import { api } from "./api.js";
  import Avatar from "./Avatar.svelte";
  import Dropdown from "./Dropdown.svelte";

  export let space;
  export let roles = [];
  export let members = [];
  export let permissions = [];
  export let user;

  const dispatch = createEventDispatcher();

  const ICONS = {
    overview: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3z"/>',
    roles:
      '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6.5 6.5 0 0 0-2-4.7"/>',
    members:
      '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6.5 6.5 0 0 0-2-4.7"/>',
    invites:
      '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
    danger: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9v5M12 17h.01"/>',
  };

  const TABS = [
    { grp: "сервер" },
    { id: "overview", label: "Обзор", icon: "overview" },
    { id: "roles", label: "Роли", icon: "roles" },
    { id: "members", label: "Участники", icon: "members" },
    { id: "invites", label: "Приглашения", icon: "invites" },
    { grp: "опасное" },
    { id: "danger", label: "Удаление", icon: "danger" },
  ];

  const PERM_LABEL = {
    manage_server: "Управление сервером",
    manage_roles: "Управление ролями",
    manage_members: "Управление участниками",
    manage_invites: "Приглашения",
    send_messages: "Писать сообщения",
  };

  const EXPIRY = { "Никогда": 0, "1 день": 24, "7 дней": 168, "30 дней": 720 };
  const LIMIT = { "Без лимита": 0, "5": 5, "10": 10, "25": 25 };

  let tab = "overview";
  let name = space.name;
  let description = space.description || "";
  let saved = "";
  let error = "";

  let newRole = { name: "", color: "#6fe3ff" };
  let editing = null;
  let editDraft = null;

  let roleEditorFor = null;
  let draftRoleIds = [];

  let invites = [];
  let invitesLoaded = false;
  let inviteExpiry = "Никогда";
  let inviteLimit = "Без лимита";
  let freshInvite = "";

  let confirmName = "";

  const can = (perm) => permissions.includes(perm);
  const countOf = (roleId) => members.filter((m) => m.roles.some((r) => r.id === roleId)).length;

  async function saveSpace() {
    error = "";
    try {
      const data = await api(`/api/spaces/${space.id}`, {
        method: "PATCH",
        body: { name, description },
      });
      space = data.space;
      dispatch("space", data.space);
      saved = "сохранено";
      setTimeout(() => (saved = ""), 1800);
    } catch (e) {
      error = e.code === "name_length" ? "Название: от 2 до 40 символов" : e.message;
    }
  }

  async function createRole() {
    if (!newRole.name.trim()) return;
    try {
      const data = await api(`/api/spaces/${space.id}/roles`, {
        method: "POST",
        body: { name: newRole.name.trim(), color: newRole.color, permissions: ["send_messages"] },
      });
      roles = [...roles.filter((r) => r.id !== data.role.id), data.role];
      dispatch("roles", roles);
      newRole = { name: "", color: "#6fe3ff" };
    } catch (e) {
      error = e.message;
    }
  }

  function startEdit(role) {
    editing = role.id;
    editDraft = { name: role.name, color: role.color, permissions: [...role.permissions] };
  }

  function togglePerm(perm) {
    editDraft.permissions = editDraft.permissions.includes(perm)
      ? editDraft.permissions.filter((p) => p !== perm)
      : [...editDraft.permissions, perm];
  }

  async function saveRole() {
    try {
      const data = await api(`/api/roles/${editing}`, {
        method: "PATCH",
        body: editDraft,
      });
      roles = roles.map((r) => (r.id === editing ? data.role : r));
      dispatch("roles", roles);
      editing = null;
      editDraft = null;
    } catch (e) {
      error = e.message;
    }
  }

  async function removeRole(role) {
    await api(`/api/roles/${role.id}`, { method: "DELETE" });
    roles = roles.filter((r) => r.id !== role.id);
    dispatch("roles", roles);
    if (editing === role.id) {
      editing = null;
      editDraft = null;
    }
  }

  function openRoleEditor(member) {
    roleEditorFor = member.id;
    draftRoleIds = member.roles.map((r) => r.id);
  }

  async function saveMemberRoles(member) {
    const data = await api(`/api/spaces/${space.id}/members/${member.id}/roles`, {
      method: "PUT",
      body: { roleIds: draftRoleIds },
    });
    members = members.map((m) => (m.id === member.id ? data.member : m));
    dispatch("members", members);
    roleEditorFor = null;
  }

  async function kick(member) {
    await api(`/api/spaces/${space.id}/members/${member.id}`, { method: "DELETE" });
    members = members.filter((m) => m.id !== member.id);
    dispatch("members", members);
  }

  async function loadInvites() {
    const data = await api(`/api/spaces/${space.id}/invites`);
    invites = data.invites;
    invitesLoaded = true;
  }

  async function createInvite() {
    const data = await api(`/api/spaces/${space.id}/invites`, {
      method: "POST",
      body: { maxUses: LIMIT[inviteLimit], expiresInHours: EXPIRY[inviteExpiry] },
    });
    freshInvite = data.invite.code;
    await loadInvites();
  }

  async function revoke(invite) {
    await api(`/api/invites/${invite.code}`, { method: "DELETE" });
    await loadInvites();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      saved = "скопировано";
      setTimeout(() => (saved = ""), 1500);
    } catch {
      /* буфер обмена недоступен */
    }
  }

  async function deleteSpace() {
    if (confirmName !== space.name) return;
    await api(`/api/spaces/${space.id}`, { method: "DELETE" });
    dispatch("deleted");
  }

  function openTab(id) {
    tab = id;
    if (id === "invites" && !invitesLoaded) loadInvites();
  }

  const fmtDate = (ts) =>
    ts ? new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) : "бессрочно";
</script>

<div class="modal" role="dialog" aria-modal="true">
  <div class="modal-card">
    <aside class="set-nav">
      {#each TABS as item (item.id || item.grp)}
        {#if item.grp}
          <span class="grp">{item.grp}</span>
        {:else}
          <button class:active={tab === item.id} class:danger={item.id === "danger"} on:click={() => openTab(item.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html ICONS[item.icon] || ""}</svg>
            <span>{item.label}</span>
          </button>
        {/if}
      {/each}
    </aside>

    <div class="set-main">
      <header class="set-head">
        <h2>Настройки сервера</h2>
        <button class="icon-btn" aria-label="Закрыть" on:click={() => dispatch("close")}>✕</button>
      </header>

      <div class="set-pane">
        {#if tab === "overview"}
          <div class="set-profile">
            <span class="set-avatar" style="background:linear-gradient(150deg,var(--acid),color-mix(in srgb,var(--acid) 55%,#000))">
              {space.name.slice(0, 1).toUpperCase()}
            </span>
            <div class="who">
              <b>{space.name}</b>
              <span>{members.length} участников · создан {fmtDate(space.createdAt)}</span>
            </div>
          </div>
          <div class="set-field">
            <label for="srvName">Название сервера</label>
            <input id="srvName" class="set-input" bind:value={name} maxlength="40" disabled={!can("manage_server")} />
          </div>
          <div class="set-field">
            <label for="srvDesc">Описание</label>
            <textarea id="srvDesc" class="set-input" bind:value={description} maxlength="280" disabled={!can("manage_server")}></textarea>
          </div>
          {#if error}<div class="error">{error}</div>{/if}
          {#if can("manage_server")}
            <div class="set-actions">
              <button class="set-copy" on:click={saveSpace}>Сохранить</button>
              {#if saved}<span class="set-saved">{saved}</span>{/if}
            </div>
          {/if}
        {/if}

        {#if tab === "roles"}
          <div class="set-row">
            <div class="set-row-t"><b>Роли</b><span>Цвет и права. Выше — важнее</span></div>
            {#if can("manage_roles")}
              <div class="role-new">
                <input class="set-input" bind:value={newRole.name} placeholder="название" maxlength="24" />
                <input class="color-input" type="color" bind:value={newRole.color} />
                <button class="set-copy" on:click={createRole}>Создать</button>
              </div>
            {/if}
          </div>

          {#each roles as role (role.id)}
            <div class="set-role-wrap">
              <div class="set-role">
                <span class="dot" style="background:{role.color}"></span>
                <span class="nm">{role.name}</span>
                <span class="cnt">{countOf(role.id)} чел.</span>
                {#if can("manage_roles")}
                  <button class="mini" on:click={() => startEdit(role)}>изменить</button>
                {/if}
              </div>
              {#if editing === role.id}
                <div class="role-edit">
                  <div class="role-edit-row">
                    <input class="set-input" bind:value={editDraft.name} maxlength="24" />
                    <input class="color-input" type="color" bind:value={editDraft.color} />
                  </div>
                  <div class="perm-list">
                    {#each Object.entries(PERM_LABEL) as [perm, label] (perm)}
                      <label class="perm">
                        <input type="checkbox" checked={editDraft.permissions.includes(perm)} on:change={() => togglePerm(perm)} />
                        <span>{label}</span>
                      </label>
                    {/each}
                  </div>
                  <div class="role-edit-actions">
                    <button class="set-copy" on:click={saveRole}>Сохранить</button>
                    <button class="ghost-btn" on:click={() => { editing = null; editDraft = null; }}>Отмена</button>
                    <button class="danger-btn" on:click={() => removeRole(role)}>Удалить</button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        {/if}

        {#if tab === "members"}
          <div class="set-row">
            <div class="set-row-t"><b>Участники</b><span>{members.length} человек на сервере</span></div>
          </div>
          {#each members as member (member.id)}
            <div class="set-role-wrap">
              <div class="set-role">
                <Avatar name={member.name} color={member.color} avatar={member.avatar} size={26} radius={8} />
                <span class="nm">{member.name}{member.id === user.id ? " · ты" : ""}</span>
                <span class="role-chips">
                  {#each member.roles as role (role.id)}
                    <i style="--c:{role.color}">{role.name}</i>
                  {/each}
                </span>
                {#if can("manage_members") && member.role !== "owner"}
                  <button class="mini" on:click={() => openRoleEditor(member)}>роли</button>
                  <button class="mini danger" on:click={() => kick(member)}>кик</button>
                {/if}
              </div>
              {#if roleEditorFor === member.id}
                <div class="role-edit">
                  <div class="perm-list">
                    {#each roles as role (role.id)}
                      <label class="perm">
                        <input
                          type="checkbox"
                          checked={draftRoleIds.includes(role.id)}
                          on:change={() =>
                            (draftRoleIds = draftRoleIds.includes(role.id)
                              ? draftRoleIds.filter((id) => id !== role.id)
                              : [...draftRoleIds, role.id])}
                        />
                        <span><i class="dot" style="background:{role.color}"></i>{role.name}</span>
                      </label>
                    {/each}
                  </div>
                  <div class="role-edit-actions">
                    <button class="set-copy" on:click={() => saveMemberRoles(member)}>Сохранить</button>
                    <button class="ghost-btn" on:click={() => (roleEditorFor = null)}>Отмена</button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        {/if}

        {#if tab === "invites"}
          {#if can("manage_invites")}
            <div class="set-row">
              <div class="set-row-t"><b>Новое приглашение</b><span>Ссылка, по которой заходят свои</span></div>
              <div class="invite-new">
                <Dropdown value={inviteExpiry} options={Object.keys(EXPIRY)} on:change={(e) => (inviteExpiry = e.detail)} />
                <Dropdown value={inviteLimit} options={Object.keys(LIMIT)} on:change={(e) => (inviteLimit = e.detail)} />
                <button class="set-copy" on:click={createInvite}>Создать</button>
              </div>
            </div>
            {#if freshInvite}
              <div class="set-invite">
                <input class="set-input" value={freshInvite} readonly />
                <button class="set-copy" on:click={() => copy(freshInvite)}>Копировать</button>
              </div>
            {/if}
            {#each invites as invite (invite.code)}
              <div class="set-role">
                <span class="nm mono">{invite.code}</span>
                <span class="cnt">
                  {invite.uses}{invite.maxUses ? ` / ${invite.maxUses}` : ""} входов ·
                  {invite.revoked ? "отозван" : fmtDate(invite.expiresAt)}
                </span>
                {#if !invite.revoked}
                  <button class="mini danger" on:click={() => revoke(invite)}>отозвать</button>
                {/if}
              </div>
            {/each}
            {#if invitesLoaded && invites.length === 0}
              <div class="empty">Приглашений пока нет</div>
            {/if}
          {:else}
            <div class="empty">Приглашения доступны владельцу и админам</div>
          {/if}
        {/if}

        {#if tab === "danger"}
          {#if space.ownerId === user.id}
            <div class="set-danger">
              <b>Удалить сервер</b>
              <span>Все каналы, сообщения и роли исчезнут. Отменить это будет нельзя.</span>
              <input class="set-input" bind:value={confirmName} placeholder="введи {space.name} для подтверждения" />
              <button disabled={confirmName !== space.name} on:click={deleteSpace}>Удалить {space.name}</button>
            </div>
          {:else}
            <div class="empty">Удалить сервер может только владелец</div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>
