// YP Uretim Ozeti: her uretim lotunun miktar dokumu ve donem toplamlari (rapor; kayit girilmez).
// Rakamlar F-03 ile ayni hesaptan gelir. Satira tiklayinca lotun F-03 kaydi acilir.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import { DurumRozeti } from "@/components/iso/FormParcalari";
import { getTable } from "@/lib/iso-data";
import { api, hataMesaji } from "@/lib/api";
import { lotHesap, type LotSatiri } from "@/lib/lot";
import { sayi } from "@/lib/sozluk";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/yonetim-paneli")({ component: UretimOzeti });

type Donem = "bugun" | "hafta" | "ay" | "hepsi";
const DONEMLER: [Donem, string][] = [["bugun", "Bugün"], ["hafta", "Son 7 gün"], ["ay", "Son 30 gün"], ["hepsi", "Tümü"]];

function baslangic(d: Donem) {
  const t = new Date();
  if (d === "bugun") return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  if (d === "hafta") return t.getTime() - 7 * 864e5;
  if (d === "ay") return t.getTime() - 30 * 864e5;
  return 0;
}

function UretimOzeti() {
  const table = getTable("yonetim-paneli")!;
  const nav = useNavigate();
  const [donem, setDonem] = useState<Donem>("hafta");
  const liste = useQuery({ queryKey: ["lotlar"], queryFn: () => api<LotSatiri[]>("/lotlar"), refetchInterval: 30_000 });

  const lotlar = useMemo(() => (liste.data || []).filter((l) => new Date(l.bitis).getTime() >= baslangic(donem)), [liste.data, donem]);
  const toplam = useMemo(() => {
    const t = { uretim: 0, uygun: 0, karantina: 0, red: 0, acik: 0 };
    for (const l of lotlar) {
      const h = lotHesap(l);
      t.uretim += h.toplam;
      t.uygun += Number(l.uygun);
      t.karantina += Number(l.karantinaBekleyen);
      t.red += h.redHurda;
      if (h.acik) t.acik++;
    }
    return { ...t, fire: t.uretim ? (t.karantina + t.red) / t.uretim : 0 };
  }, [lotlar]);

  const satirlar: KayitSatiri[] = lotlar.map((l) => {
    const h = lotHesap(l);
    return {
      anahtar: l.no,
      veri: {
        Tarih: l.bitis,
        Makine: l.makineKod,
        "Lot No": l.no,
        "Ürün Kodu": l.urunKod,
        "Üretim Miktarı": h.toplam,
        Uygun: l.uygun,
        Karantina: l.karantinaBekleyen,
        "Red/Hurda": h.redHurda,
        "Fire %": h.fire,
        Durum: h.acik ? `Açık · ${h.durum}` : "Kapatıldı",
      },
      baglantilar: { "Lot No": l.no },
      akis: l.no,
      kaydeden: { ad: l.operatorAd, zaman: l.bitis },
    };
  });

  const kart = (etiket: string, deger: string, vurgu?: boolean) => (
    <div className="relative overflow-hidden rounded-xl border border-tas-200 bg-white p-5">
      {vurgu && <span className="absolute left-0 top-0 h-full w-1 bg-unity" />}
      <div className="text-sm text-tas-500">{etiket}</div>
      <div className="sayi mt-1 font-display text-3xl font-bold text-murekkep">{deger}</div>
    </div>
  );

  return (
    <div className="animate-belir">
      <PageHeader eyebrow={table.code} title={table.title} description={table.description}>
        <div className="flex rounded-lg bg-tas-100 p-1">
          {DONEMLER.map(([k, e]) => (
            <button key={k} onClick={() => setDonem(k)} className={cn("rounded-md px-3 py-1.5 text-sm transition", donem === k ? "bg-white font-semibold text-murekkep shadow-sm" : "text-tas-500 hover:text-murekkep")}>
              {e}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="space-y-6 p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {kart("Üretim", `${sayi(toplam.uretim)} m`)}
          {kart("Uygun", `${sayi(toplam.uygun)} m`)}
          {kart("Karantinada", `${sayi(toplam.karantina)} m`, toplam.karantina > 0)}
          {kart("Red / hurda", `${sayi(toplam.red)} m`, toplam.red > 0)}
          {kart("Fire", `%${sayi(toplam.fire * 100, 1)}`, toplam.fire > 0.03)}
        </div>
        <KayitTablosu
          table={table}
          satirlar={satirlar}
          onayTuru="URETIM_OZETI"
          onaySutunlariYok
          yukleniyor={liste.isLoading}
          hata={liste.isError ? hataMesaji(liste.error, "Liste yüklenemedi.") : null}
          bosMesaj="Bu dönemde üretim lotu yok."
          onSatir={(s) => nav({ to: "/tablo/uretim-lot" as any, search: { ac: s.anahtar } as any })}
          araclar={<DurumRozeti renk={toplam.acik ? "turuncu" : "yesil"}>{toplam.acik} açık lot · {lotlar.length - toplam.acik} kapatıldı</DurumRozeti>}
        />
      </div>
    </div>
  );
}
