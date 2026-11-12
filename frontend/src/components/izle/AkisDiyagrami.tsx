// Akis diyagrami (soy agaci): bir urunun hammaddeden musteriye kadar yolu.
// Sutunlar: Nereden geldi? -> Nasil uretildi? -> Ne uretildi? -> Sonra ne oldu? -> Kime gitti?
// Bir kutunun uzerine gelince sadece onunla bagli yol vurgulanir; tiklayinca ayrintilar acilir.
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CornerDownRight, Factory, Package, ShieldAlert, Truck, FlaskConical, Boxes, Cylinder } from "lucide-react";
import { cn } from "@/lib/utils";
import { durumAdi, sayi, tr, type Renk } from "@/lib/sozluk";

export type Dugum = {
  id: string;
  tur: string;
  baslik: string;
  altBaslik?: string;
  durum?: string;
  renk: Renk;
  baslangic?: boolean;
  miktar?: number;
  ilkMiktar?: number;
  olcuBirimi?: string;
  bloke?: boolean;
  lotNo?: string;
  [k: string]: any;
};
export type Bag = { kaynak: string; hedef: string; tip: string; miktar?: number };

const SUTUNLAR = [
  { anahtar: "hammadde", soru: "Nereden geldi?", ad: "Hammadde", turler: ["RM", "WIP"], ikon: Cylinder, bos: "Hammadde kaydı yok" },
  { anahtar: "proses", soru: "Nasıl üretildi?", ad: "Makine ve iş emri", turler: ["IS_EMRI"], ikon: Factory, bos: "Henüz üretime girmedi" },
  { anahtar: "lot", soru: "Ne üretildi?", ad: "Üretim lotu (top)", turler: ["FG_LOT"], ikon: Boxes, bos: "Üretim lotu yok" },
  { anahtar: "parca", soru: "Sonra ne oldu?", ad: "Makara · karantina · numune", turler: ["FG", "KR", "NM"], ikon: Package, bos: "Henüz kesilmedi" },
  { anahtar: "sevk", soru: "Kime gitti?", ad: "Müşteri sevkiyatı", turler: ["SEVKIYAT"], ikon: Truck, bos: "Henüz sevk edilmedi" },
] as const;

const RENK_SERIT: Record<Renk, string> = { yesil: "bg-uygun", turuncu: "bg-dikkat", kirmizi: "bg-unity", gri: "bg-tas-300" };
const RENK_YAZI: Record<Renk, string> = { yesil: "text-uygun", turuncu: "text-dikkat", kirmizi: "text-unity", gri: "text-tas-400" };
const RENK_CIZGI: Record<Renk, string> = { yesil: "#1f8f4e", turuncu: "#c77a0a", kirmizi: "#ed1c24", gri: "#a8a29b" };

type Satir = { dugum: Dugum; girinti?: string; bolum?: string };

// Ayni sutundaki iliskiler (bolme, karantinadan yeni barkod) cizgi yerine girintiyle gosterilir
function sutunSatirlari(sutun: string, dugumler: Dugum[], baglar: Bag[], idx: Record<string, Dugum>): Satir[] {
  const icSutun = baglar.filter((b) => ["BOLUNDU", "YENIDEN_ETIKET"].includes(b.tip) && idx[b.kaynak] && idx[b.hedef]);
  const ebeveyn: Record<string, Bag> = {};
  icSutun.forEach((b) => (ebeveyn[b.hedef] = b));
  const cocuklar = (id: string) => icSutun.filter((b) => b.kaynak === id).map((b) => idx[b.hedef]);
  const sirala = (a: Dugum, b: Dugum) => a.baslik.localeCompare(b.baslik, "tr", { numeric: true });

  const satirlar: Satir[] = [];
  const ekle = (d: Dugum, bolum?: string) => {
    satirlar.push({ dugum: d, bolum });
    for (const c of cocuklar(d.id).sort(sirala)) {
      const bag = ebeveyn[c.id];
      satirlar.push({
        dugum: c,
        girinti: bag.tip === "BOLUNDU" ? `${d.baslik} ambalajından bölündü` : `Karantina sonrası yeni barkod`,
      });
    }
  };
  const kokler = dugumler.filter((d) => !ebeveyn[d.id]).sort(sirala);
  if (sutun !== "parca") {
    kokler.forEach((d) => ekle(d));
    return satirlar;
  }
  // Parca sutunu bolumlere ayrilir
  const gruplar: [string, string][] = [
    ["FG", "Makaralar / paketler"],
    ["KR", "Karantinaya ayrılanlar"],
    ["NM", "Numune"],
  ];
  for (const [tur, ad] of gruplar) {
    const g = kokler.filter((d) => d.tur === tur);
    g.forEach((d, i) => ekle(d, i === 0 ? `${ad} (${g.length})` : undefined));
  }
  return satirlar;
}

export function AkisDiyagrami({
  dugumler,
  baglar,
  secili,
  onSec,
}: {
  dugumler: Dugum[];
  baglar: Bag[];
  secili?: string | null;
  onSec: (d: Dugum) => void;
}) {
  const kap = useRef<HTMLDivElement>(null);
  const kutular = useRef(new Map<string, HTMLElement>());
  const [cizgiler, setCizgiler] = useState<{ id: string; d: string; renk: string; bag: Bag }[]>([]);
  const [boyut, setBoyut] = useState({ w: 0, h: 0 });
  const [uzerinde, setUzerinde] = useState<string | null>(null);

  const idx = useMemo(() => Object.fromEntries(dugumler.map((d) => [d.id, d])), [dugumler]);
  const sutunOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of dugumler) m[d.id] = SUTUNLAR.find((s) => (s.turler as readonly string[]).includes(d.tur))?.anahtar || "parca";
    return m;
  }, [dugumler]);

  // Odak: uzerine gelinen ya da secili kutu; ona bagli ust ve alt zincir vurgulanir
  const odak = uzerinde || secili || null;
  const vurgu = useMemo(() => {
    if (!odak || !idx[odak]) return null;
    const ileri = new Map<string, string[]>();
    const geri = new Map<string, string[]>();
    for (const b of baglar) {
      ileri.set(b.kaynak, [...(ileri.get(b.kaynak) || []), b.hedef]);
      geri.set(b.hedef, [...(geri.get(b.hedef) || []), b.kaynak]);
    }
    const gez = (bas: string, kom: Map<string, string[]>) => {
      const s = new Set<string>([bas]);
      const q = [bas];
      while (q.length) for (const n of kom.get(q.shift()!) || []) if (!s.has(n)) (s.add(n), q.push(n));
      return s;
    };
    const ata = gez(odak, geri);
    const torun = gez(odak, ileri);
    return { dugum: new Set([...ata, ...torun]), ata, torun };
  }, [odak, baglar, idx]);
  const bagVurgulu = (b: Bag) => !vurgu || (vurgu.ata.has(b.kaynak) && vurgu.ata.has(b.hedef)) || (vurgu.torun.has(b.kaynak) && vurgu.torun.has(b.hedef));

  const kaydet = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) kutular.current.set(id, el);
      else kutular.current.delete(id);
    },
    [],
  );

  // Kutularin yerine gore baglanti cizgilerini hesapla
  useLayoutEffect(() => {
    const hesapla = () => {
      const k = kap.current;
      if (!k) return;
      const kr = k.getBoundingClientRect();
      setBoyut({ w: k.scrollWidth, h: k.scrollHeight });
      const yeni: typeof cizgiler = [];
      baglar.forEach((b, i) => {
        if (sutunOf[b.kaynak] === sutunOf[b.hedef]) return;
        const a = kutular.current.get(b.kaynak)?.getBoundingClientRect();
        const c = kutular.current.get(b.hedef)?.getBoundingClientRect();
        if (!a || !c) return;
        const x1 = a.right - kr.left;
        const y1 = a.top + a.height / 2 - kr.top;
        const x2 = c.left - kr.left;
        const y2 = c.top + c.height / 2 - kr.top;
        const dx = Math.max(24, (x2 - x1) / 2);
        const hedef = idx[b.hedef];
        yeni.push({
          id: `${b.kaynak}>${b.hedef}>${i}`,
          d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
          renk: hedef?.renk === "kirmizi" || hedef?.renk === "turuncu" ? RENK_CIZGI[hedef.renk] : "#b9b3ac",
          bag: b,
        });
      });
      setCizgiler(yeni);
    };
    hesapla();
    const ro = new ResizeObserver(hesapla);
    if (kap.current) ro.observe(kap.current);
    window.addEventListener("resize", hesapla);
    document.fonts?.ready.then(hesapla);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", hesapla);
    };
  }, [baglar, dugumler, sutunOf, idx]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-tas-200 bg-white">
      <div ref={kap} className="relative grid min-w-[1180px] grid-cols-5 gap-9 p-6" onMouseLeave={() => setUzerinde(null)}>
        <svg className="pointer-events-none absolute left-0 top-0" width={boyut.w} height={boyut.h} aria-hidden>
          {cizgiler.map((c) => {
            const acik = bagVurgulu(c.bag);
            return (
              <path
                key={c.id}
                d={c.d}
                fill="none"
                stroke={acik && vurgu ? "#231f20" : c.renk}
                strokeWidth={acik && vurgu ? 2 : 1.5}
                strokeOpacity={acik ? 0.9 : 0.12}
                strokeDasharray={c.bag.tip === "AYRILDI" || c.bag.tip === "NUMUNE" ? "4 4" : undefined}
                className="transition-[stroke-opacity] duration-200"
              />
            );
          })}
        </svg>

        {SUTUNLAR.map((s, si) => {
          const sd = dugumler.filter((d) => sutunOf[d.id] === s.anahtar);
          const satirlar = sutunSatirlari(s.anahtar, sd, baglar, idx);
          return (
            <div key={s.anahtar} className="relative flex flex-col">
              <div className="mb-4 border-b border-tas-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="egik flex h-6 w-6 items-center justify-center bg-murekkep font-display text-xs font-bold text-white">
                    <span className="egik-duz">{si + 1}</span>
                  </span>
                  <span className="font-display text-lg font-bold uppercase italic tracking-wide text-murekkep">{s.soru}</span>
                </div>
                <div className="mt-0.5 text-xs text-tas-400">{s.ad}</div>
              </div>

              <div className="flex flex-1 flex-col justify-center gap-2">
                {satirlar.length === 0 && (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-tas-300 px-3 py-6 text-center text-xs text-tas-400">
                    {s.bos}
                  </div>
                )}
                {satirlar.map(({ dugum: d, girinti, bolum }) => (
                  <div key={d.id} className={cn(girinti && "pl-3")}>
                    {bolum && <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-tas-400 first:mt-0">{bolum}</div>}
                    {girinti && (
                      <div className="-ml-2 mb-0.5 flex items-center gap-1 truncate text-[10px] text-tas-400">
                        <CornerDownRight className="h-3 w-3" /> {girinti}
                      </div>
                    )}
                    <Kutu
                      d={d}
                      ref={kaydet(d.id)}
                      soluk={!!vurgu && !vurgu.dugum.has(d.id)}
                      secili={secili === d.id}
                      onClick={() => onSec(d)}
                      onEnter={() => setUzerinde(d.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-tas-200 px-6 py-3 text-xs text-tas-500">
        <Lejant renk="yesil" ad="Uygun" />
        <Lejant renk="turuncu" ad="Kontrol / karar bekliyor, bloke" />
        <Lejant renk="kirmizi" ad="Hurda, ret, karantina" />
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm ring-2 ring-unity ring-offset-1" /> Okutulan barkod
        </span>
        <span className="ml-auto text-tas-400">Bir kutunun üzerine gelin: yalnızca onun yolu görünür. Tıklayın: ayrıntılar açılır.</span>
      </div>
    </div>
  );
}

function Lejant({ renk, ad }: { renk: Renk; ad: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-1.5 rounded-sm", RENK_SERIT[renk])} /> {ad}
    </span>
  );
}

const TUR_IKON: Record<string, typeof Package> = {
  RM: Cylinder,
  WIP: Cylinder,
  IS_EMRI: Factory,
  FG_LOT: Boxes,
  FG: Package,
  KR: ShieldAlert,
  NM: FlaskConical,
  SEVKIYAT: Truck,
};

const Kutu = forwardRef<
  HTMLButtonElement,
  { d: Dugum; soluk: boolean; secili: boolean; onClick: () => void; onEnter: () => void }
>(function Kutu({ d, soluk, secili, onClick, onEnter }, ref) {
  const Ikon = TUR_IKON[d.tur] || Package;
  // Hammadde kutusunda ilk miktar degil, bu agactaki is emrine giden miktar yazar (25 kg bobinden 7 kg kullanildiysa "7 kg")
  const miktar =
    d.tur === "IS_EMRI" || d.tur === "SEVKIYAT"
      ? null
      : d.tur === "RM" && d.buIseGiden != null
        ? `${sayi(d.buIseGiden)} ${d.olcuBirimi}`
        : d.tur === "RM" && d.sadeceKaynak
          ? null
          : `${sayi(d.ilkMiktar)} ${d.olcuBirimi}`;
  const miktarAlt =
    d.tur === "RM" && d.buIseGiden != null
      ? d.kullanim?.some((x: any) => x.aktif)
        ? "makinede"
        : `bu işe giden · ${sayi(d.ilkMiktar)} ${d.olcuBirimi} bobinden`
      : null;
  const alt = d.tur === "IS_EMRI" ? tr(d.operatorler || d.altBaslik) : tr(d.altBaslik);
  const durumYazisi =
    d.tur === "SEVKIYAT"
      ? tr(d.musteri)
      : d.tur === "RM" && d.sadeceKaynak
        ? "Bu işe takılmadı; bir kısmı ayrılıp kullanıldı"
        : d.simdi || (d.durum ? durumAdi(d.durum) : alt);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseEnter={onEnter}
      onFocus={onEnter}
      className={cn(
        "group relative flex w-full items-stretch overflow-hidden rounded-lg border bg-white text-left transition-all duration-200",
        secili ? "border-murekkep shadow-md" : "border-tas-200 hover:border-tas-400 hover:shadow-sm",
        d.baslangic && "ring-2 ring-unity ring-offset-2",
        soluk && "opacity-30",
        !soluk && d.sadeceKaynak && "opacity-60",
      )}
    >
      <span className={cn("w-1.5 shrink-0", RENK_SERIT[d.renk] || "bg-tas-300")} />
      <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2">
        <Ikon className={cn("h-4 w-4 shrink-0", RENK_YAZI[d.renk] || "text-tas-400")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] font-semibold text-murekkep">
            {d.baslik}
          </span>
          <span className="block truncate text-[11px] text-tas-500" title={durumYazisi}>
            {durumYazisi}
          </span>
          {d.yolculuk && ["FG", "KR"].includes(d.tur) && (
            <span className="mt-0.5 block truncate text-[10px] text-tas-400" title={d.yolculuk}>
              {d.yolculuk}
            </span>
          )}
        </span>
        {miktar && (
          <span className="shrink-0 text-right">
            <span className="sayi block text-[11px] font-semibold text-tas-600">{miktar}</span>
            {miktarAlt && <span className="block text-[9px] text-tas-400">{miktarAlt}</span>}
          </span>
        )}
      </span>
      {d.bloke && <span className="absolute right-1 top-1 rounded bg-dikkat px-1 text-[9px] font-bold text-white">BLOKE</span>}
    </button>
  );
});
