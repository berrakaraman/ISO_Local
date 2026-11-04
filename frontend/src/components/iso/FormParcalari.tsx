// Formlarin ortak parcalari: alan, pencere basligi, bilgi kutulari, etiket listesi, "kim ne yapti" bolumu.
// Tum sayfalar ayni gorunsun diye tek yerde.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GitBranch, Loader2 } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiketOnizleme } from "@/components/barkod/Etiket";
import { api } from "@/lib/api";
import { tr } from "@/lib/sozluk";
import type { OnayDurum, OnayOzet } from "@/lib/onay";
import { cn } from "@/lib/utils";
import { KayitGecmisi, type GecmisSatiri } from "./KayitGecmisi";

export const girdi =
  "h-10 w-full rounded-lg border border-tas-300 bg-white px-3 text-sm text-murekkep outline-none transition placeholder:text-tas-400 focus:border-unity focus:ring-2 focus:ring-unity/15 disabled:bg-tas-50";

export function Alan({ etiket, ipucu, children, genis }: { etiket: string; ipucu?: string; children: ReactNode; genis?: boolean }) {
  return (
    <label className={cn("block space-y-1.5", genis && "sm:col-span-2")}>
      <span className="text-xs font-semibold uppercase tracking-wider text-tas-500">{etiket}</span>
      {children}
      {ipucu && <span className="block text-[11px] text-tas-400">{ipucu}</span>}
    </label>
  );
}

// Pencere ust kismi: kirmizi form kodu + italik baslik
export function PencereBasligi({ ust, baslik, aciklama, mono, ustuCizili, children }: {
  ust: string;
  baslik: ReactNode;
  aciklama?: ReactNode;
  mono?: boolean;
  ustuCizili?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-tas-200 px-6 pb-4 pt-5">
      <DialogHeader>
        <div className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-unity">{ust}</div>
        <DialogTitle
          className={cn(
            mono ? "font-mono text-2xl font-bold" : "font-display text-3xl font-bold italic",
            "text-murekkep",
            ustuCizili && "line-through decoration-unity",
          )}
        >
          {baslik}
        </DialogTitle>
        {aciklama && <DialogDescription>{aciklama}</DialogDescription>}
      </DialogHeader>
      {children && <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function AkisDugmesi({ barkod, etiket = "Akış diyagramı" }: { barkod: string; etiket?: string }) {
  return (
    <Link
      to="/izle/$barkod"
      params={{ barkod } as any}
      className="flex h-9 items-center gap-1.5 rounded-md bg-murekkep px-3 text-sm font-semibold text-white hover:bg-unity"
    >
      <GitBranch className="h-4 w-4" /> {etiket}
    </Link>
  );
}

export function BarkodLink({ barkod, className }: { barkod?: string | null; className?: string }) {
  if (!barkod) return <span className="text-tas-400">—</span>;
  return (
    <Link
      to="/izle/$barkod"
      params={{ barkod } as any}
      onClick={(e) => e.stopPropagation()}
      className={cn("font-mono text-xs font-semibold text-murekkep underline decoration-tas-300 underline-offset-4 hover:text-unity", className)}
    >
      {barkod}
    </Link>
  );
}

export function BilgiKutulari({ kutular }: { kutular: [string, ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kutular.map(([e, d]) => (
        <div key={e} className="rounded-lg border border-tas-200 p-3">
          <div className="text-[11px] uppercase tracking-wider text-tas-400">{e}</div>
          <div className="sayi font-display text-xl font-bold text-murekkep">{d}</div>
        </div>
      ))}
    </div>
  );
}

export function Bolum({ baslik, children, sag, className }: { baslik: ReactNode; children: ReactNode; sag?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-tas-200 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-lg font-bold text-murekkep">{baslik}</h3>
        {sag}
      </div>
      {children}
    </section>
  );
}

// Islem sonrasi basilan etiketler: barkodlar arasinda gezilir, secilen etiket buyuk gosterilir
export function EtiketListesi({ barkodlar, baslik = "Etiketleri basıp yapıştırın" }: { barkodlar: string[]; baslik?: string }) {
  const [secili, setSecili] = useState(barkodlar[0]);
  if (!barkodlar.length) return null;
  const gosterilen = barkodlar.includes(secili) ? secili : barkodlar[0];
  return (
    <div className="space-y-3 rounded-xl border border-uygun/30 bg-uygun-acik/50 p-4">
      <div className="text-sm font-semibold text-uygun">{baslik}</div>
      {barkodlar.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {barkodlar.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSecili(b)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition",
                gosterilen === b ? "border-murekkep bg-murekkep text-white" : "border-tas-200 bg-white text-tas-600 hover:border-unity hover:text-unity",
              )}
            >
              {b}
            </button>
          ))}
        </div>
      )}
      <EtiketOnizleme barkod={gosterilen} />
    </div>
  );
}

// "Kim ne yapti" bolumu: /api/gecmis/:tur/:no
export function KimNeYapti({ tur, no }: { tur: string; no: string }) {
  const g = useQuery({ queryKey: ["gecmis", tur, no], queryFn: () => api<GecmisSatiri[]>(`/gecmis/${tur}/${encodeURIComponent(no)}`) });
  return (
    <Bolum baslik="Kim ne yaptı">
      <KayitGecmisi satirlar={g.data} yukleniyor={g.isLoading} />
    </Bolum>
  );
}

// Kisi secimi (onaya gonderilecek sorumlu)
export function KisiSecimi({ kisiler, deger, onChange, etiket, ipucu }: {
  kisiler?: { id: string; adSoyad: string }[];
  deger: string;
  onChange: (v: string) => void;
  etiket: string;
  ipucu?: string;
}) {
  return (
    <Alan etiket={etiket} ipucu={ipucu}>
      <select className={girdi} value={deger} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Seçiniz</option>
        {kisiler?.map((k) => (
          <option key={k.id} value={k.id}>
            {tr(k.adSoyad)}
          </option>
        ))}
      </select>
    </Alan>
  );
}

export function Yukleniyor() {
  return <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-tas-400" />;
}

// Backend satirindaki onay* alanlarindan tablo icin onay ozeti
export function onayOzeti(r: {
  onayId?: string | null;
  onayDurum?: OnayDurum | null;
  onayAtananId?: string | null;
  onayAtananAd?: string | null;
  onayKararVerenAd?: string | null;
  onayKararZamani?: string | null;
  onayKararNotu?: string | null;
}): OnayOzet | null {
  return r.onayId && r.onayDurum && r.onayAtananId
    ? {
        id: r.onayId,
        durum: r.onayDurum,
        atananId: r.onayAtananId,
        atananAd: r.onayAtananAd ?? null,
        kararVerenAd: r.onayKararVerenAd,
        kararZamani: r.onayKararZamani,
        kararNotu: r.onayKararNotu,
      }
    : null;
}

// Durum rozeti (formun kendi karari olan sayfalar icin: karantina karari, son kontrol...)
export function DurumRozeti({ renk, children, alt }: { renk: "yesil" | "turuncu" | "kirmizi" | "gri" | "siyah"; children: ReactNode; alt?: ReactNode }) {
  const sinif = {
    yesil: "bg-uygun-acik text-uygun",
    turuncu: "bg-dikkat-acik text-dikkat",
    kirmizi: "bg-sorun-acik text-unity-koyu",
    gri: "bg-tas-100 text-tas-600",
    siyah: "bg-murekkep text-white",
  }[renk];
  return (
    <div>
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", sinif)}>{children}</span>
      {alt && <div className="mt-0.5 text-[11px] text-tas-400">{alt}</div>}
    </div>
  );
}

// Kucuk islem dugmesi (tablo satirinda)
export function SatirDugmesi({ onClick, children, vurgu, title }: { onClick: () => void; children: ReactNode; vurgu?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition",
        vurgu ? "bg-unity text-white hover:bg-unity-koyu" : "border border-tas-200 text-tas-600 hover:border-unity hover:text-unity",
      )}
    >
      {children}
    </button>
  );
}
