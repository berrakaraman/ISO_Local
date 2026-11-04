// Gercek backend'e bagli form tablosu (F-01 ... F-06 ortak).
// Sutunlar lib/iso-data.ts'deki TABLES tanimindan gelir; sona sistem sutunlari eklenir:
// Kaydeden, Sorumlu, Onay ve Islem (Akis, onay dugmeleri, Iptal).
// Hicbir kayit silinmez: iptal edilenler ustu cizili kalir.
// Arama kutusuna barkod okutulabilir: okuyucu yazip Enter'a basar, satir bulunur.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Ban, GitBranch, Loader2, ScanBarcode } from "lucide-react";
import type { TableDef } from "@/lib/iso-data";
import { fmt } from "@/lib/format";
import { tarihSaat, tr } from "@/lib/sozluk";
import { useOturum } from "@/lib/oturum";
import type { OnayOzet, OnayTuru } from "@/lib/onay";
import { barkodAyikla } from "@/components/izle/BarkodArama";
import { cn } from "@/lib/utils";
import { OnayRozeti } from "./StatusBadge";
import { OnayIslemleri, benimOnayim } from "./OnayIslemleri";

export type KayitSatiri = {
  anahtar: string; // kaydin numarasi (lot no, is emri no...)
  veri: Record<string, string | number | null | undefined>;
  baglantilar?: Record<string, string>; // sutun -> Urun Hikayesi'nde acilacak barkod/lot
  akis?: string; // akis diyagraminda acilacak barkod/lot
  barkodlar?: string[]; // okutulunca bu satiri bulduran barkodlar (ambalajlar vb.)
  kaydeden?: { ad?: string | null; zaman?: string | null };
  onay?: OnayOzet | null;
  iptal?: { ad?: string | null; zaman?: string | null; gerekce?: string | null } | null;
};

type Filtre = "hepsi" | "bende" | "iptal";

export function KayitTablosu({
  table,
  satirlar,
  onayTuru,
  yukleniyor,
  hata,
  araclar,
  onSatir,
  onIptal,
  iptalEdilebilir,
  ekIslem,
  sorumluHucre,
  onayHucre,
  bendeMi,
  onaySutunlariYok,
  bosMesaj,
}: {
  table: TableDef;
  satirlar: KayitSatiri[];
  onayTuru: OnayTuru;
  yukleniyor?: boolean;
  hata?: string | null;
  araclar?: ReactNode; // sag ustteki dugmeler (Yeni kayit)
  onSatir?: (s: KayitSatiri) => void;
  onIptal?: (s: KayitSatiri) => void;
  iptalEdilebilir?: (s: KayitSatiri) => boolean;
  ekIslem?: (s: KayitSatiri) => ReactNode; // satira ozel dugmeler (Kes, Karar ver, Okut...)
  sorumluHucre?: (s: KayitSatiri) => ReactNode; // onay yerine formun kendi karari varsa
  onayHucre?: (s: KayitSatiri) => ReactNode;
  bendeMi?: (s: KayitSatiri) => boolean; // "Onayimi bekleyen" sekmesi icin ozel kural
  onaySutunlariYok?: boolean; // rapor formlarinda (YP) Sorumlu/Onay sutunlari yok
  bosMesaj?: string;
}) {
  const oturum = useOturum();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("hepsi");
  const [isaretli, setIsaretli] = useState<string | null>(null);
  const satirRef = useRef<Record<string, HTMLTableRowElement | null>>({});

  const bende = (s: KayitSatiri) => !s.iptal && (bendeMi ? bendeMi(s) : benimOnayim(s.onay, oturum?.kullanici.id));
  const benim = satirlar.filter(bende).length;
  const iptalSayisi = satirlar.filter((s) => s.iptal).length;

  const filtreli = useMemo(() => {
    const ql = q.trim().toLocaleLowerCase("tr");
    return satirlar.filter((s) => {
      if (filtre === "bende" && !bende(s)) return false;
      if (filtre === "iptal" && !s.iptal) return false;
      if (!ql) return true;
      const metin = [
        ...Object.values(s.veri),
        ...(s.barkodlar || []),
        s.kaydeden?.ad,
        s.onay?.atananAd,
        s.onay?.kararVerenAd,
        s.iptal ? "iptal" : "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr");
      return metin.includes(ql);
    });
  }, [satirlar, q, filtre, oturum?.kullanici.id]);

  // Isaretlenen satira kaydir, bir sure sonra isareti kaldir
  useEffect(() => {
    if (!isaretli) return;
    satirRef.current[isaretli]?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setIsaretli(null), 2500);
    return () => clearTimeout(t);
  }, [isaretli]);

  // Okuyucu Enter gonderdiginde: barkod bu listedeyse satiri bul, degilse urun hikayesini ac
  const okut = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Okuyucunun Enter'i, acilan penceredeki bir dugmeye basilmis sayilmasin
    e.preventDefault();
    const b = barkodAyikla(q);
    if (!b) return;
    const bulunan = satirlar.find(
      (s) =>
        s.anahtar === b ||
        b.startsWith(`${s.anahtar}-`) || // lotun alt barkodu: RM-2610-0001-03 -> RM-2610-0001
        (s.barkodlar || []).includes(b) ||
        Object.values(s.baglantilar || {}).includes(b),
    );
    if (bulunan) {
      setQ("");
      setFiltre(bulunan.iptal ? "iptal" : "hepsi");
      setIsaretli(bulunan.anahtar);
      onSatir?.(bulunan);
    } else if (/^[A-Z]{2,3}-\d{4}-\d{4}/.test(b)) {
      nav({ to: "/izle/$barkod", params: { barkod: b } });
    }
  };

  const sagaYasli = (t?: string) => t === "number" || t === "percent";

  const Sekme = ({ deger, children, sayi }: { deger: Filtre; children: ReactNode; sayi?: number }) => (
    <button
      onClick={() => setFiltre(deger)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition",
        filtre === deger ? "bg-murekkep font-semibold text-white" : "text-tas-500 hover:bg-tas-100 hover:text-murekkep",
      )}
    >
      {children}
      {!!sayi && (
        <span className={cn("rounded-full px-1.5 text-[11px] font-bold", filtre === deger ? "bg-unity text-white" : "bg-tas-200 text-tas-600")}>
          {sayi}
        </span>
      )}
    </button>
  );

  const toplanacak = filtreli.filter((s) => !s.iptal);

  return (
    <div className="overflow-hidden rounded-xl border border-tas-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tas-200 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-tas-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={okut}
              spellCheck={false}
              autoComplete="off"
              placeholder="Ara ya da barkod okut…"
              aria-label="Ara ya da barkod okut"
              className="h-10 w-full rounded-lg border border-tas-300 bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-tas-400 focus:border-unity focus:ring-2 focus:ring-unity/15"
            />
          </div>
          <div className="flex items-center gap-1">
            <Sekme deger="hepsi">Tümü</Sekme>
            {!onaySutunlariYok && (
              <Sekme deger="bende" sayi={benim}>
                {bendeMi ? "Bende bekleyen" : "Onayımı bekleyen"}
              </Sekme>
            )}
            {(iptalSayisi > 0 || onIptal) && (
              <Sekme deger="iptal" sayi={iptalSayisi}>
                İptal edilenler
              </Sekme>
            )}
          </div>
        </div>
        {araclar}
      </div>

      {hata && <div className="border-b border-unity/20 bg-unity-acik px-4 py-3 text-sm text-unity-koyu">{hata}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tas-200 bg-tas-50 text-left text-[11px] font-bold uppercase tracking-wider text-tas-500">
              {table.columns.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3.5 py-3", sagaYasli(c.type) && "text-right")}>
                  {c.key}
                </th>
              ))}
              <th className="whitespace-nowrap border-l border-tas-200 px-4 py-3">Kaydeden</th>
              {!onaySutunlariYok && <th className="whitespace-nowrap px-4 py-3">Sorumlu</th>}
              {!onaySutunlariYok && <th className="whitespace-nowrap px-4 py-3">Onay</th>}
              <th className="sticky right-0 bg-tas-50 px-4 py-3 text-right shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.25)]">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tas-100">
            {yukleniyor && (
              <tr>
                <td colSpan={table.columns.length + (onaySutunlariYok ? 2 : 4)} className="px-4 py-10 text-center text-tas-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!yukleniyor && !filtreli.length && (
              <tr>
                <td colSpan={table.columns.length + (onaySutunlariYok ? 2 : 4)} className="px-4 py-10 text-center text-sm text-tas-400">
                  {q ? "Aramaya uyan kayıt yok." : filtre === "bende" ? "Onayınızı bekleyen kayıt yok." : bosMesaj || "Henüz kayıt yok."}
                </td>
              </tr>
            )}
            {filtreli.map((s) => {
              const iptal = !!s.iptal;
              return (
                <tr
                  key={s.anahtar}
                  ref={(el) => {
                    satirRef.current[s.anahtar] = el;
                  }}
                  onClick={() => onSatir?.(s)}
                  className={cn(
                    "group transition-colors",
                    onSatir && "cursor-pointer",
                    isaretli === s.anahtar ? "bg-unity-acik" : "hover:bg-tas-50",
                  )}
                >
                  {table.columns.map((c) => {
                    const hedef = s.baglantilar?.[c.key];
                    const deger = s.veri[c.key];
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap px-3.5 py-3",
                          sagaYasli(c.type) ? "sayi text-right font-medium text-murekkep" : "text-tas-600",
                          c.mono && "font-mono text-xs",
                          iptal && "text-tas-400 line-through decoration-tas-300",
                        )}
                      >
                        {hedef ? (
                          <Link
                            to="/izle/$barkod"
                            params={{ barkod: hedef }}
                            onClick={(e) => e.stopPropagation()}
                            title="Ürün hikâyesini aç"
                            className="font-mono text-xs font-semibold text-murekkep underline decoration-tas-300 underline-offset-4 hover:text-unity hover:decoration-unity"
                          >
                            {fmt(c, deger)}
                          </Link>
                        ) : (
                          fmt(c, deger)
                        )}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap border-l border-tas-100 px-4 py-2.5">
                    <div className="font-medium text-murekkep">{tr(s.kaydeden?.ad) || "—"}</div>
                    <div className="text-[11px] text-tas-400">{tarihSaat(s.kaydeden?.zaman)}</div>
                  </td>
                  {!onaySutunlariYok && (
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-murekkep">
                      {sorumluHucre ? sorumluHucre(s) : tr(s.onay?.atananAd) || "—"}
                    </td>
                  )}
                  {!onaySutunlariYok && (
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {iptal ? (
                      <div title={s.iptal?.gerekce ? `Gerekçe: ${s.iptal.gerekce}` : undefined}>
                        <span className="inline-flex items-center gap-1 rounded-full bg-murekkep px-2.5 py-0.5 text-xs font-semibold text-white">
                          <Ban className="h-3 w-3" /> İptal edildi
                        </span>
                        <div className="mt-0.5 text-[11px] text-tas-400">
                          {tr(s.iptal?.ad)} · {tarihSaat(s.iptal?.zaman)}
                        </div>
                      </div>
                    ) : onayHucre ? (
                      onayHucre(s)
                    ) : s.onay ? (
                      <div>
                        <OnayRozeti durum={s.onay.durum} />
                        {s.onay.kararVerenAd && (
                          <div className="mt-0.5 text-[11px] text-tas-400">
                            {tr(s.onay.kararVerenAd)} · {tarihSaat(s.onay.kararZamani)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-tas-400">Atanmadı</span>
                    )}
                  </td>
                  )}
                  <td
                    className={cn(
                      "sticky right-0 px-4 py-2 shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.25)] transition-colors",
                      isaretli === s.anahtar ? "bg-unity-acik" : "bg-white group-hover:bg-tas-50",
                    )}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      {!iptal && s.onay && <OnayIslemleri onay={s.onay} tur={onayTuru} kayitNo={s.anahtar} kucuk />}
                      {ekIslem?.(s)}
                      {s.akis && (
                        <Link
                          to="/izle/$barkod"
                          params={{ barkod: s.akis }}
                          onClick={(e) => e.stopPropagation()}
                          title="Akış diyagramı ve ürün hikâyesi"
                          className="flex h-8 items-center gap-1 rounded-md border border-tas-200 px-2.5 text-xs font-semibold text-tas-600 transition hover:border-unity hover:text-unity"
                        >
                          <GitBranch className="h-3.5 w-3.5" /> Akış
                        </Link>
                      )}
                      {!iptal && onIptal && (!iptalEdilebilir || iptalEdilebilir(s)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onIptal(s);
                          }}
                          title="İptal et (kayıt silinmez)"
                          aria-label="İptal et"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-tas-400 transition hover:bg-unity-acik hover:text-unity"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {toplanacak.length > 0 && (
            <tfoot className="border-t-2 border-tas-200 bg-tas-50 font-bold text-murekkep">
              <tr>
                {table.columns.map((c, i) => {
                  if (c.type === "number") {
                    const toplam = toplanacak.reduce((a, s) => a + (Number(s.veri[c.key]) || 0), 0);
                    return (
                      <td key={c.key} className="sayi px-4 py-3.5 text-right">
                        {toplam.toLocaleString("tr-TR")}
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="whitespace-nowrap px-4 py-3.5 font-display text-sm uppercase tracking-wider text-tas-500">
                      {i === 0 ? "Genel toplam" : ""}
                    </td>
                  );
                })}
                <td colSpan={onaySutunlariYok ? 1 : 3} className="whitespace-nowrap px-4 py-3.5 text-xs font-normal text-tas-400">
                  {toplanacak.length} kayıt{iptalSayisi ? ` · ${iptalSayisi} iptal toplama dahil değil` : ""}
                </td>
                <td className="sticky right-0 bg-tas-50 shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.25)]" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
