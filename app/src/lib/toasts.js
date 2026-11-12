import { writable } from "svelte/store";

export const toasts = writable([]);

let seq = 0;

export function toast({ name, text, color, avatar, time = 4200 }) {
  const id = ++seq;
  toasts.update((list) => [...list.slice(-3), { id, name, text, color, avatar }]);
  setTimeout(() => {
    toasts.update((list) => list.filter((t) => t.id !== id));
  }, time);
  return id;
}

export function dismiss(id) {
  toasts.update((list) => list.filter((t) => t.id !== id));
}
