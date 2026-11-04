// Zaman cizelgesi: ne oldu, ne zaman oldu, kim yapti, hangi cihazdan. Eskiden yeniye.
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Factory,
  Monitor,
  PackagePlus,
  ShieldAlert,
  Tablet,
  Truck,
  Warehouse,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { durumAdi, gun, OLAY, olayAdi, saat, sayi, tr, type OlayKategori } from "@/lib/sozluk";

export type Olay = {
  id: number;
  zaman: string;
  tip: string;
  miktar: number | null;
  olcuBirimi: string | null;
  aciklama: string | null;
  veri: any;
  cihaz: string | null;
  barkod: string | null;
  karsiBarkod: string | null;
  isEmriNo: string | null;
  kullanici: string | null;
  sicilNo: string | null;
};

const KATEGORI: Record<OlayKategori, { ad: string; ikon: typeof Factory; renk: string }> = {
  giris: { ad: "Giriş", ikon: PackagePlus, renk: "bg-sky-600" },
  kalite: { ad: "Kalite", ikon: CheckCircle2, renk: "bg-uygun" },
  uretim: { ad: "Üretim", ikon: Factory, renk: "bg-murekkep" },
  karantina: { ad: "Karantina", ikon: ShieldAlert, renk: "bg-dikkat" },
  depo: { ad: "Depo", ikon: Warehouse, renk: "bg-tas-500" },
  sevk: { ad: "Sevkiyat", ikon: Truck, renk: "bg-violet-600" },
  uyari: { ad: "Hurda / bloke", ikon: AlertTriangle, renk: "bg-unity" },
  diger: { ad: "Diğer", ikon: Tag, renk: "bg-tas-400" },
};

// Olayi tek cumleyle anlatir
function anlat(o: Olay): React.ReactNode {
  const m = o.miktar != null ? `${sayi(o.miktar)} ${o.olcuBirimi || ""}`.trim() : "";
  const v = o.veri || {};
  switch (o.tip) {
    case "KABUL":
      return `${m} kabul edildi · ${tr(o.aciklama)}${v.coaVar ? " · analiz sertifikası (CoA) var" : ""}`;
    case "KONTROL_KARARI":
    case "SON_KONTROL":
    case "SIPARISE_AYIRMA":
      return `${durumAdi(v.eski)} → ${durumAdi(v.yeni)}${o.aciklama && o.tip === "SIPARISE_AYIRMA" ? ` · ${o.aciklama}` : ""}`;
    case "BOLME":
      return `${m} ayrılıp yeni barkod verildi: ${o.karsiBarkod}`;
    case "CEKIS":
    case "YUKLEME":
    case "TUKETIM":
    case "IADE":
      return `${m} · ${tr(o.aciklama)}`;
    case "IS_EMRI_ACILDI":
      return `Hedef ${m} · ${tr(o.aciklama)}`;
    case "IS_EMRI_DURUM":
      return `${durumAdi(v.eski)} → ${durumAdi(v.yeni)}`;
    case "ILK_PARCA":
      return (
        <span>
          {tr(o.aciklama)} (deneme {v.deneme})
          {Array.isArray(v.sonuclar) && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {v.sonuclar.map((s: any) => (
                <span
                  key={s.karakteristik}
                  className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", s.uygun ? "bg-uygun-acik text-uygun" : "bg-unity-acik text-unity-koyu")}
                >
                  {tr(s.karakteristik)}: {s.deger} <span className="opacity-60">({s.altSinir}–{s.ustSinir})</span>
                </span>
              ))}
            </span>
          )}
        </span>
      );
    case "URETIM":
      return `${m} üretildi`;
    case "KARANTINAYA_AYIRMA":
      return `${m} karantinaya ayrıldı · Neden: ${tr(o.aciklama)}`;
    case "KARANTINA_KARARI":
      return `Karar: ${durumAdi(v.yeni)}${v.yeniBarkod ? ` · yeni barkod ${v.yeniBarkod}` : ""}${o.aciklama ? ` · “${tr(o.aciklama)}”` : ""}`;
    case "KESIM":
      return `${m} ${tr(o.aciklama)} olarak kesildi${Array.isArray(v.parcalar) ? ` (${v.parcalar.join(" + ")} m)` : ""}${v.fire ? ` · fire ${v.fire} m` : ""}`;
    case "NUMUNE":
      return `${m} numune alındı · arşiv yeri ${o.aciklama}`;
    case "HURDA":
      return `${m} hurdaya ayrıldı · ${tr(o.aciklama)}`;
    case "YENIDEN_ETIKET":
      return `${m} yeni barkodla kullanıma döndü: ${o.karsiBarkod}`;
    case "BLOKE":
      return `Bloke · Neden: ${tr(o.aciklama)}`;
    case "BLOKE_KALDIRMA":
      return `Bloke kaldırıldı · ${tr(o.aciklama)}`;
    case "SEVKIYAT":
      return `${m} → ${tr(v.musteri)} · irsaliye ${v.irsaliyeNo || "-"} · ${v.sevkiyatNo}`;
    default:
      return [m, tr(o.aciklama)].filter(Boolean).join(" · ");
  }
}

export function ZamanCizelgesi({
  olaylar,
  odakBarkod,
  onBarkod,
}: {
  olaylar: Olay[];
  odakBarkod?: string;
  onBarkod?: (b: string) => void;
}) {
  const [yalnizOdak, setYalnizOdak] = useState(false);
  const [kategori, setKategori] = useState<OlayKategori | null>(null);

  const suzulmus = useMemo(
    () =>
      olaylar.filter(
        (o) =>
          (!yalnizOdak || o.barkod === odakBarkod || o.karsiBarkod === odakBarkod) &&
          (!kategori || OLAY[o.tip]?.kategori === kategori),
      ),
    [olaylar, yalnizOdak, kategori, odakBarkod],
  );

  const gunler = useMemo(() => {
    const m = new Map<string, Olay[]>();
    for (const o of suzulmus) {
      const k = new Date(o.zaman).toDateString();
      m.set(k, [...(m.get(k) || []), o]);
    }
    return [...m.values()];
  }, [suzulmus]);

  const sayac = useMemo(() => {
    const c: Partial<Record<OlayKategori, number>> = {};
    olaylar.forEach((o) => {
      const k = OLAY[o.tip]?.kategori || "diger";
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [olaylar]);

  return (
    <div className="rounded-2xl border border-tas-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-tas-200 px-5 py-3">
        <button
          onClick={() => setKategori(null)}
          className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", !kategori ? "bg-murekkep text-white" : "bg-tas-100 text-tas-600 hover:bg-tas-200")}
        >
          Tümü ({olaylar.length})
        </button>
        {(Object.keys(KATEGORI) as OlayKategori[])
          .filter((k) => sayac[k])
          .map((k) => (
            <button
              key={k}
              onClick={() => setKategori(kategori === k ? null : k)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition",
                kategori === k ? "bg-murekkep text-white" : "bg-tas-100 text-tas-600 hover:bg-tas-200",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", KATEGORI[k].renk)} />
              {KATEGORI[k].ad} ({sayac[k]})
            </button>
          ))}
        {odakBarkod && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-tas-600">
            <input type="checkbox" checked={yalnizOdak} onChange={(e) => setYalnizOdak(e.target.checked)} className="accent-unity" />
            Yalnızca <span className="font-mono font-semibold">{odakBarkod}</span>
          </label>
        )}
      </div>

      {gunler.length === 0 && <p className="px-5 py-10 text-center text-sm text-tas-400">Bu filtreye uyan kayıt yok.</p>}

      <div className="px-5 py-4">
        {gunler.map((liste) => (
          <section key={liste[0].id} className="mb-2">
            <h3 className="sticky top-0 z-10 -mx-1 mb-2 bg-white/95 px-1 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-tas-500 backdrop-blur">
              {gun(liste[0].zaman)}
            </h3>
            <ol className="relative ml-[76px] border-l-2 border-tas-100">
              {liste.map((o) => {
                const k = KATEGORI[OLAY[o.tip]?.kategori || "diger"];
                const Ikon = k.ikon;
                return (
                  <li key={o.id} className="relative pb-4 pl-6 last:pb-1">
                    <span className="sayi absolute -left-[78px] top-0.5 w-[60px] text-right font-mono text-[11px] text-tas-400">{saat(o.zaman)}</span>
                    <span className={cn("absolute -left-[11px] top-0 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white", k.renk)}>
                      <Ikon className="h-3 w-3 text-white" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-murekkep">{olayAdi(o.tip)}</span>
                      {o.barkod && (
                        <BarkodCipi b={o.barkod} vurgu={o.barkod === odakBarkod} onClick={onBarkod} />
                      )}
                      {o.karsiBarkod && (
                        <>
                          <ArrowRightLeft className="h-3 w-3 self-center text-tas-300" />
                          <BarkodCipi b={o.karsiBarkod} vurgu={o.karsiBarkod === odakBarkod} onClick={onBarkod} />
                        </>
                      )}
                      {!o.barkod && o.isEmriNo && <span className="font-mono text-[11px] text-tas-500">{o.isEmriNo}</span>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-tas-600">{anlat(o)}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-tas-400">
                      {o.cihaz === "kiosk" ? <Tablet className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                      {tr(o.kullanici) || "Sistem"}
                      {o.sicilNo && <span>· sicil {o.sicilNo}</span>}
                      <span>· {o.cihaz === "kiosk" ? "makine başı" : "bilgisayar"}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function BarkodCipi({ b, vurgu, onClick }: { b: string; vurgu?: boolean; onClick?: (b: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(b)}
      className={cn(
        "rounded px-1.5 py-px font-mono text-[11px] font-semibold transition",
        vurgu ? "bg-unity text-white" : "bg-tas-100 text-tas-600 hover:bg-tas-200 hover:text-murekkep",
      )}
    >
      {b}
    </button>
  );
}
