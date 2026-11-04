import { useSyncExternalStore } from "react";
import { SEED, kisiAdi, type Row, type Status } from "./iso-data";
import { oturumOku, useOturum } from "./oturum";

type State = { rows: Record<string, Row[]>; session: string | null };
const KEY = "iso-lot-v8";
let state: State = { rows: SEED, session: null };
let loaded = false;
const listeners = new Set<() => void>();

function ensure() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch {}
}
function set(next: State) {
  state = next; localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

export function useStore() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => (ensure(), state), () => ({ rows: SEED, session: null }));
}
// Giris yapan gercek kullanici (sistemdeki oturum)
export function useCurrentUser() {
  const o = useOturum();
  return o ? { id: o.kullanici.id, name: o.kullanici.adSoyad } : null;
}
const benAdi = () => oturumOku()?.kullanici.adSoyad ?? "—";
export const benimMi = (atanan: string, ad?: string | null) => !!ad && kisiAdi(atanan) === ad;

export const actions = {
  add(table: string, data: Row["data"], assignee: string) {
    const row: Row = { id: crypto.randomUUID(), data, assignee, status: "Bekliyor", createdBy: benAdi(), createdAt: new Date().toISOString() };
    set({ ...state, rows: { ...state.rows, [table]: [row, ...(state.rows[table] ?? [])] } });
  },
  decide(table: string, id: string, status: Status, note?: string) {
    set({ ...state, rows: { ...state.rows, [table]: state.rows[table].map((r) => r.id === id ? { ...r, status, note, decidedBy: benAdi(), decidedAt: new Date().toISOString() } : r) } });
  }
};
