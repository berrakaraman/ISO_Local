// KPI paneli (ISO 9001 9.1): 6 gosterge, her birinin formulu, payi ve paydasi ekranda.
// Degerler backend'de kayitlardan hesaplanir (/api/panel/kpi); hedefler firma ayarindan (kpiHedefleri).
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/iso/PageHeader";
import { Alan, Bolum, Yukleniyor, girdi } from "@/components/iso/FormParcalari";
import { api, hataMesaji } from "@/lib/api";
import { sayi } from "@/lib/sozluk";
import { bugunStr, type Kpi } from "@/lib/kys";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/kpi")({ component: KpiPaneli });

const UYARI_ADI: Record<string, string> = {
  acikSikayet: "Açık müşteri şikâyeti",
  acikDof: "Açık DÖF",
  gecikenDof: "Termini geçen DÖF",
  gecmisKalibrasyon: "Kalibrasyonu geçmiş / kullanım dışı alet",
  suresiDolanEgitim: "Süresi dolan eğitim",
};

function KpiPaneli() {
  const [f, setF] = useState({ baslangic: bugunStr(-29), bitis: bugunStr() });
  const q = useQuery({
    queryKey: ["kpi", f],
    queryFn: () => api<Kpi>(`/panel/kpi?baslangic=${f.baslangic}&bitis=${f.bitis}`),
    enabled: !!f.baslangic && !!f.bitis && f.baslangic <= f.bitis,
  });
  const k = q.data;
  return (
    <div>
      <PageHeader eyebrow="Yönetim" title="Performans Göstergeleri" description="Kalite hedeflerinin gerçekleşmesi. Her değer kayıtlardan hesaplanır; formül ve sayılar aşağıda.">
        <div className="flex gap-3">
          <Alan etiket="Başlangıç">
            <input type="date" className={girdi} value={f.baslangic} max={f.bitis} onChange={(e) => setF({ ...f, baslangic: e.target.value })} />
          </Alan>
          <Alan etiket="Bitiş">
            <input type="date" className={girdi} value={f.bitis} min={f.baslangic} max={bugunStr()} onChange={(e) => setF({ ...f, bitis: e.target.value })} />
          </Alan>
        </div>
      </PageHeader>
      <div className="space-y-6 p-8">
        {q.isError && <p className="text-sm text-unity">{hataMesaji(q.error)}</p>}
        {!k ? (
          <Yukleniyor />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {k.gostergeler.map((g) => (
                <div key={g.ad} className={cn("rounded-xl border bg-white p-5", g.hedefte === false ? "border-unity/40" : "border-tas-200")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-tas-600">{g.baslik}</div>
                    {g.hedefte === null ? (
                      <span className="text-xs text-tas-400">veri yok</span>
                    ) : g.hedefte ? (
                      <CheckCircle2 className="h-5 w-5 text-uygun" />
                    ) : (
                      <XCircle className="h-5 w-5 text-unity" />
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={cn("sayi font-display text-4xl font-bold", g.hedefte === false ? "text-unity" : "text-murekkep")}>
                      {g.deger === null ? "–" : g.birim === "ppm" ? sayi(g.deger, 0) : `%${sayi(g.deger)}`}
                    </span>
                    <span className="text-xs text-tas-400">
                      hedef {g.yon === "yuksek" ? "≥" : "≤"} {g.birim === "ppm" ? `${sayi(g.hedef, 0)} ppm` : `%${sayi(g.hedef)}`}
                    </span>
                  </div>
                  <div className="mt-3 rounded-lg bg-tas-50 px-3 py-2 text-[11px] leading-relaxed text-tas-500">
                    <div>{g.formul}</div>
                    <div className="sayi mt-0.5 font-semibold text-tas-600">
                      {sayi(g.pay)} / {sayi(g.payda)}
                      {g.payda > 0 && ` = ${g.birim === "ppm" ? sayi(g.deger, 0) : `%${sayi(g.deger)}`}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Bolum baslik="Makine kullanılabilirliği nasıl hesaplandı">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-tas-100">
                    {[
                      ["Dönem (gün)", sayi(k.kullanilabilirlik.gun)],
                      ["Aktif makine", sayi(k.kullanilabilirlik.makineSayisi)],
                      ["Günlük planlı süre (vardiyalar)", `${sayi(k.kullanilabilirlik.gunlukPlanliDk)} dk`],
                      ["Planlı süre", `${sayi(k.kullanilabilirlik.planliDk, 0)} dk`],
                      ["Planlı bakım duruşu (bakım kayıtlarından)", `${sayi(k.kullanilabilirlik.planliDurusDk, 0)} dk`],
                      ["Arıza duruşu (arıza kayıtlarından)", `${sayi(k.kullanilabilirlik.plansizDurusDk, 0)} dk`],
                    ].map(([a, b]) => (
                      <tr key={a}>
                        <td className="py-1.5 text-tas-500">{a}</td>
                        <td className="sayi py-1.5 text-right font-semibold">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Bolum>
              <Bolum baslik={<><AlertTriangle className="h-4 w-4 text-dikkat" /> Açık konular</>}>
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(k.uyarilar).map(([a, n]) => (
                    <li key={a} className="flex justify-between">
                      <span className="text-tas-600">{UYARI_ADI[a] || a}</span>
                      <b className={cn("sayi", Number(n) > 0 ? "text-unity" : "text-uygun")}>{String(n)}</b>
                    </li>
                  ))}
                </ul>
              </Bolum>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
