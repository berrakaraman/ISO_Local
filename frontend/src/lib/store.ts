import { useSyncExternalStore } from "react";
import { SEED, USERS, type Row, type Status } from "./iso-data";

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
export function useCurrentUser() {
  const s = useStore(); return USERS.find((u) => u.id === s.session) ?? null;
}

export const actions = {
  login(username: string, password: string) {
    ensure(); const u = USERS.find((x) => x.username === username.trim().toLowerCase() && x.password === password);
    if (!u) return false; set({ ...state, session: u.id }); return true;
  },
  logout() { set({ ...state, session: null }); },
  add(table: string, data: Row["data"], assignee: string) {
    const row: Row = { id: crypto.randomUUID(), data, assignee, status: "Bekliyor", createdBy: state.session ?? "u1", createdAt: new Date().toISOString() };
    set({ ...state, rows: { ...state.rows, [table]: [row, ...(state.rows[table] ?? [])] } });
  },
  remove(table: string, id: string) {
    set({ ...state, rows: { ...state.rows, [table]: state.rows[table].filter((r) => r.id !== id) } });
  },
  decide(table: string, id: string, status: Status, note?: string) {
    set({ ...state, rows: { ...state.rows, [table]: state.rows[table].map((r) => r.id === id ? { ...r, status, note, decidedBy: state.session ?? undefined, decidedAt: new Date().toISOString() } : r) } });
  }
};
