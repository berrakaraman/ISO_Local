// Depo ve hat islemleri: depodan cekis, hattan iade, rafa yerlestirme, yeniden kesim, dogrudan hurda, etiket yeniden basma.
// Her islemde once okutulan barkodun durumu gosterilir; kurallar backend'de denetlenir
// (onaysiz malzeme cekilemez, karantinadaki parca rafa konamaz, sevk edilmis parca hurdaya ayrilamaz...).
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { PageHeader } from "@/components/iso/PageHeader";
import { Alan, BarkodLink, EtiketListesi, girdi } from "@/components/iso/FormParcalari";
import { IslemFormu, Sekmeler, nokta, sayiMi, useIslem } from "@/components/iso/Islem";
import { api } from "@/lib/api";
import { useTanimlar } from "@/lib/tanimlar";
import { rolVar, useOturum } from "@/lib/oturum";
import { BIRIM_TIPI, durumAdi, sayi, tr } from "@/lib/sozluk";
import { barkodAyikla } from "@/components/izle/BarkodArama";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/depo")({ component: DepoIslemleri });

type Sekme = "cekis" | "iade" | "yerlestir" | "bol" | "hurda" | "etiket";

function DepoIslemleri() {
  const o = useOturum();
  const depocu = rolVar(o, "DEPO", "OPERATOR", "SEF");
  const sekmeler: { k: Sekme; ad: string }[] = [
    ...(depocu ? [{ k: "cekis" as const, ad: "Depodan çekiş" }, { k: "iade" as const, ad: "Hattan iade" }] : []),
    ...(rolVar(o, "DEPO", "SEF", "KALITE") ? [{ k: "yerlestir" as const, ad: "Rafa yerleştir" }] : []),
    ...(rolVar(o, "OPERATOR", "SEF", "DEPO") ? [{ k: "bol" as const, ad: "Yeniden kesim" }] : []),
    ...(rolVar(o, "KALITE", "SEF") ? [{ k: "hurda" as const, ad: "Doğrudan hurda" }] : []),
    { k: "etiket", ad: "Etiket yeniden bas" },
  ];
  return (
    <div>
      <PageHeader eyebrow="Depo · Hat" title="Depo İşlemleri" description="Malzemenin depo ile hat arasındaki hareketleri. Her hareket ürün hikâyesine işlenir." />
      <div className="max-w-4xl p-8">
        <Sekmeler sekmeler={sekmeler}>
          {(k) => (
            <>
              {k === "cekis" && <Cekis />}
              {k === "iade" && <Iade />}
              {k === "yerlestir" && <Yerlestir />}
              {k === "bol" && <Bol />}
              {k === "hurda" && <Hurda />}
              {k === "etiket" && <EtiketBas />}
            </>
          )}
        </Sekmeler>
      </div>
    </div>
  );
}

// Okutulan barkodun ne oldugunu gosterir
function BarkodGirisi({ deger, onChange, ipucu }: { deger: string; onChange: (v: string) => void; ipucu?: string }) {
  const b = barkodAyikla(deger);
  const q = useQuery({
    queryKey: ["barkod", b],
    queryFn: () => api<any>(`/barkod/${encodeURIComponent(b)}`),
    enabled: b.length >= 6,
    retry: false,
  });
  const x = q.data?.birim;
  return (
    <Alan etiket="Barkod" ipucu={ipucu}>
      <div className="relative">
        <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tas-400" />
        <input className={cn(girdi, "h-11 pl-11 font-mono")} autoFocus value={deger} onChange={(e) => onChange(e.target.value)} placeholder="Okutun ya da yazın" spellCheck={false} />
      </div>
      {b.length >= 6 && (
        <div className="mt-1.5 text-xs">
          {q.isError && <span className="text-unity">Barkod bulunamadı.</span>}
          {x && (
            <span className="text-tas-600">
              <BarkodLink barkod={x.barkod} /> · {BIRIM_TIPI[x.tip]?.ad || x.tip} · {tr(x.malzemeKod || x.urunKod)} ·{" "}
              <b className={cn(x.bloke && "text-unity")}>{x.bloke ? "BLOKE · " : ""}{durumAdi(x.durum)}</b> · {sayi(x.miktar)} {x.olcuBirimi} · yer: {x.yer || "—"}
              {x.bagliIsEmri && <> · makinede ({x.bagliIsEmri})</>}
            </span>
          )}
        </div>
      )}
    </Alan>
  );
}

function Cekis() {
  const [v, setV] = useState({ barkod: "", miktar: "", isEmriNo: "" });
  const [etiket, setEtiket] = useState<string[]>([]);
  const ieler = useQuery({ queryKey: ["is-emirleri", "acik"], queryFn: () => api<any[]>("/is-emirleri?durum=PLANLANDI,ILK_PARCA_BEKLIYOR,URETIMDE,DURAKLATILDI") });
  const m = useIslem(
    () => api<any>("/hammadde/cekis", { govde: { barkod: barkodAyikla(v.barkod), miktar: v.miktar ? nokta(v.miktar) : undefined, isEmriNo: v.isEmriNo } }),
    {
      basari: (c) => `${c.birim.barkod} → ${c.makine}${c.kalanAnaAmbalaj ? ` · ana ambalajda ${sayi(c.kalanAnaAmbalaj)} kaldı` : ""}`,
      sonra: (c) => {
        setEtiket(c.etiket ? [c.birim.barkod] : []);
        setV({ ...v, barkod: "", miktar: "" });
      },
    },
  );
  return (
    <div className="space-y-4">
      <IslemFormu
        baslik="Depodan hatta çekiş"
        aciklama="Yalnızca giriş kontrolünden geçmiş (kabul) malzeme çekilir. Miktar ambalajdan azsa ambalaj bölünür ve çekilen kısma yeni etiket basılır."
        dugme="Çek"
        devreDisi={!v.barkod || !v.isEmriNo || (!!v.miktar && !sayiMi(v.miktar))}
        bekliyor={m.isPending}
        onGonder={() => m.mutate()}
      >
        <BarkodGirisi deger={v.barkod} onChange={(barkod) => setV({ ...v, barkod })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Alan etiket="İş emri">
            <select className={girdi} value={v.isEmriNo} onChange={(e) => setV({ ...v, isEmriNo: e.target.value })}>
              <option value="">Seçiniz</option>
              {ieler.data?.map((x) => (
                <option key={x.no} value={x.no}>
                  {x.no} · {x.makineKod} · {x.urunKod} ({durumAdi(x.durum)})
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="Miktar (boş = ambalajın tamamı)">
            <input className={girdi} inputMode="decimal" value={v.miktar} onChange={(e) => setV({ ...v, miktar: e.target.value })} />
          </Alan>
        </div>
      </IslemFormu>
      {etiket.length > 0 && <EtiketListesi barkodlar={etiket} baslik="Çekilen kısmın yeni etiketi" />}
    </div>
  );
}

function Iade() {
  const t = useTanimlar();
  const [v, setV] = useState({ barkod: "", kalanMiktar: "", depoYeri: "" });
  const m = useIslem(
    () => api<any>("/hammadde/iade", { govde: { barkod: barkodAyikla(v.barkod), kalanMiktar: v.kalanMiktar ? nokta(v.kalanMiktar) : undefined, depoYeri: v.depoYeri || undefined } }),
    { basari: (c) => `${c.barkod} depoya alındı (${sayi(c.miktar)} ${c.olcuBirimi})`, sonra: () => setV({ barkod: "", kalanMiktar: "", depoYeri: v.depoYeri }) },
  );
  return (
    <IslemFormu
      baslik="Hattan depoya iade"
      aciklama="İş emrine bağlı olmayan, hattaki ambalaj tartılıp depoya alınır. Tartımda eksik çıkan miktar hurda (iade eksiği) olarak yazılır. İş emrine bağlı ambalaj, iş bitirilirken iade edilir."
      dugme="İade al"
      devreDisi={!v.barkod || (!!v.kalanMiktar && !sayiMi(v.kalanMiktar))}
      bekliyor={m.isPending}
      onGonder={() => m.mutate()}
    >
      <BarkodGirisi deger={v.barkod} onChange={(barkod) => setV({ ...v, barkod })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Alan etiket="Tartılan kalan miktar (boş = değişmedi)">
          <input className={girdi} inputMode="decimal" value={v.kalanMiktar} onChange={(e) => setV({ ...v, kalanMiktar: e.target.value })} />
        </Alan>
        <Alan etiket="Depo yeri">
          <select className={girdi} value={v.depoYeri} onChange={(e) => setV({ ...v, depoYeri: e.target.value })}>
            <option value="">Belirtilmedi</option>
            {t.data?.["depo-yerleri"].filter((y) => y.tip === "RAF").map((y) => (
              <option key={y.kod} value={y.kod}>
                {y.kod} {y.ad ? `— ${tr(y.ad)}` : ""}
              </option>
            ))}
          </select>
        </Alan>
      </div>
    </IslemFormu>
  );
}

function Yerlestir() {
  const t = useTanimlar();
  const [v, setV] = useState({ barkod: "", yerKodu: "" });
  const m = useIslem(() => api<any>(`/birimler/${encodeURIComponent(barkodAyikla(v.barkod))}/yerlestir`, { govde: { yerKodu: v.yerKodu } }), {
    basari: (c) => `${c.barkod} → ${c.yer}`,
    sonra: () => setV({ ...v, barkod: "" }),
  });
  return (
    <IslemFormu
      baslik="Rafa / alana yerleştir"
      aciklama="Karantinadaki ya da karar bekleyen malzeme rafa konamaz (karantina alanına konur); şahit numune yalnızca numune dolabına konur."
      dugme="Yerleştir"
      devreDisi={!v.barkod || !v.yerKodu}
      bekliyor={m.isPending}
      onGonder={() => m.mutate()}
    >
      <BarkodGirisi deger={v.barkod} onChange={(barkod) => setV({ ...v, barkod })} />
      <Alan etiket="Yer">
        <select className={girdi} value={v.yerKodu} onChange={(e) => setV({ ...v, yerKodu: e.target.value })}>
          <option value="">Seçiniz</option>
          {t.data?.["depo-yerleri"].map((y) => (
            <option key={y.kod} value={y.kod}>
              {y.kod} · {y.tip} {y.ad ? `— ${tr(y.ad)}` : ""}
            </option>
          ))}
        </select>
      </Alan>
    </IslemFormu>
  );
}

function Bol() {
  const [v, setV] = useState({ barkod: "", parcalar: "" });
  const [etiketler, setEtiketler] = useState<string[]>([]);
  const parcalar = v.parcalar.split(/[;\s]+/).filter(Boolean).map((x) => Number(nokta(x)));
  const gecerli = parcalar.length >= 2 && parcalar.every((x) => Number.isFinite(x) && x > 0);
  const toplam = Math.round(parcalar.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0) * 1000) / 1000;
  const b = barkodAyikla(v.barkod);
  const bilgi = useQuery({ queryKey: ["barkod", b], queryFn: () => api<any>(`/barkod/${encodeURIComponent(b)}`), enabled: b.length >= 6, retry: false });
  const mevcut = bilgi.data?.birim?.miktar as number | undefined;
  const m = useIslem(() => api<any>(`/lotlar/birim/${encodeURIComponent(b)}/bol`, { govde: { parcalar } }), {
    basari: (c) => `${c.eski} ${c.yeniler.length} parçaya bölündü`,
    sonra: (c) => {
      setEtiketler(c.yeniler.map((x: any) => x.barkod));
      setV({ barkod: "", parcalar: "" });
    },
  });
  return (
    <div className="space-y-4">
      <IslemFormu
        baslik="Yeniden kesim (bölme)"
        aciklama="Serbest ya da depodaki makara yeni boylara kesilir. Her parçaya aynı lot altında yeni barkod verilir; artan boy kesim firesi olarak hurdaya yazılır."
        dugme="Kes ve etiket bas"
        devreDisi={!b || !gecerli || (mevcut !== undefined && toplam > mevcut)}
        bekliyor={m.isPending}
        onGonder={() => m.mutate()}
      >
        <BarkodGirisi deger={v.barkod} onChange={(barkod) => setV({ ...v, barkod })} />
        <Alan etiket="Parça boyları (boşluk ya da ; ile)" ipucu="Örnek: 50 50 ya da 20;29,5">
          <input className={girdi} value={v.parcalar} onChange={(e) => setV({ ...v, parcalar: e.target.value })} placeholder="50 50" />
        </Alan>
        {gecerli && mevcut !== undefined && (
          <div className={cn("rounded-lg px-3 py-2 text-sm", toplam > mevcut ? "bg-sorun-acik text-unity-koyu" : "bg-tas-50 text-tas-600")}>
            {parcalar.length} parça · toplam {sayi(toplam, 3)} · mevcut {sayi(mevcut, 3)} →{" "}
            {toplam > mevcut ? <b>toplam mevcut boydan fazla</b> : <>fire {sayi(Math.round((mevcut - toplam) * 1000) / 1000, 3)}</>}
          </div>
        )}
      </IslemFormu>
      {etiketler.length > 0 && <EtiketListesi barkodlar={etiketler} />}
    </div>
  );
}

function Hurda() {
  const [v, setV] = useState({ barkod: "", miktar: "", neden: "" });
  const m = useIslem(
    () => api<any>("/kalite/hurda", { govde: { barkod: barkodAyikla(v.barkod), miktar: v.miktar ? nokta(v.miktar) : undefined, neden: v.neden } }),
    { basari: (c) => `${c.barkod}: ${sayi(c.hurda)} hurdaya yazıldı, kalan ${sayi(c.kalan)}`, sonra: () => setV({ barkod: "", miktar: "", neden: "" }) },
  );
  return (
    <IslemFormu
      baslik="Doğrudan hurda"
      aciklama="Hammadde ya da mamulün bir kısmı veya tamamı hurdaya ayrılır. Sevk edilmiş, sevkiyata ayrılmış ya da makineye bağlı birim hurdaya ayrılamaz."
      dugme="Hurdaya yaz"
      devreDisi={!v.barkod || v.neden.trim().length < 3 || (!!v.miktar && !sayiMi(v.miktar))}
      bekliyor={m.isPending}
      onGonder={() => m.mutate()}
    >
      <BarkodGirisi deger={v.barkod} onChange={(barkod) => setV({ ...v, barkod })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Alan etiket="Miktar (boş = tamamı)">
          <input className={girdi} inputMode="decimal" value={v.miktar} onChange={(e) => setV({ ...v, miktar: e.target.value })} />
        </Alan>
        <Alan etiket="Neden">
          <input className={girdi} value={v.neden} onChange={(e) => setV({ ...v, neden: e.target.value })} placeholder="Uç kısmı ezik" />
        </Alan>
      </div>
    </IslemFormu>
  );
}

function EtiketBas() {
  const [v, setV] = useState({ barkod: "", neden: "" });
  const [basilan, setBasilan] = useState<string[]>([]);
  const m = useIslem(() => api<any>(`/birimler/${encodeURIComponent(barkodAyikla(v.barkod))}/etiket`, { govde: { neden: v.neden } }), {
    basari: (c) => `Kopya ${c.kopyaNo} hazır`,
    sonra: () => {
      setBasilan([barkodAyikla(v.barkod)]);
      setV({ barkod: "", neden: "" });
    },
  });
  return (
    <div className="space-y-4">
      <IslemFormu
        baslik="Etiketi yeniden bas"
        aciklama="Yıpranan ya da kaybolan etiket aynı barkodla yeniden basılır; kaçıncı kopya olduğu ve nedeni kayda geçer."
        dugme="Yeniden bas"
        devreDisi={!v.barkod || v.neden.trim().length < 3}
        bekliyor={m.isPending}
        onGonder={() => m.mutate()}
      >
        <BarkodGirisi deger={v.barkod} onChange={(barkod) => setV({ ...v, barkod })} />
        <Alan etiket="Neden (zorunlu)">
          <input className={girdi} value={v.neden} onChange={(e) => setV({ ...v, neden: e.target.value })} placeholder="Etiket yırtıldı" />
        </Alan>
      </IslemFormu>
      {basilan.length > 0 && <EtiketListesi barkodlar={basilan} baslik="Yeniden basılan etiket" />}
    </div>
  );
}
