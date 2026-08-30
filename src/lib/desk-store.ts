// "My Desk" store — user-uploaded PDFs and physical study logs.

export type DeskKind = "pdf" | "physical";

export type DeskItem = {
  id: string;
  kind: DeskKind;
  name: string;
  dataUrl?: string; // present for pdf uploads
  createdAt: number;
};

const KEY = "ftlb.desk.v1";

type Listener = (items: DeskItem[]) => void;
const listeners = new Set<Listener>();

function newId() {
  return "desk-" + Math.random().toString(36).slice(2, 10);
}

function load(): DeskItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: DeskItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("Desk store save failed (quota?)", e);
  }
  listeners.forEach((l) => l(items));
}

export function subscribeDesk(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function listDesk(): DeskItem[] {
  return load();
}
export function getDeskItem(id: string): DeskItem | null {
  return load().find((d) => d.id === id) ?? null;
}
export function addPdf(name: string, dataUrl: string): DeskItem {
  const item: DeskItem = { id: newId(), kind: "pdf", name, dataUrl, createdAt: Date.now() };
  save([...load(), item]);
  return item;
}
export function addPhysical(name: string): DeskItem {
  const item: DeskItem = { id: newId(), kind: "physical", name, createdAt: Date.now() };
  save([...load(), item]);
  return item;
}
export function removeDesk(id: string) {
  save(load().filter((d) => d.id !== id));
}