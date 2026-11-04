import type { Column } from "./iso-data";

const ISO = /^\d{4}-\d{2}-\d{2}T/;

export function fmt(col: Column, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (col.type === "number") return Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  if (col.type === "percent") return `%${(Number(v) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
  if (col.type === "date") return new Date(String(v)).toLocaleDateString("tr-TR");
  if (col.type === "datetime" && ISO.test(String(v)))
    return new Date(String(v)).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  if (col.type === "time" && ISO.test(String(v))) return new Date(String(v)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return String(v);
}
export const fmtDateTime = (v?: string) => (v ? new Date(v).toLocaleString("tr-TR") : "—");
