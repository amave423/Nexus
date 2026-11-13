<script>
  import Avatar from "./Avatar.svelte";
  import { fileUrl } from "./api.js";

  export let message;
  export let me;
  export let canManage = false;
  export let role = null;
  export let onReply = () => {};
  export let onEdit = () => {};
  export let onDelete = () => {};
  export let onReact = () => {};
  export let onPin = () => {};
  export let onJump = () => {};

  const EMOJI = ["🔥", "😂", "❤️", "👍", "👀", "🎉", "😮", "💀", "🤝", "✅", "🍕", "🚀"];

  let editing = false;
  let draft = "";
  let picker = false;
  let lightbox = null;

  const time = (ts) =>
    new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  const own = () => message.userId === me.id;
  const canEdit = () => own() && !message.deleted;
  const canDelete = () => (own() || canManage) && !message.deleted;

  function startEdit() {
    draft = message.text;
    editing = true;
  }

  function commitEdit() {
    const value = draft.trim();
    editing = false;
    if (value && value !== message.text) onEdit(message, value);
  }

  function react(emoji) {
    picker = false;
    onReact(message, emoji);
  }

  function parts(text) {
    return text.split(/(@[\wА-Яа-яЁё-]+)/g);
  }

  const isImage = (file) => file.mime.startsWith("image/");
  const isVideo = (file) => file.mime.startsWith("video/");
  const isAudio = (file) => file.mime.startsWith("audio/");

  function size(bytes) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }
</script>

<div class="msg" class:deleted={message.deleted}>
  <div class="msg-gutter"><time>{time(message.createdAt)}</time></div>

  <div class="msg-body">
    {#if message.reply}
      <button class="reply" on:click={() => onJump(message.reply.id)}>
        <b style="color:{message.reply.color || 'inherit'}">{message.reply.name}</b>
        <span class="reply-text">{message.reply.text}</span>
      </button>
    {/if}

    <div class="msg-head">
      <Avatar name={message.name} color={message.color} avatar={message.avatar} size={34} radius={11} />
      <span class="name" style="color:{message.color || 'inherit'}">{message.name}</span>
      {#if role}<span class="role" style="color:{role.color}">{role.name}</span>{/if}
      {#if message.pinned}<span class="pin-tag">закреплено</span>{/if}
    </div>

    {#if message.deleted}
      <div class="msg-text gone">сообщение удалено</div>
    {:else if editing}
      <div class="msg-edit">
        <textarea bind:value={draft} rows="2" on:keydown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
          if (e.key === "Escape") editing = false;
        }}></textarea>
        <div class="edit-actions">
          <button class="mini ghost" on:click={() => (editing = false)}>Отмена</button>
          <button class="mini" on:click={commitEdit}>Сохранить</button>
        </div>
      </div>
    {:else if message.text}
      <div class="msg-text">
        {#each parts(message.text) as part}
          {#if part.startsWith("@")}<span class="mention">{part}</span>{:else}{part}{/if}
        {/each}
        {#if message.editedAt}<span class="edited">изменено</span>{/if}
      </div>
    {/if}

    {#if message.attachments?.length}
      <div class="files">
        {#each message.attachments as file (file.id)}
          {#if isImage(file)}
            <button class="attach shot" on:click={() => (lightbox = file)}>
              <img src={fileUrl(file.url)} alt={file.name} loading="lazy" />
              <span class="attach-meta"><b>{file.name}</b><span>{size(file.size)}</span></span>
            </button>
          {:else if isVideo(file)}
            <video class="attach-video" src={fileUrl(file.url)} controls></video>
          {:else if isAudio(file)}
            <audio class="attach-audio" src={fileUrl(file.url)} controls></audio>
          {:else}
            <a class="attach file" href={fileUrl(file.url)} target="_blank" rel="noreferrer" download={file.name}>
              <span class="file-icon">↓</span>
              <span class="file-who">
                <b>{file.name}</b>
                <span>{size(file.size)}</span>
              </span>
            </a>
          {/if}
        {/each}
      </div>
    {/if}

    {#if message.reactions?.length}
      <div class="reactions">
        {#each message.reactions as reaction (reaction.emoji)}
          <button class="reaction" class:mine={reaction.mine} on:click={() => onReact(message, reaction.emoji)}>
            <span>{reaction.emoji}</span>
            <span class="n">{reaction.count}</span>
          </button>
        {/each}
        <button class="reaction add" aria-label="Добавить реакцию" on:click={() => (picker = !picker)}>+</button>
      </div>
    {/if}

    {#if picker}
      <div class="picker">
        {#each EMOJI as emoji}
          <button on:click={() => react(emoji)}>{emoji}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !message.deleted}
    <div class="msg-actions">
      <button title="Реакция" aria-label="Реакция" on:click={() => (picker = !picker)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      <button title="Ответить" aria-label="Ответить" on:click={() => onReply(message)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 7 4 12l5 5" /><path d="M4 12h9a6 6 0 0 1 6 6v1" />
        </svg>
      </button>
      {#if canEdit()}
        <button title="Изменить" aria-label="Изменить" on:click={startEdit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
          </svg>
        </button>
      {/if}
      {#if canManage}
        <button title={message.pinned ? "Открепить" : "Закрепить"} aria-label="Закрепить" on:click={() => onPin(message)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style={message.pinned ? "color:var(--acid)" : ""}>
            <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" /><path d="M12 13v7" />
          </svg>
        </button>
      {/if}
      {#if canDelete()}
        <button class="danger" title="Удалить" aria-label="Удалить" on:click={() => onDelete(message)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>

{#if lightbox}
  <div class="lightbox" role="presentation" on:click={() => (lightbox = null)}>
    <button class="lightbox-close" aria-label="Закрыть" on:click={() => (lightbox = null)}>×</button>
    <img src={fileUrl(lightbox.url)} alt={lightbox.name} />
  </div>
{/if}
