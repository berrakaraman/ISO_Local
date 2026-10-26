import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userName, type Row, type TableDef } from "@/lib/iso-data";
import { fmt } from "@/lib/format";
import { actions, useCurrentUser } from "@/lib/store";
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
        const hay = [...Object.values(r.data), userName(r.assignee), r.status, r.note ?? ""]
          .join(" ").toLocaleLowerCase("tr");
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, q]);

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-slate-50/50 p-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tüm alanlarda ara..." className="pl-9 bg-white" />
        </div>
        <AddRowDialog table={table} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-100/50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
              {table.columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.type === "number" || c.type === "percent" ? "text-right" : ""}`}>
                  {c.key}
                </th>
              ))}
              <th className="whitespace-nowrap border-l border-slate-200 px-4 py-3">Sorumlu</th>
              <th className="whitespace-nowrap px-4 py-3">Onay</th>
              <th className="sticky right-0 bg-slate-100/50 px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const mine = r.assignee === me?.id && (r.status === "Bekliyor" || r.status === "Askıda");
              const label = String(r.data["Lot No"] ?? r.data[table.columns[1]?.key] ?? r.id);
              
              return (
                <tr key={r.id} className="group hover:bg-blue-50/30 transition-colors">
                  {table.columns.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.type === "number" || c.type === "percent" ? "text-right tabular-nums font-medium text-slate-700" : "text-slate-600"}`}>
                      {fmt(c, r.data[c.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-l border-slate-100 px-4 py-3 font-medium text-slate-700">
                    {userName(r.assignee)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="sticky right-0 bg-white px-4 py-2 group-hover:bg-blue-50/30 transition-colors">
                    <div className="flex items-center justify-end gap-2">
                      {mine && <DecisionActions table={table.slug} id={r.id} label={label} />}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => { actions.remove(table.slug, r.id); toast.success("Kayıt silindi."); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
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
                    return <td key={c.key} className="px-4 py-4 text-right tabular-nums text-red-600">%{pct.toLocaleString("tr-TR", {maximumFractionDigits:1})}</td>;
                  }
                  if (c.key === "Durum") {
                    const acik = filtered.filter(r => r.data[c.key] === "Açık").length;
                    return <td key={c.key} className="px-4 py-4 text-left text-blue-600">{acik} Açık</td>;
                  }
                  return <td key={c.key} className="px-4 py-4 whitespace-nowrap text-slate-500">{i === 0 ? "GENEL TOPLAM" : ""}</td>;
                })}
                <td colSpan={3} className="px-4 py-4 bg-slate-50"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
