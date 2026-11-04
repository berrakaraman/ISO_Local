// F-01 Hammadde Giris: gercek mal kabul + giris kontrolu (onay akisi) + etiket + urun hikayesi.
// Kayit silinmez; iptal edilir (gerekce zorunlu). Her satirda kim kaydetti, kim onayladi gorunur.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, FileCheck2, GitBranch, Loader2, Plus, Printer, Tag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import { OnayIslemleri } from "@/components/iso/OnayIslemleri";
import { OnayRozeti } from "@/components/iso/StatusBadge";
import { IptalPenceresi } from "@/components/iso/IptalPenceresi";
import { KayitGecmisi, type GecmisSatiri } from "@/components/iso/KayitGecmisi";
import { EtiketOnizleme } from "@/components/barkod/Etiket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTable } from "@/lib/iso-data";
import { api, hataMesaji } from "@/lib/api";
import { rolVar, useOturum } from "@/lib/oturum";
import { useKisiler, type OnayDurum } from "@/lib/onay";
import { durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/hammadde")({ component: HammaddeGiris });

type LotSatiri = {
  id: string;
  no: string;
  durum: string;
  tedarikciLot: string | null;
  coaVar: boolean | null;
  olusturmaZamani: string;
  malzemeKod: string;
  malzemeAd: string;
  olcuBirimi: string;
  tedarikci: string | null;
  olusturanAd: string | null;
  iptalZamani: string | null;
  iptalGerekcesi: string | null;
  iptalEdenAd: string | null;
  ambalajSayisi: number;
  girisMiktari: number;
  kalanMiktar: number;
  blokeVar: boolean;
  depoYeri: string | null;
  ilkBarkod: string | null;
  onayId: string | null;
  onayDurum: OnayDurum | null;
  onayAtananId: string | null;
  onayAtananAd: string | null;
  onayKararZamani: string | null;
  onayKararNotu: string | null;
  onayKararVerenAd: string | null;
};

type Birim = {
  barkod: string;
  ilkMiktar: number;
  miktar: number;
  olcuBirimi: string;
  durum: string;
  bloke: boolean;
  yer: string | null;
  kaynakBirimId: string | null;
  bagliIsEmri: string | null;
};

type Tanimlar = {
  malzemeler: { id: string; kod: string; ad: string; olcuBirimi: string }[];
  tedarikciler: { id: string; unvan: string; onayDurumu: string }[];
  "depo-yerleri": { kod: string; ad: string | null; tip: string }[];
};

const onayOzeti = (l: LotSatiri) =>
  l.onayId && l.onayDurum && l.onayAtananId
    ? {
        id: l.onayId,
        durum: l.onayDurum,
        atananId: l.onayAtananId,
        atananAd: l.onayAtananAd,
        kararVerenAd: l.onayKararVerenAd,
        kararZamani: l.onayKararZamani,
        kararNotu: l.onayKararNotu,
      }
    : null;

function HammaddeGiris() {
  const table = getTable("hammadde")!;
  const oturum = useOturum();
  const yazabilir = rolVar(oturum, "DEPO", "KALITE");
  const arama = Route.useSearch() as { ac?: string };

  const [yeniAcik, setYeniAcik] = useState(false);
  const [secili, setSecili] = useState<string | null>(arama.ac || null);
  const [iptalNo, setIptalNo] = useState<string | null>(null);

  // Gorevlerim'den gelindiyse ilgili kaydi ac
  useEffect(() => {
    if (arama.ac) setSecili(arama.ac);
  }, [arama.ac]);

  const lotlar = useQuery({
    queryKey: ["hammadde", "lotlar"],
    queryFn: () => api<LotSatiri[]>("/hammadde/lotlar"),
    refetchInterval: 30_000,
  });

  const satirlar: KayitSatiri[] = useMemo(
    () =>
      (lotlar.data || []).map((l) => ({
        anahtar: l.no,
        veri: {
          "Giriş Tarihi": l.olusturmaZamani,
          "Lot No": l.no,
          "Hammadde Kodu": l.malzemeKod,
          "Hammadde Adı": tr(l.malzemeAd),
          "Tedarikçi": tr(l.tedarikci),
          "Tedarikçi Lot No": l.tedarikciLot,
          Ambalaj: l.ambalajSayisi,
          "Giriş Miktarı": l.girisMiktari,
          "Kalan Miktar": l.kalanMiktar,
          Birim: l.olcuBirimi,
          "Depo Yeri": l.depoYeri,
          "Giriş Kontrolü": durumAdi(l.durum) + (l.blokeVar ? " · bloke" : ""),
        },
        baglantilar: { "Lot No": l.no },
        akis: l.no,
        barkodlar: l.ilkBarkod ? [l.ilkBarkod] : [],
        kaydeden: { ad: l.olusturanAd, zaman: l.olusturmaZamani },
        onay: onayOzeti(l),
        iptal: l.durum === "IPTAL" ? { ad: l.iptalEdenAd, zaman: l.iptalZamani, gerekce: l.iptalGerekcesi } : null,
      })),
    [lotlar.data],
  );

  const seciliLot = lotlar.data?.find((l) => l.no === secili) || null;

  return (
    <div className="animate-belir">
      <PageHeader eyebrow={table.code} title={table.title} description={table.description} />
      <div className="p-8">
        <KayitTablosu
          table={table}
          satirlar={satirlar}
          onayTuru="HAMMADDE"
          yukleniyor={lotlar.isLoading}
          hata={lotlar.isError ? hataMesaji(lotlar.error, "Liste yüklenemedi.") : null}
          onSatir={(s) => setSecili(s.anahtar)}
          onIptal={yazabilir ? (s) => setIptalNo(s.anahtar) : undefined}
          araclar={
            yazabilir && (
              <Button onClick={() => setYeniAcik(true)} className="h-10 gap-2 bg-unity px-4 font-semibold hover:bg-unity-koyu">
                <Plus className="h-4 w-4" /> Yeni Kayıt
              </Button>
            )
          }
        />
      </div>

      <YeniKabul acik={yeniAcik} kapat={() => setYeniAcik(false)} />
      <LotAyrinti
        lot={seciliLot}
        kayitNo={secili}
        kapat={() => setSecili(null)}
        iptalEt={yazabilir ? (no) => setIptalNo(no) : undefined}
      />
      {iptalNo && (
        <IptalPenceresi kayitNo={iptalNo} yol={`/hammadde/lotlar/${iptalNo}/iptal`} acik={!!iptalNo} kapat={() => setIptalNo(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Yeni mal kabul
// ---------------------------------------------------------------------------------
const girdi =
  "h-10 w-full rounded-lg border border-tas-300 bg-white px-3 text-sm text-murekkep outline-none transition placeholder:text-tas-400 focus:border-unity focus:ring-2 focus:ring-unity/15 disabled:bg-tas-50";

function Alan({ etiket, ipucu, children, genis }: { etiket: string; ipucu?: string; children: ReactNode; genis?: boolean }) {
  return (
    <label className={cn("block space-y-1.5", genis && "sm:col-span-2")}>
      <span className="text-xs font-semibold uppercase tracking-wider text-tas-500">{etiket}</span>
      {children}
      {ipucu && <span className="block text-[11px] text-tas-400">{ipucu}</span>}
    </label>
  );
}

type KabulCevabi = { lot: { no: string }; birimler: { barkod: string; ilkMiktar: number; olcuBirimi: string }[] };

function YeniKabul({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const qc = useQueryClient();
  const tanim = useQuery({ queryKey: ["tanimlar"], queryFn: () => api<Tanimlar>("/tanimlar"), enabled: acik });
  const kisiler = useKisiler("KALITE");

  const bos = { malzemeId: "", tedarikciId: "", tedarikciLot: "", depoYeri: "", coaVar: true, aciklama: "", atananId: "" };
  const [f, setF] = useState(bos);
  const [adet, setAdet] = useState(1);
  const [standart, setStandart] = useState("");
  const [miktarlar, setMiktarlar] = useState<string[]>([""]);
  const [sonuc, setSonuc] = useState<KabulCevabi | null>(null);
  const [etiketBarkod, setEtiketBarkod] = useState<string | null>(null);

  const malzeme = tanim.data?.malzemeler.find((m) => m.id === f.malzemeId);
  const birim = malzeme?.olcuBirimi || "kg";
  const toplam = miktarlar.reduce((a, x) => a + (Number(String(x).replace(",", ".")) || 0), 0);

  // Ambalaj sayisi ya da standart miktar degisince listeyi yeniden doldur
  const adetDegis = (n: number) => {
    const yeni = Math.max(1, Math.min(200, Math.floor(n) || 1));
    setAdet(yeni);
    setMiktarlar((eski) => Array.from({ length: yeni }, (_, i) => eski[i] ?? standart));
  };
  const standartDegis = (v: string) => {
    setStandart(v);
    setMiktarlar(Array.from({ length: adet }, () => v));
  };

  const sifirla = () => {
    setF(bos);
    setAdet(1);
    setStandart("");
    setMiktarlar([""]);
    setSonuc(null);
    setEtiketBarkod(null);
  };

  const kaydet = useMutation({
    mutationFn: () =>
      api<KabulCevabi>("/hammadde/kabul", {
        govde: {
          malzemeId: f.malzemeId,
          tedarikciId: f.tedarikciId,
          tedarikciLot: f.tedarikciLot.trim(),
          coaVar: f.coaVar,
          depoYeri: f.depoYeri || undefined,
          aciklama: f.aciklama.trim() || undefined,
          atananId: f.atananId,
          ambalajlar: miktarlar.map((x) => String(x).replace(",", ".")),
        },
      }),
    onSuccess: (c) => {
      setSonuc(c);
      setEtiketBarkod(c.birimler[0]?.barkod || null);
      toast.success(`${c.lot.no} kaydedildi, ${c.birimler.length} etiket hazır.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Kayıt yapılamadı.")),
  });

  const eksik =
    !f.malzemeId || !f.tedarikciId || !f.tedarikciLot.trim() || !f.atananId || miktarlar.some((x) => !(Number(String(x).replace(",", ".")) > 0));

  const kapatVeSifirla = () => {
    if (kaydet.isPending) return;
    kapat();
    setTimeout(sifirla, 200);
  };

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && kapatVeSifirla()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0">
        <div className="relative overflow-hidden border-b border-tas-200 px-6 pb-4 pt-5">
          <DialogHeader>
            <div className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-unity">F-01 · Hammadde Giriş</div>
            <DialogTitle className="font-display text-3xl font-bold italic text-murekkep">
              {sonuc ? `${sonuc.lot.no} kaydedildi` : "Yeni mal kabul"}
            </DialogTitle>
            <DialogDescription>
              {sonuc
                ? "Etiketleri basıp her ambalaja yapıştırın. Giriş kontrolü onayı seçtiğiniz kişiye gönderildi."
                : "Her ambalaja ayrı barkod verilir. Kayıt, giriş kontrolü için seçtiğiniz kalite sorumlusuna onaya gider."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {!sonuc ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!eksik) kaydet.mutate();
            }}
            className="grid gap-4 px-6 pb-6 sm:grid-cols-2"
          >
            {tanim.isError && (
              <p className="text-sm text-unity sm:col-span-2">{hataMesaji(tanim.error, "Tanımlar yüklenemedi.")}</p>
            )}
            <Alan etiket="Hammadde">
              <select className={girdi} value={f.malzemeId} onChange={(e) => setF({ ...f, malzemeId: e.target.value })} required>
                <option value="">Seçiniz</option>
                {tanim.data?.malzemeler.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.kod} — {tr(m.ad)}
                  </option>
                ))}
              </select>
            </Alan>
            <Alan etiket="Tedarikçi">
              <select className={girdi} value={f.tedarikciId} onChange={(e) => setF({ ...f, tedarikciId: e.target.value })} required>
                <option value="">Seçiniz</option>
                {tanim.data?.tedarikciler.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.onayDurumu === "ASKIDA"}>
                    {tr(t.unvan)}
                    {t.onayDurumu === "ASKIDA" ? " (askıda, kabul yapılamaz)" : t.onayDurumu === "SARTLI" ? " (şartlı)" : ""}
                  </option>
                ))}
              </select>
            </Alan>
            <Alan etiket="Tedarikçi lot no" ipucu="Tedarikçinin ambalaj üzerindeki parti numarası">
              <input className={girdi} value={f.tedarikciLot} onChange={(e) => setF({ ...f, tedarikciLot: e.target.value })} required />
            </Alan>
            <Alan etiket="Depo yeri">
              <select className={girdi} value={f.depoYeri} onChange={(e) => setF({ ...f, depoYeri: e.target.value })}>
                <option value="">Belirtilmedi</option>
                {tanim.data?.["depo-yerleri"]
                  .filter((y) => y.tip === "RAF")
                  .map((y) => (
                    <option key={y.kod} value={y.kod}>
                      {y.kod}
                      {y.ad ? ` — ${tr(y.ad)}` : ""}
                    </option>
                  ))}
              </select>
            </Alan>

            <div className="rounded-xl border border-tas-200 bg-tas-50 p-4 sm:col-span-2">
              <div className="grid gap-4 sm:grid-cols-3">
                <Alan etiket="Ambalaj sayısı">
                  <input className={girdi} type="number" min={1} max={200} value={adet} onChange={(e) => adetDegis(Number(e.target.value))} />
                </Alan>
                <Alan etiket={`Ambalaj başı (${birim})`} ipucu="Hepsine aynı miktarı yazar">
                  <input className={girdi} inputMode="decimal" value={standart} onChange={(e) => standartDegis(e.target.value)} placeholder="25" />
                </Alan>
                <div className="flex flex-col justify-end pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-tas-500">Toplam giriş</span>
                  <span className="sayi font-display text-3xl font-bold text-murekkep">
                    {sayi(toplam)} <span className="text-base text-tas-400">{birim}</span>
                  </span>
                </div>
              </div>
              {adet > 1 && (
                <div className="mt-3">
                  <span className="text-[11px] text-tas-400">Tartıda farklı çıkan ambalajı düzeltin:</span>
                  <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {miktarlar.map((m, i) => (
                      <label key={i} className="block">
                        <span className="font-mono text-[10px] text-tas-400">-{String(i + 1).padStart(2, "0")}</span>
                        <input
                          className={cn(girdi, "h-8 px-2 text-right text-xs")}
                          inputMode="decimal"
                          value={m}
                          onChange={(e) => setMiktarlar(miktarlar.map((x, j) => (j === i ? e.target.value : x)))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-sm text-murekkep sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-[#ed1c24]" checked={f.coaVar} onChange={(e) => setF({ ...f, coaVar: e.target.checked })} />
              Analiz sertifikası (CoA) geldi
            </label>
            <Alan etiket="Açıklama" genis>
              <input className={girdi} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} placeholder="İsteğe bağlı" />
            </Alan>

            <div className="border-t border-tas-200 pt-4 sm:col-span-2">
              <Alan etiket="Giriş kontrolünü onaylayacak sorumlu" ipucu="Yalnızca kalite yetkisi olan kişiler listelenir">
                <select className={girdi} value={f.atananId} onChange={(e) => setF({ ...f, atananId: e.target.value })} required>
                  <option value="">Seçiniz</option>
                  {kisiler.data?.map((k) => (
                    <option key={k.id} value={k.id}>
                      {tr(k.adSoyad)}
                    </option>
                  ))}
                </select>
              </Alan>
            </div>

            <div className="flex items-center justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={kapatVeSifirla}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={eksik || kaydet.isPending} className="gap-2 bg-unity font-semibold hover:bg-unity-koyu">
                {kaydet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                Kaydet ve etiketleri oluştur
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 px-6 pb-6">
            <div className="flex flex-wrap gap-1.5">
              {sonuc.birimler.map((b) => (
                <button
                  key={b.barkod}
                  onClick={() => setEtiketBarkod(b.barkod)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition",
                    etiketBarkod === b.barkod ? "border-murekkep bg-murekkep text-white" : "border-tas-200 text-tas-600 hover:border-unity hover:text-unity",
                  )}
                >
                  {b.barkod} · {sayi(b.ilkMiktar)} {b.olcuBirimi}
                </button>
              ))}
            </div>
            {etiketBarkod && <EtiketOnizleme barkod={etiketBarkod} />}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-tas-200 pt-4">
              <Link
                to="/izle/$barkod"
                params={{ barkod: sonuc.lot.no }}
                className="flex h-9 items-center gap-1.5 rounded-md border border-tas-300 px-3 text-sm font-semibold text-murekkep hover:border-unity hover:text-unity"
              >
                <GitBranch className="h-4 w-4" /> Ürün hikâyesi
              </Link>
              <Button variant="outline" onClick={sifirla} className="gap-1.5">
                <Plus className="h-4 w-4" /> Yeni kayıt daha
              </Button>
              <Button onClick={kapatVeSifirla} className="gap-1.5">
                <Check className="h-4 w-4" /> Tamam
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------
// Kayit ayrintisi: ambalajlar, onay, kim ne yapti
// ---------------------------------------------------------------------------------
function LotAyrinti({
  lot,
  kayitNo,
  kapat,
  iptalEt,
}: {
  lot: LotSatiri | null;
  kayitNo: string | null;
  kapat: () => void;
  iptalEt?: (no: string) => void;
}) {
  const no = kayitNo || "";
  const acik = !!kayitNo;
  const ayrinti = useQuery({
    queryKey: ["hammadde", "lot", no],
    queryFn: () => api<{ birimler: Birim[] }>(`/hammadde/lotlar/${encodeURIComponent(no)}`),
    enabled: acik,
  });
  const gecmis = useQuery({
    queryKey: ["hammadde", "gecmis", no],
    queryFn: () => api<GecmisSatiri[]>(`/hammadde/lotlar/${encodeURIComponent(no)}/gecmis`),
    enabled: acik,
  });
  const [etiket, setEtiket] = useState<string | null>(null);
  useEffect(() => setEtiket(null), [kayitNo]);

  const onay = lot ? onayOzeti(lot) : null;
  const iptal = lot?.durum === "IPTAL";

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="border-b border-tas-200 px-6 pb-4 pt-5">
          <DialogHeader>
            <div className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-unity">F-01 · Hammadde lotu</div>
            <DialogTitle className={cn("font-mono text-2xl font-bold text-murekkep", iptal && "line-through decoration-unity")}>{no}</DialogTitle>
            <DialogDescription>
              {lot ? `${lot.malzemeKod} ${tr(lot.malzemeAd)} · ${tr(lot.tedarikci)} · tedarikçi lot ${lot.tedarikciLot}` : "Yükleniyor…"}
            </DialogDescription>
          </DialogHeader>
          {lot && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                to="/izle/$barkod"
                params={{ barkod: no }}
                className="flex h-9 items-center gap-1.5 rounded-md bg-murekkep px-3 text-sm font-semibold text-white hover:bg-unity"
              >
                <GitBranch className="h-4 w-4" /> Akış diyagramı ve bakiye
              </Link>
              {!iptal && iptalEt && (
                <Button variant="outline" onClick={() => iptalEt(no)} className="gap-1.5 text-unity hover:text-unity-koyu">
                  <Ban className="h-4 w-4" /> İptal et
                </Button>
              )}
            </div>
          )}
        </div>

        {lot && (
          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-5">
              {iptal && (
                <div className="rounded-lg border border-murekkep/15 bg-tas-100 px-4 py-3 text-sm">
                  <div className="flex items-center gap-1.5 font-semibold text-murekkep">
                    <Ban className="h-4 w-4 text-unity" /> İptal edildi — kayıt silinmedi
                  </div>
                  <div className="mt-0.5 text-tas-600">
                    {tr(lot.iptalEdenAd)} · {tarihSaat(lot.iptalZamani)}
                  </div>
                  <div className="mt-1 text-tas-600">Gerekçe: {tr(lot.iptalGerekcesi)}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Giriş", `${sayi(lot.girisMiktari)} ${lot.olcuBirimi}`],
                  ["Kalan", `${sayi(lot.kalanMiktar)} ${lot.olcuBirimi}`],
                  ["Ambalaj", String(lot.ambalajSayisi)],
                  ["CoA", lot.coaVar ? "Var" : lot.coaVar === false ? "Yok" : "—"],
                ].map(([e, d]) => (
                  <div key={e} className="rounded-lg border border-tas-200 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-tas-400">{e}</div>
                    <div className="sayi font-display text-xl font-bold text-murekkep">{d}</div>
                  </div>
                ))}
              </div>

              <section>
                <h3 className="mb-2 font-display text-lg font-bold text-murekkep">Ambalajlar</h3>
                <div className="overflow-hidden rounded-lg border border-tas-200">
                  <table className="w-full text-sm">
                    <thead className="bg-tas-50 text-left text-[11px] font-bold uppercase tracking-wider text-tas-500">
                      <tr>
                        <th className="px-3 py-2">Barkod</th>
                        <th className="px-3 py-2 text-right">Miktar</th>
                        <th className="px-3 py-2">Durum</th>
                        <th className="px-3 py-2">Nerede</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tas-100">
                      {ayrinti.isLoading && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center">
                            <Loader2 className="mx-auto h-4 w-4 animate-spin text-tas-400" />
                          </td>
                        </tr>
                      )}
                      {ayrinti.data?.birimler.map((b) => (
                        <tr key={b.barkod} className={cn(etiket === b.barkod && "bg-unity-acik")}>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Link
                              to="/izle/$barkod"
                              params={{ barkod: b.barkod }}
                              className="font-mono text-xs font-semibold text-murekkep underline decoration-tas-300 underline-offset-4 hover:text-unity"
                            >
                              {b.barkod}
                            </Link>
                            {b.kaynakBirimId && <span className="ml-1.5 text-[10px] text-tas-400">bölündü</span>}
                          </td>
                          <td className="sayi whitespace-nowrap px-3 py-2 text-right">
                            {sayi(b.miktar)}
                            <span className="text-tas-400"> / {sayi(b.ilkMiktar)} {b.olcuBirimi}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-tas-600">
                            {durumAdi(b.durum)}
                            {b.bloke && <span className="ml-1 font-semibold text-unity">· bloke</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-tas-500">{b.bagliIsEmri ? `İş emri ${b.bagliIsEmri}` : (b.yer || "—").replace(/^DEPO:/, "Depo ").replace(/^HAT:/, "Makine ")}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => setEtiket(etiket === b.barkod ? null : b.barkod)}
                              title="Etiketi göster"
                              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-tas-500 hover:bg-tas-100 hover:text-unity"
                            >
                              <Printer className="h-3.5 w-3.5" /> Etiket
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {etiket && (
                  <div className="mt-3">
                    <EtiketOnizleme barkod={etiket} />
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-xl border border-tas-200 p-4">
                <h3 className="mb-2 flex items-center gap-1.5 font-display text-lg font-bold text-murekkep">
                  <FileCheck2 className="h-4 w-4 text-unity" /> Giriş kontrolü onayı
                </h3>
                {onay ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-tas-500">Sorumlu</span>
                      <span className="font-semibold text-murekkep">{tr(onay.atananAd)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-tas-500">Durum</span>
                      <OnayRozeti durum={onay.durum} />
                    </div>
                    {onay.kararVerenAd && (
                      <div className="rounded-lg bg-tas-50 px-3 py-2 text-xs text-tas-600">
                        <span className="font-semibold text-murekkep">{tr(onay.kararVerenAd)}</span> · {tarihSaat(onay.kararZamani)}
                        {onay.kararNotu && <div className="mt-0.5">“{tr(onay.kararNotu)}”</div>}
                      </div>
                    )}
                    {!iptal && (
                      <div className="pt-1">
                        <OnayIslemleri onay={onay} tur="HAMMADDE" kayitNo={no} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-tas-400">Bu kayıt onaya gönderilmemiş (eski kayıt).</p>
                )}
              </section>

              <section className="rounded-xl border border-tas-200 p-4">
                <h3 className="mb-3 font-display text-lg font-bold text-murekkep">Kim ne yaptı</h3>
                <KayitGecmisi satirlar={gecmis.data} yukleniyor={gecmis.isLoading} />
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
