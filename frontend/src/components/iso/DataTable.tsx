import { useMemo, useState } from "react";
import { Info, Search } from "lucide-react";
import { kisiAdi, type Row, type TableDef } from "@/lib/iso-data";
import { fmt } from "@/lib/format";
import { benimMi, useCurrentUser } from "@/lib/store";
import { StatusBadge } from "./StatusBadge";
import { DecisionActions } from "./DecisionActions";
import { AddRowDialog } from "./AddRowDialog";

export function DataTable({ table, rows }: { table: TableDef; rows: Row[] }) {
  const me = useCurrentUser();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const ql = q.toLocaleLowerCase("tr");
    return rows.filter((r) => {
      if (ql) {
        const hay = [...Object.values(r.data), kisiAdi(r.assignee), r.status, r.note ?? ""]
          .join(" ").toLocaleLowerCase("tr");
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, q]);

  return (
    <div className="overflow-hidden rounded-xl border border-tas-200 bg-white">
      <div className="flex items-center gap-2 border-b border-dikkat/20 bg-dikkat-acik px-4 py-2 text-xs text-dikkat">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Bu form henüz sisteme bağlanmadı: gösterilen satırlar örnektir. Bağlandığında gerçek kayıtlar, barkod ve akış diyagramı gelecek.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-tas-200 p-4">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tas-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tüm alanlarda ara…" className="h-10 w-full rounded-lg border border-tas-300 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-tas-400 focus:border-unity focus:ring-2 focus:ring-unity/15" />
        </div>
        <AddRowDialog table={table} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tas-200 bg-tas-50 text-left text-[11px] font-bold uppercase tracking-wider text-tas-500">
              {table.columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.type === "number" || c.type === "percent" ? "text-right" : ""}`}>
                  {c.key}
                </th>
              ))}
              <th className="whitespace-nowrap border-l border-tas-200 px-4 py-3">Sorumlu</th>
              <th className="whitespace-nowrap px-4 py-3">Onay</th>
              <th className="sticky right-0 bg-tas-50 px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tas-100">
            {filtered.map((r) => {
              const mine = benimMi(r.assignee, me?.name) && (r.status === "Bekliyor" || r.status === "Askıda");
              const label = String(r.data["Lot No"] ?? r.data[table.columns[1]?.key] ?? r.id);
              
              return (
                <tr key={r.id} className="group hover:bg-tas-50 transition-colors">
                  {table.columns.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.type === "number" || c.type === "percent" ? "text-right tabular-nums font-medium text-murekkep" : "text-tas-600"}`}>
                      {fmt(c, r.data[c.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-l border-tas-100 px-4 py-3 font-medium text-murekkep">
                    {kisiAdi(r.assignee)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="sticky right-0 bg-white px-4 py-2 group-hover:bg-tas-50 transition-colors">
                    <div className="flex items-center justify-end gap-2">
                      {mine && <DecisionActions table={table.slug} id={r.id} label={label} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-tas-200 bg-tas-50 font-bold text-murekkep">
              <tr>
                {table.columns.map((c, i) => {
                  if (c.type === "number") {
                    const sum = filtered.reduce((acc, r) => acc + (Number(r.data[c.key]) || 0), 0);
                    return <td key={c.key} className="px-4 py-4 text-right tabular-nums">{sum.toLocaleString("tr-TR")}</td>;
                  }
                  if (c.key === "Fire %") {
                    const uretim = filtered.reduce((acc, r) => acc + (Number(r.data["Üretim Miktarı"]) || 0), 0);
                    const fire = filtered.reduce((acc, r) => acc + (Number(r.data["Red/Hurda"]) || 0) + (Number(r.data["Karantina"]) || 0), 0);
                    const pct = uretim > 0 ? (fire / uretim) * 100 : 0;
                    return <td key={c.key} className="px-4 py-4 text-right tabular-nums text-unity">%{pct.toLocaleString("tr-TR", {maximumFractionDigits:1})}</td>;
                  }
                  if (c.key === "Durum") {
                    const acik = filtered.filter(r => r.data[c.key] === "Açık").length;
                    return <td key={c.key} className="px-4 py-4 text-left text-tas-600">{acik} Açık</td>;
                  }
                  return <td key={c.key} className="px-4 py-4 whitespace-nowrap text-tas-500">{i === 0 ? "GENEL TOPLAM" : ""}</td>;
                })}
                <td colSpan={3} className="px-4 py-4 bg-tas-50"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
