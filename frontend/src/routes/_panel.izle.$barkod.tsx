// Urun hikayesi: okutulan barkodun basina gelen her sey.
// Akis diyagrami (soy agaci) + zaman cizelgesi + miktar dengesi + etiket (barkod ve QR).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  GitBranch,
  Loader2,
  MapPin,
  QrCode,
  Scale,
  SearchX,
  Tag,
  User,
  X,
} from "lucide-react";
import { api, ApiHatasi, hataMesaji } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BIRIM_TIPI, durumAdi, olayAdi, sayi, tarihSaat, tr, type Renk } from "@/lib/sozluk";
import { AkisDiyagrami, type Bag, type Dugum } from "@/components/izle/AkisDiyagrami";
import { ZamanCizelgesi, type Olay } from "@/components/izle/ZamanCizelgesi";
import { HammaddePartisi, HikayeOzeti, UretimLotuOzeti } from "@/components/izle/MiktarDengesi";
import { BarkodArama } from "@/components/izle/BarkodArama";
import { EtiketOnizleme } from "@/components/barkod/Etiket";
import { Seritler } from "@/components/marka/Marka";

export const Route = createFileRoute("/_panel/izle/$barkod")({ component: UrunHikayesi });

type Agac = { cozum: any; dugumler: Dugum[]; baglar: Bag[]; sureMs: number };
type Sekme = "akis" | "zaman" | "denge" | "etiket";

const RENK_ROZET: Record<Renk, string> = {
  yesil: "bg-uygun-acik text-uygun",
  turuncu: "bg-dikkat-acik text-dikkat",
  kirmizi: "bg-unity-acik text-unity-koyu",
  gri: "bg-tas-100 text-tas-600",
};

export function yerAdi(yer?: string | null) {
  if (!yer) return "—";
  const [tur, ayrinti] = yer.split(":");
  const ad: Record<string, string> = {
    DEPO: "Depo",
    HAT: "Makine başı",
    SEVK: "Sevk edildi",
    KARANTINA: "Karantina alanı",
    METRAJ: "Metraj / kesim alanı",
    NUMUNE: "Numune arşivi",
  };
  return [ad[tur] || tur, ayrinti].filter(Boolean).join(" · ");
}

function UrunHikayesi() {
  const { barkod } = Route.useParams();
  const nav = useNavigate();
  const [sekme, setSekme] = useState<Sekme>("akis");
  const [secili, setSecili] = useState<Dugum | null>(null);
  const [etiketBarkod, setEtiketBarkod] = useState<string | null>(null);

  useEffect(() => {
    setSecili(null);
    setEtiketBarkod(null);
  }, [barkod]);

  const agac = useQuery({
    queryKey: ["agac", barkod],
    queryFn: () => api<Agac>(`/izlenebilirlik/${encodeURIComponent(barkod)}`),
    retry: false,
  });
  const olaylar = useQuery({
    queryKey: ["olaylar", barkod],
    queryFn: () => api<{ olaylar: Olay[] }>(`/izlenebilirlik/${encodeURIComponent(barkod)}/olaylar`),
    enabled: agac.isSuccess,
  });

  // Duz cumleli ozet ve miktar dokumu: tek hesap (backend services/hikaye.js)
  const ozet = useQuery({
    queryKey: ["ozet", barkod],
    queryFn: () => api<any>(`/izlenebilirlik/${encodeURIComponent(barkod)}/ozet`),
    enabled: agac.isSuccess,
  });

  const dugumler = agac.data?.dugumler || [];
  const baglar = agac.data?.baglar || [];
  const olayListe = olaylar.data?.olaylar || [];
  const cozum = agac.data?.cozum;

  const barkodaGit = (b: string) => {
    const d = dugumler.find((x) => x.baslik === b);
    if (d) setSecili(d);
    else nav({ to: "/izle/$barkod", params: { barkod: b } });
  };

  const uretimLotlari: any[] = ozet.data?.uretimLotlari || [];
  const hammaddeLotlari: any[] = ozet.data?.hammaddeLotlari || [];

  if (agac.isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-tas-400" />
      </div>
    );
  }
  if (agac.isError) {
    const yok = agac.error instanceof ApiHatasi && agac.error.durum === 404;
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <SearchX className="mx-auto h-12 w-12 text-tas-300" />
        <h1 className="mt-4 font-display text-3xl font-bold text-murekkep">{yok ? "Bu barkod sistemde yok" : "Yüklenemedi"}</h1>
        <p className="mt-2 text-sm text-tas-500">
          {yok ? (
            <>
              <span className="font-mono font-semibold">{barkod}</span> numarasıyla kayıtlı bir hammadde, ürün, iş emri ya da sevkiyat bulunamadı.
            </>
          ) : (
            hataMesaji(agac.error)
          )}
        </p>
        <BarkodArama buyuk otomatikOdak className="mt-8" />
      </div>
    );
  }

  const b = cozum?.birim;
  const tipAdi =
    cozum?.tur === "BIRIM" ? BIRIM_TIPI[b.tip]?.ad : cozum?.tur === "LOT" ? "Lot (tüm ambalajları)" : BIRIM_TIPI[cozum?.tur]?.ad || cozum?.tur;
  const urunAdi = b ? tr(b.urunAd || b.malzemeAd) : tr(cozum?.lot?.urunAd || cozum?.lot?.malzemeAd || "");
  const durum = b?.durum || cozum?.lot?.durum || cozum?.isEmri?.durum || cozum?.sevkiyat?.durum;
  const renk: Renk = b?.renk || "gri";
  const etiketVar = cozum?.tur === "BIRIM";

  const sekmeler: { id: Sekme; ad: string; ikon: typeof GitBranch; gizli?: boolean }[] = [
    { id: "akis", ad: "Akış diyagramı", ikon: GitBranch },
    { id: "zaman", ad: `Zaman çizelgesi${olayListe.length ? ` (${olayListe.length})` : ""}`, ikon: Clock },
    { id: "denge", ad: "Miktar dengesi", ikon: Scale },
    { id: "etiket", ad: "Etiket · barkod · QR", ikon: QrCode, gizli: !etiketVar },
  ];

  return (
    <div className="animate-belir">
      {/* Baslik */}
      <header className="relative overflow-hidden border-b border-tas-200 bg-white px-8 pb-0 pt-6">
        <Seritler className="absolute -right-6 top-6 w-48" kalinliklar={[10, 5]} bosluk={5} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <Link to="/izle" className="flex items-center gap-1.5 text-sm text-tas-500 hover:text-unity">
            <ArrowLeft className="h-4 w-4" /> Ürün hikâyesi
          </Link>
          <BarkodArama className="w-full max-w-xs sm:mr-48" />
        </div>

        <div className="relative mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-unity">{tipAdi}</span>
              {durum && <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", RENK_ROZET[renk])}>{durumAdi(durum)}</span>}
              {b?.bloke && <span className="rounded-md bg-dikkat px-2 py-0.5 text-xs font-bold text-white">BLOKE</span>}
              {b?.bagliIsEmri && (
                <span className="rounded-md bg-murekkep px-2 py-0.5 text-xs font-semibold text-white">Şu an makinede · {b.bagliIsEmri}</span>
              )}
            </div>
            <h1 className="mt-1 font-mono text-4xl font-bold tracking-tight text-murekkep">{cozum?.no || barkod}</h1>
            <p className="mt-1 text-[15px] text-tas-600">{urunAdi}</p>
          </div>
          {b && (
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
              <Bilgi ikon={Scale} ad="Miktar" deger={`${sayi(b.miktar)} / ${sayi(b.ilkMiktar)} ${b.olcuBirimi}`} alt="kalan / ilk" />
              <Bilgi ikon={MapPin} ad="Şu an" deger={ozet.data?.odak?.simdi || yerAdi(b.yer)} />
              <Bilgi ikon={Tag} ad="Lot" deger={b.lotNo || "—"} mono />
              <Bilgi ikon={User} ad="Oluşturan" deger={tr(b.olusturanAd) || "—"} alt={tarihSaat(b.olusturmaZamani)} />
            </dl>
          )}
        </div>

        <nav className="relative mt-6 flex gap-1 overflow-x-auto" role="tablist">
          {sekmeler
            .filter((s) => !s.gizli)
            .map(({ id, ad, ikon: Ikon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={sekme === id}
                onClick={() => setSekme(id)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap px-4 pb-3 pt-2 text-sm font-semibold transition",
                  sekme === id ? "text-murekkep" : "text-tas-400 hover:text-murekkep",
                )}
              >
                <Ikon className={cn("h-4 w-4", sekme === id && "text-unity")} />
                {ad}
                {sekme === id && <span className="egik absolute bottom-0 left-3 right-3 h-[3px] bg-unity" />}
              </button>
            ))}
        </nav>
      </header>

      <div className="p-8">
        {sekme !== "etiket" && ozet.data && (
          <div className="mb-6 max-w-6xl">
            <HikayeOzeti ozet={ozet.data} onBarkod={barkodaGit} />
          </div>
        )}

        {sekme === "akis" && (
          <div className="space-y-3">
            <p className="text-sm text-tas-500">
              Soldan sağa: hammaddenin nereden geldiği, hangi makinede kimin ürettiği, üretilen topun nelere ayrıldığı ve hangi müşteriye gittiği.
              <span className="ml-1 text-tas-400">({dugumler.length} kayıt, {agac.data?.sureMs} ms)</span>
            </p>
            <AkisDiyagrami dugumler={dugumler} baglar={baglar} secili={secili?.id} onSec={setSecili} />
          </div>
        )}

        {sekme === "zaman" &&
          (olaylar.isLoading ? (
            <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-tas-400" />
          ) : (
            <ZamanCizelgesi olaylar={olayListe} odakBarkod={b?.barkod} onBarkod={barkodaGit} />
          ))}

        {sekme === "denge" && (
          <div className="max-w-6xl space-y-6">
            {ozet.isLoading && <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-tas-400" />}
            {ozet.isError && <p className="text-sm text-unity">{hataMesaji(ozet.error, "Miktar dengesi yüklenemedi.")}</p>}
            {uretimLotlari.map((u) => (
              <UretimLotuOzeti key={u.lotNo} u={u} onBarkod={barkodaGit} />
            ))}
            {hammaddeLotlari.map((h) => (
              <HammaddePartisi key={h.lotNo} h={h} kaynakOlarak={uretimLotlari.length > 0} onBarkod={barkodaGit} />
            ))}
            {ozet.isSuccess && !uretimLotlari.length && !hammaddeLotlari.length && (
              <p className="text-sm text-tas-400">Bu kayıt için miktar dengesi yok.</p>
            )}
          </div>
        )}

        {sekme === "etiket" && etiketVar && (
          <div className="max-w-3xl">
            <EtiketOnizleme barkod={b.barkod} />
          </div>
        )}
      </div>

      {secili &&
        createPortal(
        <DugumPaneli
          d={secili}
          olaylar={olayListe}
          kapat={() => setSecili(null)}
          etiket={(x) => setEtiketBarkod(x)}
          ac={(x) => nav({ to: "/izle/$barkod", params: { barkod: x } })}
        />,
          document.body,
        )}

      {etiketBarkod &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gece/60 p-6 backdrop-blur-sm" onClick={() => setEtiketBarkod(null)}>
          <div className="my-8 w-full max-w-3xl animate-belir rounded-2xl bg-kagit p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-murekkep">
                Etiket · <span className="font-mono">{etiketBarkod}</span>
              </h2>
              <button onClick={() => setEtiketBarkod(null)} className="rounded-lg p-2 text-tas-400 hover:bg-tas-100" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>
            <EtiketOnizleme barkod={etiketBarkod} />
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}

function Bilgi({ ikon: Ikon, ad, deger, alt, mono }: { ikon: typeof Scale; ad: string; deger: string; alt?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-tas-400">
        <Ikon className="h-3.5 w-3.5" /> {ad}
      </dt>
      <dd className={cn("font-semibold text-murekkep", mono && "font-mono text-[13px]")}>{deger}</dd>
      {alt && <dd className="text-[11px] text-tas-400">{alt}</dd>}
    </div>
  );
}

// Akis diyagraminda tiklanan kutunun ayrintilari
function DugumPaneli({
  d,
  olaylar,
  kapat,
  etiket,
  ac,
}: {
  d: Dugum;
  olaylar: Olay[];
  kapat: () => void;
  etiket: (b: string) => void;
  ac: (b: string) => void;
}) {
  const birim = !["IS_EMRI", "SEVKIYAT"].includes(d.tur);
  const kendi = olaylar.filter((o) =>
    d.tur === "IS_EMRI" ? o.isEmriNo === d.isEmriNo && !o.barkod : o.barkod === d.baslik || o.karsiBarkod === d.baslik,
  );
  const satirlar: [string, React.ReactNode][] = birim
    ? [
        ["Durum", durumAdi(d.durum)],
        ["Miktar (kalan / ilk)", `${sayi(d.miktar)} / ${sayi(d.ilkMiktar)} ${d.olcuBirimi}`],
        ["Şu an nerede", yerAdi(d.yer)],
        ["Lot", d.lotNo],
        d.tedarikci ? ["Tedarikçi", `${tr(d.tedarikci)} (lot ${d.tedarikciLot || "-"})`] : null,
        d.makineKod ? ["Makine", d.makineKod] : null,
        d.isEmriNo ? ["İş emri", d.isEmriNo] : null,
        d.ek?.hataKodu ? ["Karantina nedeni", `${d.ek.hataKodu} ${tr(d.ek.hataAciklama)}`] : null,
        ["Oluşturan", `${tr(d.olusturanAd) || "-"}${d.olusturanSicil ? ` (sicil ${d.olusturanSicil})` : ""}`],
        ["Oluşturma zamanı", tarihSaat(d.olusturmaZamani)],
      ].filter(Boolean) as [string, React.ReactNode][]
    : d.tur === "IS_EMRI"
      ? [
          ["Durum", durumAdi(d.durum)],
          ["Makine", `${d.makineKod} · ${tr(d.altBaslik)}`],
          ["Operatör(ler)", tr(d.operatorler) || "-"],
          ["Başlangıç", tarihSaat(d.baslangicZamani) || "-"],
          ["Bitiş", tarihSaat(d.bitisZamani) || "-"],
        ]
      : [
          ["Müşteri", tr(d.musteri)],
          ["Durum", durumAdi(d.durum)],
          ["İrsaliye", d.irsaliyeNo || "-"],
          ["Sevk zamanı", tarihSaat(d.sevkZamani) || "-"],
        ];

  return (
    <div className="fixed inset-0 z-40" onClick={kapat}>
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-md animate-belir flex-col border-l border-tas-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-tas-200 p-5">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-unity">{BIRIM_TIPI[d.tur]?.ad || d.tur}</div>
            <div className="mt-0.5 truncate font-mono text-xl font-bold text-murekkep">{d.tur === "IS_EMRI" ? d.isEmriNo : d.baslik}</div>
            <div className="truncate text-sm text-tas-500">{tr(d.altBaslik)}</div>
          </div>
          <button onClick={kapat} className="rounded-lg p-2 text-tas-400 hover:bg-tas-100" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <dl className="divide-y divide-tas-100 text-sm">
            {satirlar.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-tas-500">{k}</dt>
                <dd className="text-right font-medium text-murekkep">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <h4 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-tas-400">Başına gelenler ({kendi.length})</h4>
          <ol className="space-y-2">
            {kendi.map((o) => (
              <li key={o.id} className="rounded-lg bg-tas-50 px-3 py-2 text-[13px] ring-1 ring-tas-100">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-murekkep">{olayAdiKisa(o)}</span>
                  <span className="whitespace-nowrap text-[11px] text-tas-400">{tarihSaat(o.zaman)}</span>
                </div>
                <div className="text-[11px] text-tas-500">
                  {tr(o.kullanici)}
                  {o.sicilNo ? ` · sicil ${o.sicilNo}` : ""}
                  {o.miktar != null ? ` · ${sayi(o.miktar)} ${o.olcuBirimi || ""}` : ""}
                </div>
              </li>
            ))}
            {!kendi.length && <li className="text-sm text-tas-400">Kayıt yok.</li>}
          </ol>
        </div>
        {birim && (
          <div className="flex gap-2 border-t border-tas-200 p-4">
            <button
              onClick={() => etiket(d.baslik)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-tas-200 py-2.5 text-sm font-semibold text-murekkep hover:border-tas-400"
            >
              <QrCode className="h-4 w-4" /> Etiketi göster
            </button>
            <button
              onClick={() => ac(d.baslik)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-unity py-2.5 text-sm font-semibold text-white hover:bg-unity-koyu"
            >
              Bunun hikâyesi <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

const olayAdiKisa = (o: Olay) => olayAdi(o.tip);
