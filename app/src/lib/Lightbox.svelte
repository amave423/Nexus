<script>
  import { createEventDispatcher } from "svelte";
  import { fileUrl } from "./api.js";
  import { X, Plus, Minus, Maximize } from "@lucide/svelte";

  export let file;

  const dispatch = createEventDispatcher();

  const MIN = 1;
  const MAX = 8;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let moved = false;

  const clamp = (value) => Math.min(MAX, Math.max(MIN, value));

  function zoomTo(next) {
    scale = clamp(next);
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
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
    if (event.deltaY < 0) zoomTo(scale * 1.15);
    else zoomTo(scale / 1.15);
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
    if (scale === 1) return;
    tx = startTx + dx;
    ty = startTy + dy;
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
      src={fileUrl(file.url)}
      alt={file.name}
      draggable="false"
      style={`transform:translate(${tx}px, ${ty}px) scale(${scale})`}
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
