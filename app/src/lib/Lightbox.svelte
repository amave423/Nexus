<script>
  import { createEventDispatcher } from "svelte";
  import { fileUrl } from "./api.js";
  import { X, Plus, Minus, Maximize } from "@lucide/svelte";

  export let file;

  const dispatch = createEventDispatcher();

  const MIN = 0.2;
  const START = 0.5;
  const MAX = 8;
  let scale = START;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let moved = false;
  let stageEl = null;
  let imgEl = null;
  let natural = { w: 0, h: 0 };

  const clamp = (value) => Math.min(MAX, Math.max(MIN, value));

  function measure(event) {
    natural = { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight };
  }

  function bounds() {
    const box = stageEl?.getBoundingClientRect();
    if (!box || !natural.w || !natural.h) return { x: Infinity, y: Infinity };
    const fit = Math.min(box.width / natural.w, box.height / natural.h);
    return {
      x: Math.max(0, (natural.w * fit * scale - box.width) / 2),
      y: Math.max(0, (natural.h * fit * scale - box.height) / 2),
    };
  }

  function clampPan() {
    if (scale <= 1) {
      tx = 0;
      ty = 0;
      return;
    }
    const box = bounds();
    tx = Math.max(-box.x, Math.min(box.x, tx));
    ty = Math.max(-box.y, Math.min(box.y, ty));
  }

  function zoomTo(next) {
    scale = clamp(next);
    clampPan();
  }

  const zoomIn = () => zoomTo(scale * 1.4);
  const zoomOut = () => zoomTo(scale / 1.4);
  const reset = () => {
    scale = 1;
    tx = 0;
    ty = 0;
  };

  function onWheel(event) {
    event.preventDefault();
    const next = clamp(event.deltaY < 0 ? scale * 1.15 : scale / 1.15);
    if (next === scale) return;
    const box = stageEl?.getBoundingClientRect();
    if (!box) {
      zoomTo(next);
      return;
    }
    const px = event.clientX - box.left - box.width / 2 - tx;
    const py = event.clientY - box.top - box.height / 2 - ty;
    const k = next / scale;
    scale = next;
    tx -= px * (k - 1);
    ty -= py * (k - 1);
    clampPan();
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startTx = tx;
    startTy = ty;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    if (scale <= 1) return;
    tx = startTx + dx;
    ty = startTy + dy;
    clampPan();
  }

  function onPointerUp(event) {
    dragging = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onDoubleClick() {
    if (scale > 1) reset();
    else zoomTo(2.5);
  }

  function close() {
    dispatch("close");
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "+" || event.key === "=") zoomIn();
    if (event.key === "-" || event.key === "_") zoomOut();
    if (event.key === "0") reset();
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="lightbox" role="dialog" aria-modal="true">
  <button class="lightbox-close" aria-label="Закрыть" on:click={close}><X size={20} strokeWidth={2} /></button>

  <div
    bind:this={stageEl}
    class="lightbox-stage"
    class:dragging
    class:zoomed={scale > 1}
    role="presentation"
    on:wheel={onWheel}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:dblclick={onDoubleClick}
    on:click|self={() => (moved ? null : close())}
  >
    <img
      bind:this={imgEl}
      src={fileUrl(file.url)}
      alt={file.name}
      draggable="false"
      on:load={measure}
      style={`transform:translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`}
    />
  </div>

  <div class="lightbox-bar">
    <span class="lightbox-name">{file.name}</span>
    <div class="lightbox-tools">
      <button aria-label="Отдалить" title="Отдалить" on:click={zoomOut} disabled={scale <= MIN}><Minus size={16} strokeWidth={2} /></button>
      <span class="lightbox-zoom">{Math.round(scale * 100)}%</span>
      <button aria-label="Приблизить" title="Приблизить" on:click={zoomIn} disabled={scale >= MAX}><Plus size={16} strokeWidth={2} /></button>
      <button aria-label="Как есть" title="Как есть" on:click={reset} disabled={scale === 1 && !tx && !ty}><Maximize size={16} strokeWidth={2} /></button>
    </div>
  </div>
</div>
