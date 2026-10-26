import type { Column } from "./iso-data";
export function fmt(col: Column, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (col.type === "number") return Number(v).toLocaleString("tr-TR");
  if (col.type === "percent") return `%${(Number(v) * 100).toLocaleString("tr-TR")}`;
  if (col.type === "date") return new Date(String(v)).toLocaleDateString("tr-TR");
  return String(v);
}
export const fmtDateTime = (v?: string) => v ? new Date(v).toLocaleString("tr-TR") : "—";
