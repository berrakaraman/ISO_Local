// Makineler: fabrika yerlesim plani. Her makinede o an calisan is emri ve URUN gorunur (durum rengiyle).
// Makineye sistemden hukmedilmez; durum is emrinden gelir (uretimde / ilk parca bekliyor / duraklatildi / bos).
// Makine karti: su anki is, bakim / ariza kayitlari (elle girilen), son is emirleri, son 7 gun kullanilabilirlik.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/iso/PageHeader";
import { BilgiKutulari, Bolum, Yukleniyor } from "@/components/iso/FormParcalari";
import { Tablo } from "@/components/iso/Islem";
import { api } from "@/lib/api";
import { durumAdi, sayi, tr } from "@/lib/sozluk";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/makineler")({ component: Makineler });

type MakineOzet = {
  id: string; kod: string; ad: string; tip: string; planX: number | null; planY: number | null;
  isEmriNo: string | null; isEmriDurumu: string | null; hedefMiktar: number | null; urunKod: string | null; urunAd: string | null;
  uretilen: number; bugunKarantina: number; durum: "CALISIYOR" | "ILK_PARCA" | "DURUYOR" | "BOS";
};

const RENK: Record<MakineOzet["durum"], string> = {
  CALISIYOR: "bg-uygun text-white",
  ILK_PARCA: "bg-dikkat text-white",
  DURUYOR: "bg-dikkat-acik text-dikkat border border-dikkat/40",
  BOS: "bg-white text-tas-500 border border-tas-300",
};
const DURUM_ADI: Record<MakineOzet["durum"], string> = { CALISIYOR: "Üretimde", ILK_PARCA: "İlk parça bekliyor", DURUYOR: "Duraklatıldı", BOS: "Boş" };

function Makineler() {
  const liste = useQuery({ queryKey: ["panel", "makineler"], queryFn: () => api<MakineOzet[]>("/panel/makineler"), refetchInterval: 20_000 });
  const [secili, setSecili] = useState<string | null>(null);
  const yerlesik = (liste.data || []).filter((m) => m.planX !== null && m.planY !== null);
  const yersiz = (liste.data || []).filter((m) => m.planX === null || m.planY === null);
  return (
    <div>
      <PageHeader eyebrow="Üretim" title="Makineler" description="Yerleşim planı: her makinede o an çalışan iş emri ve ürün. Ekran 20 saniyede bir yenilenir." />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(RENK) as MakineOzet["durum"][]).map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              <span className={cn("inline-block h-3 w-5 rounded", RENK[d])} /> {DURUM_ADI[d]} ({(liste.data || []).filter((m) => m.durum === d).length})
            </span>
          ))}
        </div>
        {!liste.data ? (
          <Yukleniyor />
        ) : (
          <div className="relative h-[420px] overflow-hidden rounded-xl border border-tas-200 bg-[linear-gradient(0deg,transparent_24px,#eceae6_25px),linear-gradient(90deg,transparent_24px,#eceae6_25px)] bg-[size:25px_25px]">
            {yerlesik.map((m) => (
              <button
                key={m.kod}
                type="button"
                onClick={() => setSecili(m.kod)}
                title={`${m.kod} · ${DURUM_ADI[m.durum]}${m.isEmriNo ? ` · ${m.isEmriNo} · ${m.urunKod}` : ""}`}
                style={{ left: `${m.planX}%`, top: `${m.planY}%` }}
                className={cn(
                  "absolute flex h-[70px] w-[8%] min-w-[76px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md px-1 text-xs font-bold leading-tight shadow-sm transition hover:scale-105",
                  RENK[m.durum],
                  secili === m.kod && "ring-2 ring-murekkep ring-offset-2",
                )}
              >
                <span className="font-mono">{m.kod}</span>
                {m.isEmriNo ? (
                  <>
                    <span className="max-w-full truncate text-[10px] font-semibold">{m.urunKod}</span>
                    <span className="text-[10px] font-medium opacity-80">{sayi(m.uretilen, 0)}/{sayi(m.hedefMiktar, 0)}</span>
                  </>
                ) : (
                  <span className="text-[10px] font-medium opacity-80">boş</span>
                )}
              </button>
            ))}
          </div>
        )}
        {yersiz.length > 0 && (
          <p className="text-xs text-tas-500">
            Planda yeri olmayan makineler: {yersiz.map((m) => <button key={m.kod} className="mx-1 font-mono underline" onClick={() => setSecili(m.kod)}>{m.kod}</button>)} (Tanımlar → Makineler'de Plan X / Plan Y girin, 0–100).
          </p>
        )}
        {secili && <MakineKarti kod={secili} />}
      </div>
    </div>
  );
}

function MakineKarti({ kod }: { kod: string }) {
  const k = useQuery({ queryKey: ["panel", "makine", kod], queryFn: () => api<any>(`/panel/makineler/${kod}`), refetchInterval: 20_000 });
  if (!k.data) return <Yukleniyor />;
  const d = k.data;
  const s7 = d.son7Gun;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <Bolum baslik={<><span className="font-mono">{d.makine.kod}</span> · {tr(d.makine.ad)}</>} sag={<span className="text-xs text-tas-500">{d.makine.tip}</span>}>
          <BilgiKutulari
            kutular={[
              ["Şu anki iş", d.isEmri ? `${d.isEmri.no} (${durumAdi(d.isEmri.durum)})` : "—"],
              ["Ürün", d.isEmri ? `${d.isEmri.urunKod} ${tr(d.isEmri.urunAd)}` : "—"],
              ["Üretilen / hedef", d.isEmri ? `${sayi(d.isEmri.uretilen, 0)} / ${sayi(d.isEmri.hedefMiktar, 0)}` : "—"],
              ["7 gün kullanılabilirlik", s7.deger === null ? "–" : `%${sayi(s7.deger)}`],
            ]}
          />
          <p className="mt-3 text-[11px] text-tas-400">
            Son 7 gün: planlı {sayi(s7.planliDk, 0)} dk − planlı bakım {sayi(s7.planliDurusDk, 0)} dk − arıza {sayi(s7.plansizDurusDk, 0)} dk (bakım / arıza kayıtlarından).
          </p>
        </Bolum>
        <Bolum baslik="Bakım ve arıza kayıtları">
          <Tablo<any> satirlar={d.bakimlar} anahtar={(r) => r.id} bos="Kayıt yok. KYS Kayıtları → Bakım / arıza'dan girilir." sutunlar={[
            { baslik: "Tarih", hucre: (r) => r.tarih },
            { baslik: "Tür", hucre: (r) => (r.tur === "ARIZA" ? "Arıza" : "Planlı bakım") },
            { baslik: "Arıza / yapılan", hucre: (r) => <>{r.ariza && <div className="font-semibold">{tr(r.ariza)}</div>}<div>{tr(r.yapilan)}</div></> },
            { baslik: "Duruş", sag: true, hucre: (r) => `${sayi(r.durusDk, 0)} dk` },
          ]} />
        </Bolum>
      </div>
      <Bolum baslik="Son iş emirleri">
        <Tablo<any> satirlar={d.isEmirleri} anahtar={(r) => r.no} sutunlar={[
          { baslik: "No", hucre: (r) => <span className="font-mono text-xs">{r.no}</span> },
          { baslik: "Ürün", hucre: (r) => r.urunKod },
          { baslik: "Hedef", sag: true, hucre: (r) => sayi(r.hedefMiktar, 0) },
          { baslik: "Durum", hucre: (r) => durumAdi(r.durum) },
        ]} />
      </Bolum>
    </div>
  );
}
