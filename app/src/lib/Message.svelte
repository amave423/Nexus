<script>
  import Avatar from "./Avatar.svelte";
  import { fileUrl } from "./api.js";

  import { FaceSlightlySmiling, Reply, Pencil, Pin, Trash } from "@lucide/svelte";

  export let message;
  export let customEmoji = [];
  export let me;
  export let canManage = false;
  export let role = null;
  export let onReply = () => {};
  export let onEdit = () => {};
  export let onDelete = () => {};
  export let onReact = () => {};
  export let onPin = () => {};
  export let onJump = () => {};

  const EMOJI = ["🔥", "😂", "❤️", "👍", "👀", "🎉", "😮", "💀", "🤝", "✅", "🍕", "🚀", "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😎", "🤔", "🙄", "😴", "😭", "😡", "🤯", "🥳", "😱", "🙏", "👏", "💪", "💯", "✨", "🌟", "💖", "💔", "💰", "🎁", "🎂", "🎮", "🎧", "⚽", "🏆", "🌈", "☀️", "🌙", "🍎", "🍔", "🍟", "🍰", "☕", "🐱", "🐶", "🦊", "🐸", "🐼", "🦄", "⚡", "👻", "🎃"];
  $: allEmoji = [...customEmoji.map((e) => `:${e.name}:`), ...EMOJI];
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

  const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function parts(text) {
    const names = customEmoji.map((e) => e.name).filter(Boolean);
    if (!names.length) return text.split(/(@[\wА-Яа-яЁё-]+)/g);
    const re = new RegExp(`(@[\\wА-Яа-яЁё-]+|:(?:${names.map(escapeRe).join("|")}):)`, "g");
    return text.split(re);
  }

  const isImage = (file) => file.mime.startsWith("image/");
  const isVideo = (file) => file.mime.startsWith("video/");
  const isAudio = (file) => file.mime.startsWith("audio/");

  function emojiUrl(emoji) {
    return customEmoji.find((item) => `:${item.name}:` === emoji)?.url || null;
  }

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
          {#if emojiUrl(part)}<img class="custom-emoji" src={fileUrl(emojiUrl(part))} alt={part} title={part} />{:else if part.startsWith("@")}<span class="mention">{part}</span>{:else}{part}{/if}
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
            <span>{#if emojiUrl(reaction.emoji)}<img class="custom-reaction" src={fileUrl(emojiUrl(reaction.emoji))} alt={reaction.emoji} />{:else}{reaction.emoji}{/if}</span>
            <span class="n">{reaction.count}</span>
          </button>
        {/each}
        <button class="reaction add" aria-label="Добавить реакцию" on:click={() => (picker = !picker)}>+</button>
      </div>
    {/if}

    {#if picker}
      <div class="picker">
        {#each allEmoji as emoji}
          <button aria-label={emoji} title={emoji} on:click={() => react(emoji)}>
            {#if emojiUrl(emoji)}<img src={fileUrl(emojiUrl(emoji))} alt={emoji} />{:else}{emoji}{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !message.deleted}
    <div class="msg-actions">
      <button title="Реакция" aria-label="Реакция" on:click={() => (picker = !picker)}>
        <FaceSlightlySmiling size={16} strokeWidth={1.8} />
      </button>
      <button title="Ответить" aria-label="Ответить" on:click={() => onReply(message)}>
        <Reply size={16} strokeWidth={1.8} />
      </button>
      {#if canEdit()}
        <button title="Изменить" aria-label="Изменить" on:click={startEdit}>
          <Pencil size={16} strokeWidth={1.8} />
        </button>
      {/if}
      {#if canManage}
        <button title={message.pinned ? "Открепить" : "Закрепить"} aria-label="Закрепить" on:click={() => onPin(message)}>
          <Pin size={16} strokeWidth={1.8} style={message.pinned ? "color:var(--acid)" : ""} />
        </button>
      {/if}
      {#if canDelete()}
        <button class="danger" title="Удалить" aria-label="Удалить" on:click={() => onDelete(message)}>
          <Trash size={16} strokeWidth={1.8} />
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
