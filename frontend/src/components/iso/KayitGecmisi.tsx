// "Kim ne yapti": bir kaydin tum gecmisi, isim isim ve saat saat.
// Kaynaklar: degisiklik izi (kayit, onay, iptal) + olay gunlugu (etiket, kontrol, cekis...).
import { Link } from "@tanstack/react-router";
import { Monitor, Tablet } from "lucide-react";
import { durumAdi, olayAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { ONAY_ADI, type OnayDurum } from "@/lib/onay";
import { cn } from "@/lib/utils";

export type GecmisSatiri = {
  zaman: string;
  kaynak: "IZ" | "OLAY";
  tablo: string | null;
  islem: string | null;
  alan: string | null;
  eskiDeger: string | null;
  yeniDeger: string | null;
  gerekce: string | null;
  tip: string | null;
  barkod: string | null;
  miktar: number | null;
  olcuBirimi: string | null;
  aciklama: string | null;
  kim: string | null;
  sicilNo: string | null;
  cihaz: string | null;
};

type Madde = {
  zaman: string;
  kim: string | null;
  sicil: string | null;
  cihaz: string | null;
  baslik: string;
  ayrinti: string[];
  barkod?: string | null;
  vurgu?: "uygun" | "dikkat" | "sorun";
};

const onayAdi = (d?: string | null) => (d ? ONAY_ADI[d as OnayDurum] || d : "");

// Ayni kisinin ayni anda yaptigi degisiklik satirlarini tek maddede toplar
function maddele(satirlar: GecmisSatiri[]): Madde[] {
  const sonuc: Madde[] = [];
  for (const s of satirlar) {
    if (s.kaynak === "OLAY") {
      // Ayni kisinin ayni anda bircok parcaya yaptigi ayni islem (ornek: 10 parcaya son kontrol) tek madde olsun
      const son = sonuc[sonuc.length - 1] as (Madde & { _o?: string; _n?: number }) | undefined;
      const anahtar = `${s.tip}|${s.kim}|${s.aciklama || ""}`;
      if (son && son._o === anahtar && Math.abs(new Date(son.zaman).getTime() - new Date(s.zaman).getTime()) < 3000) {
        son._n = (son._n || 1) + 1;
        son.ayrinti = [`Toplam ${son._n} barkod (ilki gösteriliyor)`];
        continue;
      }
      const parca = [s.miktar !== null ? `${sayi(s.miktar)} ${s.olcuBirimi || ""}`.trim() : "", tr(s.aciklama)].filter(Boolean);
      sonuc.push({
        zaman: s.zaman, kim: s.kim, sicil: s.sicilNo, cihaz: s.cihaz, barkod: s.barkod,
        baslik: olayAdi(s.tip || ""), ayrinti: parca.length ? [parca.join(" · ")] : [],
        vurgu: s.tip === "IPTAL" || s.tip === "HURDA" ? "sorun" : undefined,
        _o: `${s.tip}|${s.kim}|${s.aciklama || ""}`,
      } as Madde);
      continue;
    }
    const onceki = sonuc[sonuc.length - 1];
    const grupAnahtari = `${s.tablo}|${s.islem}|${s.kim}`;
    const ayniGrup =
      onceki && (onceki as any)._g === grupAnahtari && Math.abs(new Date(onceki.zaman).getTime() - new Date(s.zaman).getTime()) < 3000;

    let baslik = "";
    let satir = "";
    let vurgu: Madde["vurgu"];
    if (s.tablo !== "onay" && s.islem === "EKLEME") {
      baslik = "Kaydı oluşturdu";
      satir = tr(s.yeniDeger);
    } else if ((s.tablo === "is_emri" || s.tablo === "sevkiyat") && s.islem === "DURUM") {
      baslik = `Durum: ${durumAdi(s.yeniDeger)}`;
      satir = `${durumAdi(s.eskiDeger)} → ${durumAdi(s.yeniDeger)}`;
      vurgu = s.yeniDeger === "TAMAMLANDI" || s.yeniDeger === "SEVK_EDILDI" ? "uygun" : undefined;
    } else if (s.tablo === "birim" && s.alan === "bloke") {
      baslik = s.yeniDeger === "true" ? "Bloke etti" : "Blokeyi kaldırdı";
      vurgu = s.yeniDeger === "true" ? "dikkat" : "uygun";
    } else if (s.tablo === "lot" && s.islem === "DURUM") {
      baslik = `Giriş kontrolü: ${durumAdi(s.yeniDeger)}`;
      vurgu = s.yeniDeger === "KABUL" ? "uygun" : s.yeniDeger === "RET" ? "sorun" : "dikkat";
    } else if (s.islem === "IPTAL") {
      baslik = "Kaydı iptal etti";
      vurgu = "sorun";
    } else if (s.tablo === "onay" && s.islem === "EKLEME") {
      baslik = "Onaya gönderdi";
      if (s.alan === "atanan") satir = `Sorumlu: ${tr(s.yeniDeger)}`;
    } else if (s.tablo === "onay" && s.islem === "DURUM") {
      baslik = `Onay kararı: ${onayAdi(s.yeniDeger)}`;
      satir = `${onayAdi(s.eskiDeger)} → ${onayAdi(s.yeniDeger)}`;
      vurgu = s.yeniDeger === "ONAYLANDI" ? "uygun" : s.yeniDeger === "REDDEDILDI" ? "sorun" : "dikkat";
    } else {
      baslik = `${s.alan}: ${tr(s.eskiDeger) || "–"} → ${tr(s.yeniDeger) || "–"}`;
    }

    if (ayniGrup) {
      if (satir) onceki.ayrinti.push(satir);
      continue;
    }
    const m: Madde & { _g?: string } = {
      zaman: s.zaman, kim: s.kim, sicil: s.sicilNo, cihaz: s.cihaz, baslik,
      ayrinti: [satir, s.gerekce ? `Gerekçe: ${tr(s.gerekce)}` : ""].filter(Boolean), vurgu,
    };
    m._g = grupAnahtari;
    sonuc.push(m);
  }
  return sonuc;
}

const NOKTA = { uygun: "bg-uygun", dikkat: "bg-dikkat", sorun: "bg-unity" };

export function KayitGecmisi({ satirlar, yukleniyor }: { satirlar?: GecmisSatiri[]; yukleniyor?: boolean }) {
  if (yukleniyor) return <div className="h-24 animate-pulse rounded-lg bg-tas-100" />;
  const maddeler = maddele(satirlar || []);
  if (!maddeler.length) return <p className="text-sm text-tas-400">Henüz hareket yok.</p>;
  return (
    <ol className="relative space-y-0 border-l border-tas-200 pl-5">
      {maddeler.map((m, i) => {
        const Cihaz = m.cihaz === "kiosk" ? Tablet : Monitor;
        return (
          <li key={i} className="relative pb-4 last:pb-0">
            <span className={cn("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", m.vurgu ? NOKTA[m.vurgu] : "bg-tas-300")} />
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold text-murekkep">{m.baslik}</span>
              {m.barkod && (
                <Link to="/izle/$barkod" params={{ barkod: m.barkod }} className="font-mono text-xs font-semibold text-tas-500 hover:text-unity">
                  {m.barkod}
                </Link>
              )}
            </div>
            {m.ayrinti.map((a, j) => (
              <div key={j} className="text-xs text-tas-500">
                {a}
              </div>
            ))}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-tas-400">
              <span className="whitespace-nowrap font-semibold text-tas-600">{tr(m.kim) || "Sistem"}</span>
              {m.sicil && <span className="whitespace-nowrap">· sicil {m.sicil}</span>}
              <span className="whitespace-nowrap">· {tarihSaat(m.zaman)}</span>
              <Cihaz className="h-3 w-3" aria-label={m.cihaz === "kiosk" ? "Makine başı" : "Bilgisayar"} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
