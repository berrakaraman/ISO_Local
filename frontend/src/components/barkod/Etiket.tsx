// Etiket onizlemesi: termal yazicinin basacagi etiketin ekrandaki birebir karsiligi.
// Ust: urun bilgisi, alt: Code 128 barkod (el terminali okur), sag: QR (telefon kamerasi okur).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Loader2, QrCode, ScanBarcode, Smartphone } from "lucide-react";
import qrcode from "@/lib/qrcode.js";
import { code128 } from "@/lib/code128";
import { api, hataMesaji } from "@/lib/api";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/sozluk";

export function Barkod128({ deger, className, yukseklik = 60 }: { deger: string; className?: string; yukseklik?: number }) {
  const { cubuklar, genislik } = useMemo(() => code128(deger), [deger]);
  return (
    <svg viewBox={`0 0 ${genislik} ${yukseklik}`} preserveAspectRatio="none" className={className} role="img" aria-label={`Barkod ${deger}`}>
      <rect width={genislik} height={yukseklik} fill="#fff" />
      {cubuklar.map(([x, w], i) => (
        <rect key={i} x={x} width={w} height={yukseklik} fill="#000" />
      ))}
    </svg>
  );
}

export function QRKod({ deger, className }: { deger: string; className?: string }) {
  const { n, yol } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(deger);
    q.make();
    const n = q.getModuleCount();
    let yol = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) yol += `M${c + 2},${r + 2}h1v1h-1z`;
    return { n, yol };
  }, [deger]);
  return (
    <svg viewBox={`0 0 ${n + 4} ${n + 4}`} className={className} shapeRendering="crispEdges" role="img" aria-label="QR kod">
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={yol} fill="#000" />
    </svg>
  );
}

type EtiketCevabi = { barkod: string; tip: string; zpl: string; veri: Record<string, any> };

const tarih = (s?: string) => (s ? new Date(s).toLocaleDateString("tr-TR") : "-");
const tarihSaat = (s?: string) =>
  s ? new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

// Backend'deki zplUret() ile ayni satirlar
function satirlar(v: Record<string, any>): { baslik: string; vurgulu?: boolean; satirlar: string[]; kucuk?: boolean } {
  switch (v.tip) {
    case "RM":
      return {
        baslik: `${v.malzemeKod} ${v.malzemeAd}`,
        satirlar: [
          `Tedarikçi: ${v.tedarikci || "-"}`,
          `Tedarikçi lot: ${v.tedarikciLot || "-"}`,
          `Miktar: ${v.ilkMiktar} ${v.olcuBirimi}`,
          `Kabul: ${tarih(v.olusturmaZamani)}`,
        ],
      };
    case "FG_LOT":
      return {
        baslik: `${v.urunKod} ${tr(v.urunAd)}`,
        satirlar: [
          `Makine: ${v.makineKod || "-"}   Operatör: ${v.operatorSicil || "-"}`,
          `Metraj: ${v.ilkMiktar} ${v.olcuBirimi}`,
          `Üretim: ${tarihSaat(v.olusturmaZamani)}`,
          `İş emri: ${v.isEmriNo || "-"}`,
        ],
      };
    case "FG":
      return {
        baslik: `${v.urunKod} ${tr(v.urunAd)}`,
        satirlar: [
          `Lot: ${v.lotNo}   Parça ${v.sira}${v.lotParcaSayisi ? ` / ${v.lotParcaSayisi}` : ""}`,
          `Boy: ${v.ilkMiktar} ${v.olcuBirimi}`,
          `Tarih: ${tarihSaat(v.olusturmaZamani)}`,
        ],
      };
    case "KR":
      return {
        baslik: "KARANTİNA",
        vurgulu: true,
        satirlar: [
          `Neden: ${v.ek?.hataKodu || ""} ${tr(v.ek?.hataAciklama || "")}`,
          `Miktar: ${v.ilkMiktar} ${v.olcuBirimi}`,
          `İş emri: ${v.isEmriNo || "-"}   Makine: ${v.makineKod || "-"}`,
          `${tarihSaat(v.olusturmaZamani)}   Operatör: ${v.operatorSicil || "-"}`,
        ],
      };
    case "NM":
      return { baslik: "", kucuk: true, satirlar: [`${v.urunKod} - Lot ${v.lotNo}`, `İmha: ${v.ek?.imhaTarihi || "-"}`] };
    default:
      return { baslik: "", kucuk: true, satirlar: [tr(v.malzemeAd || v.urunAd || ""), tarih(v.olusturmaZamani)] };
  }
}

export function EtiketOnizleme({ barkod }: { barkod: string }) {
  const s = useQuery({ queryKey: ["etiket", barkod], queryFn: () => api<EtiketCevabi>(`/birimler/${encodeURIComponent(barkod)}/etiket`) });
  const [zplAcik, setZplAcik] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  if (s.isLoading) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-tas-400" />;
  if (s.isError || !s.data) return <p className="text-sm text-unity">{hataMesaji(s.error, "Etiket yüklenemedi.")}</p>;

  const { veri, zpl } = s.data;
  const qrAdresi = /\^FDQA,([^^]+)\^FS/.exec(zpl)?.[1] || `${location.origin}/b/${barkod}`;
  const e = satirlar(veri);

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(zpl);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1500);
    } catch {
      /* yok say */
    }
  };

  return (
    <div className="space-y-5">
      {/* Etiketin kendisi: 100 x 50 mm (numune 50 x 25 mm) */}
      <div className="rounded-xl bg-tas-100 p-4 sm:p-6">
        <div
          className={cn(
            "mx-auto flex flex-col bg-white font-sans text-black shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/10",
            e.kucuk ? "aspect-[2/1] max-w-[280px] p-3" : "aspect-[2/1] max-w-[520px]",
          )}
        >
          {e.kucuk ? (
            <>
              <div className="font-mono text-[15px] font-bold">{veri.barkod}</div>
              {e.satirlar.map((x) => (
                <div key={x} className="text-[11px] leading-tight">
                  {x}
                </div>
              ))}
              <Barkod128 deger={veri.barkod} className="mt-auto h-[40%] w-full" />
            </>
          ) : (
            <>
              {e.vurgulu ? (
                <div className="bg-black px-[3.5%] py-[1.5%] font-display text-[clamp(18px,4.5vw,28px)] font-bold tracking-wide text-white">{e.baslik}</div>
              ) : (
                <div className="truncate px-[3.5%] pt-[3%] text-[clamp(13px,3vw,19px)] font-bold leading-tight">{e.baslik}</div>
              )}
              <div className="flex flex-1 gap-[3%] px-[3.5%] pt-[1%]">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[clamp(10px,2vw,13px)] font-semibold">{veri.barkod}</div>
                  <div className="mt-[2%] space-y-[1px]">
                    {e.satirlar.map((x) => (
                      <div key={x} className="truncate text-[clamp(9px,1.9vw,12px)] leading-snug">
                        {x}
                      </div>
                    ))}
                  </div>
                </div>
                <QRKod deger={qrAdresi} className="aspect-square h-auto w-[24%] shrink-0 self-start" />
              </div>
              <div className="px-[3.5%] pb-[3%]">
                <Barkod128 deger={veri.barkod} className="h-[clamp(34px,8vw,52px)] w-[64%]" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ne ise yarar */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-tas-200 bg-white p-4">
          <div className="flex items-center gap-2 font-semibold text-murekkep">
            <ScanBarcode className="h-4 w-4 text-unity" /> Çizgili barkod (Code 128)
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tas-500">
            Fabrikada el terminali ve makine başındaki okuyucu bunu okur: depodan çekiş, makineye yükleme, kesim,
            karantina ve sevkiyat bu barkod okutularak yapılır. İçinde yalnızca <b className="font-mono text-murekkep">{veri.barkod}</b> numarası
            vardır; bilgilerin hepsi sistemde durur.
          </p>
        </div>
        <div className="rounded-xl border border-tas-200 bg-white p-4">
          <div className="flex items-center gap-2 font-semibold text-murekkep">
            <QrCode className="h-4 w-4 text-unity" /> QR kod
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tas-500">
            Telefon kamerasıyla okutulunca bu ürünün hikâye sayfası açılır (giriş yapmış kişi için). Kalite, yönetim
            ya da denetçi el terminali olmadan ürünün geçmişini görebilir.
          </p>
          <div className="mt-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-tas-400">
            <Smartphone className="h-3.5 w-3.5 shrink-0" /> {qrAdresi}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-tas-200 bg-white">
        <button
          onClick={() => setZplAcik((x) => !x)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-murekkep"
        >
          Yazıcıya giden komut (ZPL)
          <span className="text-xs font-normal text-tas-400">{zplAcik ? "Gizle" : "Göster"}</span>
        </button>
        {zplAcik && (
          <div className="border-t border-tas-200 p-4">
            <p className="mb-2 text-xs text-tas-500">
              Zebra uyumlu termal etiket yazıcıları bu metni doğrudan basar. Barkodu ve QR'ı yazıcının kendisi çizer.
            </p>
            <div className="relative">
              <pre className="max-h-56 overflow-auto rounded-lg bg-gece p-3 font-mono text-[11px] leading-relaxed text-white/80">{zpl}</pre>
              <button
                onClick={kopyala}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20"
              >
                {kopyalandi ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {kopyalandi ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
