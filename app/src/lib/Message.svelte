<script>
  import Avatar from "./Avatar.svelte";
  import { fileUrl } from "./api.js";

  export let message;
  export let me;
  export let canManage = false;
  export let grouped = false;
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

<div class="msg" class:grouped class:deleted={message.deleted} class:mine={own()}>
  {#if grouped}
    <div class="gutter"><time>{time(message.createdAt)}</time></div>
  {:else}
    <Avatar name={message.name} color={message.color} avatar={message.avatar} size={38} radius={12} />
  {/if}

  <div class="body">
    {#if !grouped}
      <div class="mhead">
        <b style="color:{message.color || 'inherit'}">{message.name}</b>
        <time>{time(message.createdAt)}</time>
        {#if message.pinned}<span class="tag">закреплено</span>{/if}
      </div>
    {/if}

    {#if message.reply}
      <button class="reply" on:click={() => onJump(message.reply.id)}>
        <span class="bar"></span>
        <b style="color:{message.reply.color || 'inherit'}">{message.reply.name}</b>
        <span class="reply-text">{message.reply.text}</span>
      </button>
    {/if}

    {#if message.deleted}
      <div class="text gone">сообщение удалено</div>
    {:else if editing}
      <div class="edit">
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
      <div class="text">
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
            <button class="shot" on:click={() => (lightbox = file)}>
              <img src={fileUrl(file.url)} alt={file.name} loading="lazy" />
            </button>
          {:else if isVideo(file)}
            <video class="shot-video" src={fileUrl(file.url)} controls></video>
          {:else if isAudio(file)}
            <audio class="audio" src={fileUrl(file.url)} controls></audio>
          {:else}
            <a class="file" href={fileUrl(file.url)} target="_blank" rel="noreferrer" download={file.name}>
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
          <button class="chip" class:mine={reaction.mine} on:click={() => onReact(message, reaction.emoji)}>
            <span>{reaction.emoji}</span>
            <b>{reaction.count}</b>
          </button>
        {/each}
        <button class="chip add" aria-label="Добавить реакцию" on:click={() => (picker = !picker)}>+</button>
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
    <div class="tools">
      <button title="Реакция" aria-label="Реакция" on:click={() => (picker = !picker)}>☺</button>
      <button title="Ответить" aria-label="Ответить" on:click={() => onReply(message)}>↩</button>
      {#if canEdit()}
        <button title="Изменить" aria-label="Изменить" on:click={startEdit}>✎</button>
      {/if}
      {#if canManage}
        <button title={message.pinned ? "Открепить" : "Закрепить"} aria-label="Закрепить" on:click={() => onPin(message)}>
          {message.pinned ? "★" : "☆"}
        </button>
      {/if}
      {#if canDelete()}
        <button class="danger" title="Удалить" aria-label="Удалить" on:click={() => onDelete(message)}>✕</button>
      {/if}
    </div>
  {/if}
</div>

{#if lightbox}
  <button class="lightbox" aria-label="Закрыть" on:click={() => (lightbox = null)}>
    <img src={fileUrl(lightbox.url)} alt={lightbox.name} />
  </button>
{/if}

<style>
  .msg {
    position: relative;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 12px;
    padding: 6px 10px;
    border-radius: 12px;
  }
  .msg:hover { background: rgba(255, 255, 255, 0.025); }
  .msg.grouped { padding-top: 1px; padding-bottom: 1px; }
  .msg.grouped:hover .gutter time { opacity: 1; }
  .gutter {
    display: flex;
    justify-content: flex-end;
    padding-top: 4px;
  }
  .gutter time {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--dim);
    opacity: 0;
    transition: 0.15s;
  }
  .body { min-width: 0; }
  .mhead {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mhead b { font-size: 13.5px; font-weight: 600; }
  .mhead time {
    font-family: var(--mono);
    font-size: 9.5px;
    color: var(--dim);
  }
  .tag {
    font-family: var(--mono);
    font-size: 8.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--acid);
    border: 1px solid rgba(var(--acid-rgb), 0.3);
    border-radius: 5px;
    padding: 1px 5px;
  }
  .text {
    font-size: 14px;
    line-height: 1.5;
    color: var(--txt-2);
    margin-top: 2px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .text.gone { color: var(--dim); font-style: italic; font-size: 13px; }
  .edited {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--dim);
    margin-left: 6px;
  }
  .mention {
    color: var(--acid);
    background: rgba(var(--acid-rgb), 0.12);
    border-radius: 5px;
    padding: 0 3px;
  }
  .reply {
    display: flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    margin: 2px 0 3px;
    padding: 0;
    background: none;
    border: 0;
    color: var(--dim);
    font-size: 12px;
    text-align: left;
  }
  .reply .bar {
    width: 2px;
    height: 14px;
    border-radius: 2px;
    background: var(--line);
    flex: 0 0 auto;
  }
  .reply b { font-size: 12px; font-weight: 600; }
  .reply-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.8;
  }
  .reply:hover .reply-text { color: var(--txt-2); }
  .files { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .shot {
    padding: 0;
    border: 1px solid var(--line-soft);
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    max-width: 340px;
  }
  .shot img { display: block; max-width: 100%; max-height: 260px; object-fit: cover; }
  .shot-video { max-width: 340px; border-radius: 12px; border: 1px solid var(--line-soft); }
  .audio { max-width: 320px; height: 36px; }
  .file {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 13px;
    border-radius: 12px;
    border: 1px solid var(--line-soft);
    background: rgba(255, 255, 255, 0.03);
    color: var(--txt-2);
    text-decoration: none;
    max-width: 300px;
  }
  .file:hover { border-color: rgba(var(--acid-rgb), 0.4); }
  .file-icon {
    width: 28px; height: 28px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: rgba(var(--acid-rgb), 0.12);
    color: var(--acid);
    flex: 0 0 auto;
  }
  .file-who { display: flex; flex-direction: column; min-width: 0; }
  .file-who b { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-who span { font-family: var(--mono); font-size: 9px; color: var(--dim); }
  .reactions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 9px;
    border: 1px solid var(--line-soft);
    background: rgba(255, 255, 255, 0.03);
    font-size: 12px;
    color: var(--txt-2);
  }
  .chip b { font-family: var(--mono); font-size: 10px; font-weight: 500; }
  .chip.mine { border-color: rgba(var(--acid-rgb), 0.5); background: rgba(var(--acid-rgb), 0.1); }
  .chip.add { color: var(--dim); padding: 2px 7px; }
  .chip:hover { border-color: rgba(var(--acid-rgb), 0.4); }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 6px;
    padding: 6px;
    width: max-content;
    max-width: 100%;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  }
  .picker button {
    width: 30px; height: 30px;
    border-radius: 8px;
    font-size: 16px;
    background: none;
  }
  .picker button:hover { background: rgba(255, 255, 255, 0.07); }
  .tools {
    position: absolute;
    top: -12px;
    right: 12px;
    display: none;
    gap: 1px;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--panel);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  }
  .msg:hover .tools { display: flex; }
  .tools button {
    width: 26px; height: 26px;
    border-radius: 7px;
    display: grid; place-items: center;
    font-size: 12px;
    color: var(--muted);
    background: none;
  }
  .tools button:hover { background: rgba(255, 255, 255, 0.07); color: var(--acid); }
  .tools button.danger:hover { color: #ff6b8a; }
  .edit textarea {
    width: 100%;
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(var(--acid-rgb), 0.4);
    background: rgba(0, 0, 0, 0.4);
    color: var(--txt);
    font: inherit;
    font-size: 14px;
    resize: vertical;
  }
  .edit-actions { display: flex; gap: 6px; margin-top: 5px; }
  .mini {
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 11px;
    background: rgba(var(--acid-rgb), 0.14);
    color: var(--acid);
    border: 1px solid rgba(var(--acid-rgb), 0.3);
  }
  .mini.ghost { background: none; color: var(--muted); border-color: var(--line-soft); }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 30px;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(6px);
    border: 0;
  }
  .lightbox img { max-width: 100%; max-height: 100%; border-radius: 12px; }
</style>
