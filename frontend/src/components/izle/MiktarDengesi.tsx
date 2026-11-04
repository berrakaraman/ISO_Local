// Miktar dengesi: ne kadari kullanildi, ne kadari urune donustu, ne kadari copu, ne kadari karantinada,
// karantinadan sonra ne karar verildi. Hammadde lotu icin backend'in bakiye kartini, uretim lotu icin
// soy agacindaki parcalari kullanir.
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { api, hataMesaji } from "@/lib/api";
import { cn } from "@/lib/utils";
import { durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import type { Bag, Dugum } from "./AkisDiyagrami";

type Dilim = { ad: string; deger: number; renk: string; aciklama?: string };

function Cubuk({ dilimler, toplam, birim }: { dilimler: Dilim[]; toplam: number; birim: string }) {
  const gorunen = dilimler.filter((d) => d.deger > 0.0001);
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg bg-tas-100">
        {gorunen.map((d) => (
          <div
            key={d.ad}
            className={cn("h-full border-r-2 border-white transition-all last:border-r-0", d.renk)}
            style={{ width: `${Math.max(0.8, (d.deger / (toplam || 1)) * 100)}%` }}
            title={`${d.ad}: ${sayi(d.deger)} ${birim}`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {dilimler.map((d) => (
          <li key={d.ad} className="flex items-start gap-2.5 text-sm">
            <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-sm", d.renk)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-tas-600">{d.ad}</span>
                <span className="sayi whitespace-nowrap font-semibold text-murekkep">
                  {sayi(d.deger)} {birim}
                  <span className="ml-1.5 text-xs font-normal text-tas-400">%{sayi(toplam ? (d.deger / toplam) * 100 : 0, 1)}</span>
                </span>
              </span>
              {d.aciklama && <span className="block text-[11px] leading-snug text-tas-400">{d.aciklama}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Kart({ ust, baslik, alt, children }: { ust: string; baslik: string; alt?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-tas-200 bg-white p-6">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-unity">{ust}</div>
      <h3 className="mt-0.5 font-mono text-xl font-bold text-murekkep">{baslik}</h3>
      {alt && <p className="text-sm text-tas-500">{alt}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const KARAR_RENK: Record<string, string> = {
  OLUMLU: "bg-uygun-acik text-uygun",
  SARTLI_KABUL: "bg-dikkat-acik text-dikkat",
  HURDA: "bg-unity-acik text-unity-koyu",
  KARAR_BEKLIYOR: "bg-dikkat-acik text-dikkat",
  YENIDEN_ISLEME: "bg-dikkat-acik text-dikkat",
};

function KarantinaKararlari({ satirlar, onBarkod }: { satirlar: any[]; onBarkod?: (b: string) => void }) {
  if (!satirlar.length) return <p className="text-sm text-tas-400">Bu üretimden karantinaya ayrılan parça yok.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-tas-200 text-left text-[11px] uppercase tracking-wider text-tas-400">
            <th className="py-2 pr-3 font-semibold">Karantina barkodu</th>
            <th className="py-2 pr-3 font-semibold">Miktar</th>
            <th className="py-2 pr-3 font-semibold">Neden</th>
            <th className="py-2 pr-3 font-semibold">Karar</th>
            <th className="py-2 pr-3 font-semibold">Kim / ne zaman</th>
            <th className="py-2 font-semibold">Sonra</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((k) => (
            <tr key={k.barkod} className="border-b border-tas-100 last:border-0">
              <td className="py-2.5 pr-3">
                <button onClick={() => onBarkod?.(k.barkod)} className="font-mono text-xs font-semibold text-murekkep hover:text-unity">
                  {k.barkod}
                </button>
              </td>
              <td className="sayi py-2.5 pr-3">
                {sayi(k.ilkMiktar)} {k.olcuBirimi}
              </td>
              <td className="py-2.5 pr-3 text-tas-600">
                <span className="font-mono text-xs text-tas-400">{k.ek?.hataKodu}</span> {tr(k.ek?.hataAciklama)}
              </td>
              <td className="py-2.5 pr-3">
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", KARAR_RENK[k.durum] || "bg-tas-100 text-tas-600")}>
                  {durumAdi(k.durum)}
                </span>
                {k.kararNotu && <div className="mt-0.5 text-[11px] text-tas-400">“{tr(k.kararNotu)}”</div>}
              </td>
              <td className="py-2.5 pr-3 text-xs text-tas-500">
                {k.kararVeren ? (
                  <>
                    {tr(k.kararVeren)}
                    <br />
                    {tarihSaat(k.kararZamani)}
                  </>
                ) : (
                  "Henüz karar verilmedi"
                )}
              </td>
              <td className="py-2.5 text-xs">
                {k.yeniBarkod ? (
                  <button onClick={() => onBarkod?.(k.yeniBarkod)} className="font-mono font-semibold text-uygun hover:underline">
                    → {k.yeniBarkod}
                  </button>
                ) : k.durum === "HURDA" ? (
                  <span className="text-unity">Hurdaya ayrıldı</span>
                ) : (
                  <span className="text-tas-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HammaddeBakiye({ lotNo, onBarkod }: { lotNo: string; onBarkod?: (b: string) => void }) {
  const s = useQuery({ queryKey: ["bakiye", lotNo], queryFn: () => api<any>(`/hammadde/lotlar/${encodeURIComponent(lotNo)}/bakiye`) });
  if (s.isLoading) return <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-tas-400" />;
  if (s.isError) return <p className="text-sm text-unity">{hataMesaji(s.error, "Bakiye yüklenemedi.")}</p>;
  const { lot, bakiye: b, karantinaKararlari } = s.data;
  const t = b.tuketilenDagilimi;
  const dilimler: Dilim[] = [
    { ad: "Uygun ürüne dönüştü", deger: t.uygunUrun, renk: "bg-uygun", aciklama: "Kalite onaylı makaralara giden miktar" },
    { ad: "Karantinada (karar bekliyor)", deger: t.karantinada, renk: "bg-dikkat" },
    { ad: "Hurda / fire", deger: t.hurda + b.dogrudanHurda, renk: "bg-unity", aciklama: "Kesim firesi, hurda kararı verilen karantina, reddedilen" },
    { ad: "Kesim bekleyen top", deger: t.kesimBekleyen, renk: "bg-murekkep" },
    {
      ad: "Üretimde açıklanamayan fark",
      deger: Math.max(0, t.aciklanamayan),
      renk: "bg-[repeating-linear-gradient(-45deg,#a8a29b_0_4px,#cfcac4_4px_8px)]",
      aciklama: "Tüketilen ile ürüne dönüşen arasındaki fark (proses kaybı, reçete farkı)",
    },
    { ad: "Makine başında (hatta)", deger: b.hatta, renk: "bg-sky-600" },
    { ad: "Depoda, kullanılabilir", deger: b.depodaKullanilabilir, renk: "bg-tas-300" },
    { ad: "Depoda, kontrol / karantina", deger: b.depodaBekleyen, renk: "bg-dikkat/60" },
    { ad: "Reddedildi (tedarikçiye)", deger: b.ret, renk: "bg-unity-koyu" },
  ];
  return (
    <div className="space-y-5">
      <Kart
        ust="Hammadde lotu · ne kadarı nereye gitti?"
        baslik={lot.no}
        alt={`${lot.malzemeKod} ${tr(lot.malzemeAd)} · ${tr(lot.tedarikci) || "-"} (tedarikçi lotu ${lot.tedarikciLot || "-"})`}
      >
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Ozet ad="Giriş" deger={`${sayi(b.giris)} ${b.olcuBirimi}`} />
          <Ozet ad="Üretimde tüketilen" deger={`${sayi(b.tuketilen)} ${b.olcuBirimi}`} />
          <Ozet ad="Depoda kalan" deger={`${sayi(b.depodaKullanilabilir + b.depodaBekleyen)} ${b.olcuBirimi}`} />
          <Ozet ad="Hurda / fire" deger={`${sayi(t.hurda + b.dogrudanHurda)} ${b.olcuBirimi}`} vurgu />
        </div>
        <Cubuk dilimler={dilimler} toplam={b.giris} birim={b.olcuBirimi} />
        <div
          className={cn(
            "mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
            b.kontrol.tutuyor ? "bg-uygun-acik text-uygun" : "bg-unity-acik text-unity-koyu",
          )}
        >
          {b.kontrol.tutuyor ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          {b.kontrol.tutuyor
            ? "Miktar dengesi tutuyor: giriş = depoda + hatta + tüketilen + hurda"
            : `Miktar dengesi tutmuyor: ${sayi(b.kontrol.fark)} ${b.olcuBirimi} fark var`}
          {t.tahmini && <span className="ml-auto opacity-70">Birden fazla lot karıştığı için dağılım tahminidir</span>}
        </div>
      </Kart>
      <Kart ust="Karantina · ne karar verildi?" baslik={`${karantinaKararlari.length} parça`} alt="Bu hammaddeyle üretilenlerden karantinaya ayrılanlar">
        <KarantinaKararlari satirlar={karantinaKararlari} onBarkod={onBarkod} />
      </Kart>
    </div>
  );
}

function Ozet({ ad, deger, vurgu }: { ad: string; deger: string; vurgu?: boolean }) {
  return (
    <div className="rounded-xl bg-tas-50 px-4 py-3 ring-1 ring-tas-100">
      <div className="text-xs text-tas-500">{ad}</div>
      <div className={cn("sayi mt-0.5 font-display text-2xl font-bold", vurgu ? "text-unity" : "text-murekkep")}>{deger}</div>
    </div>
  );
}

// Uretim lotunun (top) dokumu: soy agacindaki parcalardan hesaplanir
export function UretimLotuDokumu({
  lot,
  dugumler,
  baglar,
  olaylar,
  onBarkod,
}: {
  lot: Dugum;
  dugumler: Dugum[];
  baglar: Bag[];
  olaylar: any[];
  onBarkod?: (b: string) => void;
}) {
  const ayni = dugumler.filter((d) => d.lotNo === lot.lotNo && d.id !== lot.id);
  const krdenGelen = new Set(baglar.filter((b) => b.tip === "YENIDEN_ETIKET").map((b) => b.hedef));
  const fg = ayni.filter((d) => d.tur === "FG" && !krdenGelen.has(d.id));
  const kr = ayni.filter((d) => d.tur === "KR");
  const nm = ayni.filter((d) => d.tur === "NM");
  const top = (l: Dugum[]) => l.reduce((t, d) => t + (d.ilkMiktar || 0), 0);
  const fire = olaylar.filter((o) => o.tip === "HURDA" && o.barkod === lot.baslik).reduce((t, o) => t + (o.miktar || 0), 0);
  const sevk = fg.filter((d) => d.durum === "SEVK_EDILDI");
  const stok = fg.filter((d) => ["SERBEST", "DEPODA", "SIPARISE_AYRILDI"].includes(d.durum!));
  const bekleyen = fg.filter((d) => d.durum === "KALITE_BEKLIYOR");
  const red = fg.filter((d) => ["RET", "HURDA"].includes(d.durum!));
  const b = lot.olcuBirimi || "m";

  const kararlar = kr.map((k) => {
    const karar = [...olaylar].reverse().find((o) => o.tip === "KARANTINA_KARARI" && o.barkod === k.baslik);
    return {
      barkod: k.baslik,
      ilkMiktar: k.ilkMiktar,
      olcuBirimi: k.olcuBirimi,
      durum: k.durum,
      ek: k.ek,
      kararVeren: karar?.kullanici,
      kararZamani: karar?.zaman,
      kararNotu: karar?.aciklama,
      yeniBarkod: karar?.veri?.yeniBarkod,
    };
  });

  return (
    <div className="space-y-5">
      <Kart ust="Üretim lotu · bu toptan ne çıktı?" baslik={lot.baslik} alt={`${tr(lot.altBaslik)} · ${sayi(lot.ilkMiktar)} ${b} üretildi`}>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Ozet ad="Üretilen top" deger={`${sayi(lot.ilkMiktar)} ${b}`} />
          <Ozet ad="Makaraya kesilen" deger={`${sayi(top(fg))} ${b}`} />
          <Ozet ad="Müşteriye giden" deger={`${sayi(top(sevk))} ${b}`} />
          <Ozet ad="Kesim firesi" deger={`${sayi(fire)} ${b}`} vurgu />
        </div>
        <Cubuk
          toplam={top(fg) + fire + (lot.miktar || 0)}
          birim={b}
          dilimler={[
            { ad: `Müşteriye sevk edildi (${sevk.length} makara)`, deger: top(sevk), renk: "bg-violet-600" },
            { ad: `Stokta, kullanılabilir (${stok.length} makara)`, deger: top(stok), renk: "bg-uygun" },
            { ad: `Kalite onayı bekliyor (${bekleyen.length})`, deger: top(bekleyen), renk: "bg-dikkat" },
            { ad: `Reddedildi (${red.length})`, deger: top(red), renk: "bg-unity-koyu" },
            { ad: "Kesim firesi (hurda)", deger: fire, renk: "bg-unity" },
            { ad: "Henüz kesilmemiş", deger: lot.miktar || 0, renk: "bg-murekkep" },
          ]}
        />
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-tas-50 px-4 py-3 ring-1 ring-tas-100">
            <div className="text-xs text-tas-500">Üretim sırasında karantinaya ayrılan</div>
            <div className="sayi font-semibold text-murekkep">
              {sayi(top(kr))} {b} · {kr.length} parça
            </div>
          </div>
          <div className="rounded-lg bg-tas-50 px-4 py-3 ring-1 ring-tas-100">
            <div className="text-xs text-tas-500">Numune (arşivde saklanıyor)</div>
            <div className="sayi font-semibold text-murekkep">
              {sayi(top(nm))} {b} · {nm.map((n) => n.baslik).join(", ") || "yok"}
            </div>
          </div>
        </div>
      </Kart>
      <Kart ust="Karantina · ne karar verildi?" baslik={`${kr.length} parça`} alt="Bu toptan karantinaya ayrılan parçalar ve verilen kararlar">
        <KarantinaKararlari satirlar={kararlar} onBarkod={onBarkod} />
      </Kart>
    </div>
  );
}
