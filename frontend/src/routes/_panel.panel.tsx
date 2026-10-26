import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/iso/PageHeader";
import { useCurrentUser, useStore } from "@/lib/store";
import { Clock, PauseCircle, CheckCircle2, XCircle } from "lucide-react";
import { TABLES } from "@/lib/iso-data";

export const Route = createFileRoute("/_panel/panel")({ component: Dashboard });

function Dashboard() {
  const me = useCurrentUser()!;
  const store = useStore();
  
  let bekliyor = 0; let askida = 0; let onaylandi = 0; let reddedildi = 0;
  TABLES.forEach(t => {
     const rows = store.rows[t.slug] || [];
     rows.forEach(r => {
        if (r.assignee === me.id) {
           if(r.status === 'Bekliyor') bekliyor++;
           if(r.status === 'Askıda') askida++;
           if(r.status === 'Onaylandı') onaylandi++;
           if(r.status === 'Reddedildi') reddedildi++;
        }
     });
  });

  return (
    <div>
      <PageHeader eyebrow="KONTROL PANELİ" title={`Hoş geldiniz, ${me.name.split(" ")[0]}`} description="Size atanmış onay görevleri — bekleyen, askıda kalan ve tamamlanan işler." />
      <div className="p-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
           <div className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex justify-between items-center text-sm text-slate-500 mb-2"><span>Bekliyor</span><Clock className="w-4 h-4 text-blue-500" /></div><div className="text-3xl font-bold">{bekliyor}</div></div>
           <div className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex justify-between items-center text-sm text-slate-500 mb-2"><span>Askıda</span><PauseCircle className="w-4 h-4 text-orange-500" /></div><div className="text-3xl font-bold">{askida}</div></div>
           <div className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex justify-between items-center text-sm text-slate-500 mb-2"><span>Onaylandı</span><CheckCircle2 className="w-4 h-4 text-green-500" /></div><div className="text-3xl font-bold">{onaylandi}</div></div>
           <div className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex justify-between items-center text-sm text-slate-500 mb-2"><span>Reddedildi</span><XCircle className="w-4 h-4 text-red-500" /></div><div className="text-3xl font-bold">{reddedildi}</div></div>
        </div>
      </div>
    </div>
  );
}
