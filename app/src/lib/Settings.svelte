<script>
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { api } from "./api.js";
  import { prefs, ACCENTS, DEFAULTS, NOISE } from "./prefs.js";
  import { buildMicTrack } from "./noise.js";
  import { playSound } from "./sound.js";
  import { toast } from "./toasts.js";
  import Avatar from "./Avatar.svelte";
  import Dropdown from "./Dropdown.svelte";

  export let user;

  const dispatch = createEventDispatcher();

  const ICONS = {
    profile:
      '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6.5 6.5 0 0 0-2-4.7"/>',
    voice:
      '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    notify:
      '<path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
    look:
      '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r="1.2"/><circle cx="15" cy="9.5" r="1.2"/><circle cx="9.5" cy="15" r="1.2"/>',
    keys:
      '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    update:
      '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  };

  const TABS = [
    { grp: "аккаунт" },
    { id: "profile", label: "Профиль", icon: "profile" },
    { id: "voice", label: "Голос и видео", icon: "voice" },
    { grp: "приложение" },
    { id: "notify", label: "Уведомления", icon: "notify" },
    { id: "look", label: "Внешний вид", icon: "look" },
    { id: "keys", label: "Горячие клавиши", icon: "keys" },
    { id: "update", label: "Обновления", icon: "update" },
  ];

  const STATUS_LABEL = {
    online: "в сети",
    idle: "отошёл",
    dnd: "не беспокоить",
    invisible: "невидимка",
  };
  const STATUS_VALUE = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [v, k]));

  let tab = "profile";
  let name = user.name;
  let about = user.about || "";
  let status = STATUS_LABEL[user.status] || "в сети";
  let saving = false;
  let error = "";
  let saved = "";

  let devices = [];
  let micStream = null;
  let micChain = null;
  let analyser = null;
  let raf = 0;
  let bars = new Array(28).fill(0);
  let micState = "микрофон не запущен";
  let micError = false;
  let recorder = null;
  let chunks = [];
  let recordedUrl = null;
  let recording = false;

  let capturing = null;
  let appInfo = { version: "—", packaged: false };
  let update = { status: "idle", version: null, percent: 0, error: null };

  const desktop = window.nexus?.desktop || null;

  const UPDATE_LABEL = {
    idle: "Проверка ещё не запускалась",
    checking: "Проверяю обновления…",
    latest: "Установлена последняя версия",
    downloading: "Скачиваю обновление",
    ready: "Обновление готово — перезапусти приложение",
    error: "Не удалось проверить обновления",
    dev: "В режиме разработки обновления не проверяются",
  };

  async function checkUpdate() {
    if (!desktop) return;
    const result = await desktop.checkUpdate();
    if (result) update = { ...update, ...result };
  }

  let P;
  $: P = $prefs;

  function set(part) {
    prefs.patch(part);
  }

  async function saveProfile() {
    saving = true;
    error = "";
    saved = "";
    try {
      const data = await api("/api/me", {
        method: "PATCH",
        body: { name, about, status: STATUS_VALUE[status] || "online" },
      });
      user = data.user;
      dispatch("user", data.user);
      saved = "сохранено";
      setTimeout(() => (saved = ""), 1800);
    } catch (e) {
      error =
        e.code === "name_taken"
          ? "Это имя уже занято"
          : e.code === "name_length"
            ? "Имя: от 2 до 24 символов"
            : e.message;
    } finally {
      saving = false;
    }
  }

  async function resizeImage(file, size) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const s = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const avatar = await resizeImage(file, 176);
      const data = await api("/api/me", { method: "PATCH", body: { avatar } });
      user = data.user;
      dispatch("user", data.user);
    } catch (e) {
      error = e.code === "avatar_too_big" ? "Картинка слишком большая" : "Не удалось загрузить";
    }
  }

  async function resetAvatar() {
    const data = await api("/api/me", { method: "PATCH", body: { avatar: null } });
    user = data.user;
    dispatch("user", data.user);
  }

  async function listDevices() {
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audioinput" || d.kind === "audiooutput"
      );
    } catch {
      devices = [];
    }
  }

  const micOptions = () => {
    const list = devices.filter((d) => d.kind === "audioinput");
    return ["По умолчанию", ...list.map((d, i) => d.label || `Микрофон ${i + 1}`)];
  };
  const outOptions = () => {
    const list = devices.filter((d) => d.kind === "audiooutput");
    return ["По умолчанию", ...list.map((d, i) => d.label || `Выход ${i + 1}`)];
  };

  function constraints() {
    return {
      audio: {
        deviceId: P.micDevId ? { exact: P.micDevId } : undefined,
        echoCancellation: P.echoCancel,
        noiseSuppression: P.noiseMode === "browser",
        autoGainControl: P.autoGain,
      },
    };
  }

  async function startMeter() {
    stopMeter();
    micError = false;
    micState = "запрашиваю доступ…";
    try {
      micStream = await navigator.mediaDevices.getUserMedia(constraints());
      let track = micStream.getAudioTracks()[0];
      let noiseFailed = false;
      if (P.noiseMode === "rnnoise") {
        micState = "загружаю шумодав…";
        try {
          micChain = await buildMicTrack(micStream, { level: 100, mode: "rnnoise" });
          track = micChain.track;
          noiseFailed = !!micChain.failed;
        } catch {
          micChain = null;
          noiseFailed = true;
        }
      }
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const source = ac.createMediaStreamSource(new MediaStream([track]));
      analyser = ac.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      micState = noiseFailed
        ? "шумодав не загрузился — работает браузерный"
        : P.noiseMode === "rnnoise"
          ? "шумодав RNNoise включён — говори"
          : "говори — полоски должны шевелиться";
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / 28) || 1;
        bars = Array.from({ length: 28 }, (_, i) => {
          const v = data[i * step] / 255;
          return Math.max(0.06, Math.min(1, v * 1.5));
        });
        raf = requestAnimationFrame(tick);
      };
      tick();
      listDevices();
    } catch (e) {
      micError = true;
      micState = e.name === "NotAllowedError" ? "доступ к микрофону запрещён" : "микрофон не найден";
    }
  }

  function stopMeter() {
    cancelAnimationFrame(raf);
    raf = 0;
    micStream?.getTracks().forEach((t) => t.stop());
    micChain?.dispose();
    micChain = null;
    micStream = null;
    analyser = null;
    bars = new Array(28).fill(0.06);
  }

  async function recordMic() {
    if (!micStream) await startMeter();
    if (!micStream) return;
    chunks = [];
    recordedUrl = null;
    const recorded = micChain ? new MediaStream([micChain.track]) : micStream;
    recorder = new MediaRecorder(recorded);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      recordedUrl = URL.createObjectURL(new Blob(chunks, { type: "audio/webm" }));
      recording = false;
    };
    recorder.start();
    recording = true;
    setTimeout(() => recorder?.state === "recording" && recorder.stop(), 3000);
  }

  function playRecorded() {
    if (recordedUrl) new Audio(recordedUrl).play();
  }

  function testNotification() {
    playSound(P.sound, P.volume);
    toast({
      name: "Nexus",
      text: "Так выглядит и звучит уведомление.",
      color: P.accent,
    });
  }

  function comboFromEvent(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    const key = e.key;
    if (["Control", "Alt", "Shift", "Meta"].includes(key)) return null;
    const named = { " ": "Space", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
    parts.push(named[key] || (key.length === 1 ? key.toUpperCase() : key));
    return parts.join("+");
  }

  function onKeydown(e) {
    if (!capturing) return;
    e.preventDefault();
    const combo = comboFromEvent(e);
    if (!combo) return;
    prefs.setKey(capturing, combo);
    capturing = null;
  }

  let offUpdate = null;

  onMount(() => {
    listDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", listDevices);
    if (desktop) {
      desktop.info?.().then((info) => (appInfo = info)).catch(() => {});
      offUpdate = desktop.onUpdate?.((state) => (update = { ...update, ...state }));
    }
  });

  onDestroy(() => {
    offUpdate?.();
    stopMeter();
    navigator.mediaDevices?.removeEventListener?.("devicechange", listDevices);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  });
</script>

<svelte:window on:keydown={onKeydown} />

<div class="modal" role="dialog" aria-modal="true">
  <div class="modal-card">
    <aside class="set-nav">
      {#each TABS as item (item.id || item.grp)}
        {#if item.grp}
          <span class="grp">{item.grp}</span>
        {:else}
          <button class:active={tab === item.id} on:click={() => (tab = item.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html ICONS[item.icon] || ""}</svg>
            <span>{item.label}</span>
          </button>
        {/if}
      {/each}
    </aside>

    <div class="set-main">
      <header class="set-head">
        <h2>Настройки</h2>
        <button class="icon-btn" aria-label="Закрыть" on:click={() => dispatch("close")}>✕</button>
      </header>

      <div class="set-pane">
        {#if tab === "profile"}
          <div class="set-profile">
            <label class="avatar-up">
              <Avatar name={user.name} color={user.color} avatar={user.avatar} size={76} radius={24} />
              <span class="avatar-up-hint">сменить</span>
              <input type="file" accept="image/*" on:change={uploadAvatar} hidden />
            </label>
            <div class="who">
              <b>{user.name}</b>
              <span>@{user.name.toLowerCase().replace(/\s+/g, "")} · {STATUS_LABEL[user.status] || "в сети"}</span>
            </div>
            {#if user.avatar}
              <button class="ghost-btn" style="margin-left:auto" on:click={resetAvatar}>Сбросить</button>
            {/if}
          </div>

          <div class="set-field">
            <label for="setName">Отображаемое имя</label>
            <input id="setName" class="set-input" bind:value={name} maxlength="24" />
          </div>
          <div class="set-field">
            <label for="setAbout">О себе</label>
            <textarea id="setAbout" class="set-input" bind:value={about} maxlength="280"></textarea>
          </div>
          <div class="set-row">
            <div class="set-row-t">
              <b>Статус</b>
              <span>Что видят остальные рядом с твоим именем</span>
            </div>
            <Dropdown value={status} options={Object.keys(STATUS_LABEL).map((k) => STATUS_LABEL[k])} on:change={(e) => (status = e.detail)} />
          </div>

          {#if error}<div class="error">{error}</div>{/if}
          <div class="set-actions">
            <button class="set-copy" on:click={saveProfile} disabled={saving}>
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
            {#if saved}<span class="set-saved">{saved}</span>{/if}
            <button class="danger-btn" style="margin-left:auto" on:click={() => dispatch("logout")}>Выйти из аккаунта</button>
          </div>
        {/if}

        {#if tab === "voice"}
          <div class="set-row">
            <div class="set-row-t"><b>Микрофон</b><span>Устройство ввода</span></div>
            <Dropdown
              value={P.micDev}
              options={micOptions()}
              on:change={(e) => {
                const found = devices.find((d) => d.kind === "audioinput" && (d.label || "") === e.detail);
                set({ micDev: e.detail, micDevId: found?.deviceId || "" });
              }}
            />
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Выход</b><span>Устройство вывода</span></div>
            <Dropdown
              value={P.outDev}
              options={outOptions()}
              on:change={(e) => {
                const found = devices.find((d) => d.kind === "audiooutput" && (d.label || "") === e.detail);
                set({ outDev: e.detail, outDevId: found?.deviceId || "" });
              }}
            />
          </div>

          <div class="set-field">
            <label>Уровень микрофона · {P.micLevel}%</label>
            <input
              type="range"
              class="set-range"
              style="--fill:{P.micLevel}%"
              min="0"
              max="100"
              value={P.micLevel}
              on:input={(e) => set({ micLevel: +e.currentTarget.value })}
            />
          </div>

          <div class="vtest" class:live={!!micStream}>
            <div class="vtest-head">
              <b>Проверка микрофона</b>
              <span>Послушай, как тебя слышно, до того как зайти в комнату</span>
            </div>
            <div class="vtest-meter">
              {#each bars as level, i (i)}
                <i style="height:{Math.round(6 + level * 34)}px"></i>
              {/each}
            </div>
            <div class="vtest-status" class:err={micError}>{micState}</div>
            <div class="vtest-actions">
              <button class="set-copy" on:click={startMeter}>Проверить</button>
              <button class="ghost-btn" on:click={recordMic} disabled={recording}>
                {recording ? "Записываю…" : "Записать 3 сек"}
              </button>
              <button class="ghost-btn" on:click={playRecorded} disabled={!recordedUrl}>Прослушать</button>
            </div>
          </div>

          <div class="set-row">
            <div class="set-row-t"><b>Шумоподавление</b><span>RNNoise вырезает клавиатуру, вентилятор и улицу</span></div>
            <Dropdown
              value={Object.keys(NOISE).find((label) => NOISE[label] === P.noiseMode) || "RNNoise · сильный"}
              options={Object.keys(NOISE)}
              on:change={(e) => { set({ noiseMode: NOISE[e.detail] || "rnnoise" }); stopMeter(); }}
            />
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Эхоподавление</b><span>Гасит эхо, когда слушаешь в колонках</span></div>
            <button class="switch" class:on={P.echoCancel} role="switch" aria-checked={P.echoCancel} on:click={() => set({ echoCancel: !P.echoCancel })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Автоусиление</b><span>Подтягивает тихий голос</span></div>
            <button class="switch" class:on={P.autoGain} role="switch" aria-checked={P.autoGain} on:click={() => set({ autoGain: !P.autoGain })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Качество</b><span>Битрейт звука в комнате</span></div>
            <Dropdown value={P.quality} options={["64 kbps", "96 kbps", "128 kbps"]} on:change={(e) => set({ quality: e.detail })} />
          </div>
        {/if}

        {#if tab === "notify"}
          <div class="set-row">
            <div class="set-row-t"><b>Уведомления на рабочем столе</b><span>Всплывающие окна, когда окно свёрнуто</span></div>
            <button class="switch" class:on={P.notifDesktop} role="switch" aria-checked={P.notifDesktop} on:click={() => set({ notifDesktop: !P.notifDesktop })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Звук уведомлений</b><span>Короткий сигнал на новое сообщение</span></div>
            <button class="switch" class:on={P.notifSound} role="switch" aria-checked={P.notifSound} on:click={() => set({ notifSound: !P.notifSound })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Упоминания</b><span>Всегда подсвечивать @упоминания</span></div>
            <button class="switch" class:on={P.notifMention} role="switch" aria-checked={P.notifMention} on:click={() => set({ notifMention: !P.notifMention })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Не беспокоить</b><span>Скрыть все уведомления</span></div>
            <button class="switch" class:on={P.dnd} role="switch" aria-checked={P.dnd} on:click={() => set({ dnd: !P.dnd })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Звук</b><span>Как звучит уведомление</span></div>
            <Dropdown value={P.sound} options={["Мягкий", "Пинг", "Капля", "Аккорд"]} on:change={(e) => { set({ sound: e.detail }); playSound(e.detail, P.volume); }} />
          </div>
          <div class="set-field">
            <label>Громкость · {P.volume}%</label>
            <input
              type="range"
              class="set-range"
              style="--fill:{P.volume}%"
              min="0"
              max="100"
              value={P.volume}
              on:input={(e) => set({ volume: +e.currentTarget.value })}
              on:change={() => playSound(P.sound, P.volume)}
            />
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Проверить</b><span>Покажем, как это выглядит и звучит</span></div>
            <button class="set-copy" on:click={testNotification}>Пример</button>
          </div>
        {/if}

        {#if tab === "look"}
          <div class="set-row">
            <div class="set-row-t"><b>Тема</b><span>Чернила, холодная полночь или жёсткий контраст</span></div>
            <Dropdown value={P.theme} options={["Чернила", "Полночь", "Контраст"]} on:change={(e) => set({ theme: e.detail })} />
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Плотность</b><span>Сколько сообщений влезает на экран</span></div>
            <Dropdown value={P.density} options={["Просторно", "Обычно", "Плотно"]} on:change={(e) => set({ density: e.detail })} />
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Акцент</b><span>Единственный цвет, который что-то значит</span></div>
            <div class="set-swatches">
              {#each ACCENTS as [color, label] (color)}
                <button
                  class="swatch"
                  class:on={P.accent === color}
                  title={label}
                  style="background:{color}"
                  on:click={() => set({ accent: color })}
                ></button>
              {/each}
            </div>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Анимации</b><span>Волны, свечение, переходы</span></div>
            <button class="switch" class:on={P.anim} role="switch" aria-checked={P.anim} on:click={() => set({ anim: !P.anim })}><i></i></button>
          </div>
          <div class="set-row">
            <div class="set-row-t"><b>Фон</b><span>Размытые пятна за интерфейсом</span></div>
            <button class="switch" class:on={P.bg} role="switch" aria-checked={P.bg} on:click={() => set({ bg: !P.bg })}><i></i></button>
          </div>
        {/if}

        {#if tab === "update"}
          <div class="set-row">
            <div class="set-row-t"><b>Версия</b><span>Nexus {appInfo.version}</span></div>
            <button class="set-copy" on:click={checkUpdate} disabled={!desktop || update.status === "checking"}>
              Проверить
            </button>
          </div>
          <div class="set-row">
            <div class="set-row-t">
              <b>Состояние</b>
              <span>{UPDATE_LABEL[update.status] || update.status}{update.status === "downloading" ? ` · ${update.percent}%` : ""}</span>
            </div>
            {#if update.status === "ready"}
              <button class="set-copy" on:click={() => desktop?.installUpdate()}>Перезапустить</button>
            {/if}
          </div>
          {#if update.error}<div class="error">{update.error}</div>{/if}
          <p class="set-hint">Приложение само проверяет обновления при запуске и раз в шесть часов. Скачивается в фоне, установка — по кнопке.</p>
        {/if}

        {#if tab === "keys"}
          <p class="set-hint">Нажми на сочетание и введи новое — оно сохранится и будет работать в приложении.</p>
          {#each [["mic", "Микрофон", "Вкл / выкл"], ["deaf", "Звук", "Вкл / выкл"], ["cam", "Камера", "Вкл / выкл"], ["screen", "Стрим", "Начать / остановить"], ["leave", "Выйти из комнаты", "Отключиться от голоса"], ["search", "Поиск", "Открыть поиск по каналу"]] as [action, title, desc] (action)}
            <div class="set-row">
              <div class="set-row-t"><b>{title}</b><span>{desc}</span></div>
              <button
                class="keyset"
                class:listening={capturing === action}
                on:click={() => (capturing = action)}
              >
                {#if capturing === action}
                  <span class="kbd">…</span><i>нажми</i>
                {:else}
                  {#each P.keys[action].split("+") as part, i (i)}
                    {#if i > 0}<i>+</i>{/if}
                    <span class="kbd">{part}</span>
                  {/each}
                {/if}
              </button>
            </div>
          {/each}
          <button class="ghost-btn" style="align-self:flex-start" on:click={() => prefs.resetKeys()}>Сбросить все</button>
        {/if}
      </div>
    </div>
  </div>
</div>
