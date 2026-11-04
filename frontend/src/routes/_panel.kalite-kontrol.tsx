// F-05 Kalite Kontrol: ilk parca ve metraj (proses) olcumleri + son kontrol kararlari; kim yapti.
// Ustte "Kalitenin bekleyen isleri": tiklayinca ilgili formda kayit acilir ve islem orada yapilir.
// Bloke: secilen barkodlar kilitlenir (sevk edilemez, kullanilamaz); kaldirma gerekceyle yapilir.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Lock, LockOpen, ShieldBan } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import { Alan, PencereBasligi, girdi } from "@/components/iso/FormParcalari";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getTable } from "@/lib/iso-data";
import { api, hataMesaji } from "@/lib/api";
import { rolVar, useOturum } from "@/lib/oturum";
import { sayi, tarihSaat, tr } from "@/lib/sozluk";
import { barkodAyikla } from "@/components/izle/BarkodArama";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/kalite-kontrol")({ component: KaliteKontrol });

type Kontrol = {
  anahtar: string; zaman: string; tur: string; parametre: string | null; altSinir: number | null; ustSinir: number | null; nominal: number | null;
  olcuBirimi: string | null; deger: string | null; sonuc: string; denemeNo: number | null; isEmriNo: string | null; makineKod: string | null;
  urunKod: string | null; lotNo: string | null; barkod: string | null; kontrolEden: string | null; aciklama: string | null;
};
type Bekleyenler = {
  ilkParca: { no: string; urunKod: string; makineKod: string; baslangic: string }[];
  karantina: { barkod: string; ilkMiktar: number; olcuBirimi: string; isEmriNo: string; makineKod: string }[];
  sonKontrol: { lotNo: string; urunKod: string; parca: number; toplam: number }[];
  hammaddeKontrol: { lotNo: string; malzemeKod: string; tedarikci: string }[];
};

const TUR: Record<string, string> = { ILK_PARCA: "İlk parça", METRAJ: "Proses (metraj)", PROSES: "Proses", SON_KONTROL: "Son kontrol" };
const KARAR: Record<string, string> = { UYGUN: "Uygun", UYGUN_DEGIL: "Uygun Değil", SARTLI: "Karantina" };

function KaliteKontrol() {
  const table = getTable("kalite-kontrol")!;
  const oturum = useOturum();
  const kalite = rolVar(oturum, "KALITE");
  const [bloke, setBloke] = useState(false);
  const liste = useQuery({ queryKey: ["kontroller"], queryFn: () => api<Kontrol[]>("/kalite/kontroller"), refetchInterval: 30_000 });

  const satirlar: KayitSatiri[] = useMemo(
    () =>
      (liste.data || []).map((k) => {
        const spes =
          k.tur === "SON_KONTROL"
            ? "Kontrol planı"
            : `${k.altSinir ?? "–"} … ${k.ustSinir ?? "–"}${k.olcuBirimi ? ` ${k.olcuBirimi}` : ""}${k.nominal !== null ? ` (nominal ${k.nominal})` : ""}`;
        const deger = k.tur === "SON_KONTROL" ? (k.deger === "SERBEST" ? "Serbest bırakıldı" : k.deger === "RET" ? "Reddedildi" : "Karantinaya alındı") : `${sayi(Number(k.deger), 4)}${k.olcuBirimi ? ` ${k.olcuBirimi}` : ""}`;
        return {
          anahtar: k.anahtar,
          veri: {
            "Tarih/Saat": k.zaman,
            "Ürün Kodu": k.urunKod,
            "Lot No": k.lotNo || (k.isEmriNo ? `${k.isEmriNo} (ilk parça)` : null),
            Makine: k.makineKod,
            "Kontrol Türü": TUR[k.tur] || k.tur,
            "Kontrol Parametresi": `${tr(k.parametre)}${k.denemeNo ? ` · ${k.denemeNo}. deneme` : ""}`,
            Spesifikasyon: spes,
            "Ölçülen Değer/Sonuç": deger,
            Karar: KARAR[k.sonuc] || k.sonuc,
            "Kontrol Eden": tr(k.kontrolEden),
            Açıklama: tr(k.aciklama),
          },
          baglantilar: k.lotNo ? { "Lot No": k.lotNo } : undefined,
          akis: k.lotNo || undefined,
          kaydeden: { ad: k.kontrolEden, zaman: k.zaman },
        };
      }),
    [liste.data],
  );

  return (
    <div className="animate-belir">
      <PageHeader eyebrow={table.code} title={table.title} description={table.description} />
      <div className="space-y-6 p-8">
        <Bekleyenler />
        <KayitTablosu
          table={table}
          satirlar={satirlar}
          onayTuru="KALITE"
          onaySutunlariYok
          yukleniyor={liste.isLoading}
          hata={liste.isError ? hataMesaji(liste.error, "Liste yüklenemedi.") : null}
          bosMesaj="Henüz ölçüm yok. İlk parça kontrolü F-02'de, metraj ölçümü F-03'te kesimle birlikte girilir."
          araclar={
            <Button variant="outline" onClick={() => setBloke(true)} className="h-10 gap-2 font-semibold">
              <ShieldBan className="h-4 w-4 text-unity" /> Bloke işlemleri
            </Button>
          }
        />
      </div>
      {bloke && <BlokePenceresi yazabilir={kalite} kapat={() => setBloke(false)} />}
    </div>
  );
}

function Bekleyenler() {
  const b = useQuery({ queryKey: ["kalite", "bekleyenler"], queryFn: () => api<Bekleyenler>("/kalite/bekleyenler"), refetchInterval: 20_000 });
  const kolon = (baslik: string, sayiDegeri: number, ogeler: { anahtar: string; ust: string; alt: string; yol: string }[]) => (
    <div className="min-w-0 rounded-xl border border-tas-200 bg-white">
      <div className="flex items-center justify-between border-b border-tas-100 px-4 py-2.5">
        <span className="text-sm font-semibold text-murekkep">{baslik}</span>
        <span className={cn("rounded-full px-2 text-xs font-bold", sayiDegeri ? "bg-unity text-white" : "bg-tas-100 text-tas-500")}>{sayiDegeri}</span>
      </div>
      <ul className="max-h-48 divide-y divide-tas-100 overflow-y-auto">
        {ogeler.map((o) => (
          <li key={o.anahtar}>
            <Link to={o.yol as any} search={{ ac: o.anahtar } as any} className="group flex items-center gap-2 px-4 py-2 hover:bg-tas-50">
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs font-semibold text-murekkep">{o.ust}</span>
                <span className="block truncate text-[11px] text-tas-400">{o.alt}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-tas-300 group-hover:text-unity" />
            </Link>
          </li>
        ))}
        {!ogeler.length && <li className="px-4 py-3 text-xs text-tas-400">Bekleyen yok</li>}
      </ul>
    </div>
  );
  const d = b.data;
  return (
    <div>
      <h2 className="mb-3 font-display text-xl font-bold text-murekkep">Kalitenin bekleyen işleri</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kolon("Hammadde giriş kontrolü", d?.hammaddeKontrol.length ?? 0, (d?.hammaddeKontrol || []).map((x) => ({ anahtar: x.lotNo, ust: x.lotNo, alt: `${x.malzemeKod} · ${tr(x.tedarikci)}`, yol: "/tablo/hammadde" })))}
        {kolon("İlk parça onayı", d?.ilkParca.length ?? 0, (d?.ilkParca || []).map((x) => ({ anahtar: x.no, ust: x.no, alt: `${x.urunKod} · ${x.makineKod} · ${tarihSaat(x.baslangic)}`, yol: "/tablo/uretim-emri" })))}
        {kolon("Son kontrol", d?.sonKontrol.length ?? 0, (d?.sonKontrol || []).map((x) => ({ anahtar: x.lotNo, ust: x.lotNo, alt: `${x.urunKod} · ${x.parca} parça · ${sayi(x.toplam)} m`, yol: "/tablo/uretim-lot" })))}
        {kolon("Karantina kararı", d?.karantina.length ?? 0, (d?.karantina || []).map((x) => ({ anahtar: x.barkod, ust: x.barkod, alt: `${sayi(x.ilkMiktar)} ${x.olcuBirimi} · ${x.isEmriNo} · ${x.makineKod}`, yol: "/tablo/karantina-red" })))}
      </div>
    </div>
  );
}

type Bloke = { id: string; neden: string; acilmaZamani: string; kapanmaZamani: string | null; acanAd: string | null; kapatanAd: string | null; birimSayisi: number };

function BlokePenceresi({ yazabilir, kapat }: { yazabilir: boolean; kapat: () => void }) {
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["blokeler"], queryFn: () => api<Bloke[]>("/kalite/blokeler") });
  const [barkodlar, setBarkodlar] = useState("");
  const [neden, setNeden] = useState("");
  const [kaldir, setKaldir] = useState<Bloke | null>(null);
  const [gerekce, setGerekce] = useState("");
  const liste_ = barkodlar.split(/[\s,;]+/).map(barkodAyikla).filter(Boolean);

  const ac = useMutation({
    mutationFn: () => api<any>("/kalite/bloke", { govde: { barkodlar: liste_, neden: neden.trim() } }),
    onSuccess: (c) => {
      toast.success(`${c.blokeEdilen} barkod bloke edildi.`);
      if (c.sevkEdilmisOlanlar?.length) toast.warning(`Dikkat: ${c.sevkEdilmisOlanlar.join(", ")} zaten sevk edilmiş. Müşteriye bilgi verin.`);
      setBarkodlar("");
      setNeden("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Bloke edilemedi.")),
  });
  const kapatM = useMutation({
    mutationFn: () => api<any>(`/kalite/bloke/${kaldir!.id}/kaldir`, { govde: { gerekce: gerekce.trim() } }),
    onSuccess: (c) => {
      toast.success(`Bloke kaldırıldı (${c.kaldirilan} barkod).`);
      setKaldir(null);
      setGerekce("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Kaldırılamadı.")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0">
        <PencereBasligi ust="F-05 · Kalite Kontrol" baslik="Bloke işlemleri" aciklama="Bloke edilen parça kullanılamaz ve sevk edilemez. Bloke kayıtları silinmez; kaldırma gerekçesiyle kapanır." />
        <div className="grid gap-6 px-6 pb-6 md:grid-cols-[1fr_1.2fr]">
          {yazabilir ? (
            <div className="space-y-3">
              <div className="font-display text-lg font-bold text-murekkep">Yeni bloke</div>
              <Alan etiket="Barkodlar" ipucu="Okutun ya da yazın; her satıra bir barkod.">
                <Textarea rows={6} className="font-mono" value={barkodlar} onChange={(e) => setBarkodlar(e.target.value)} />
              </Alan>
              <Alan etiket="Neden">
                <input className={girdi} value={neden} onChange={(e) => setNeden(e.target.value)} />
              </Alan>
              <Button onClick={() => ac.mutate()} disabled={!liste_.length || neden.trim().length < 5 || ac.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
                {ac.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {liste_.length} barkodu bloke et
              </Button>
            </div>
          ) : (
            <p className="text-sm text-tas-500">Bloke işlemini kalite yapar.</p>
          )}
          <div>
            <div className="mb-2 font-display text-lg font-bold text-murekkep">Bloke kayıtları</div>
            <ul className="divide-y divide-tas-100 rounded-xl border border-tas-200">
              {liste.data?.map((b) => (
                <li key={b.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-murekkep">{tr(b.neden)}</b>
                    {b.kapanmaZamani ? (
                      <span className="rounded-full bg-tas-100 px-2 py-0.5 text-[11px] font-semibold text-tas-500">Kaldırıldı</span>
                    ) : (
                      <span className="rounded-full bg-sorun-acik px-2 py-0.5 text-[11px] font-semibold text-unity-koyu">Açık · {b.birimSayisi} barkod</span>
                    )}
                  </div>
                  <div className="text-xs text-tas-500">
                    Açan: {tr(b.acanAd)} · {tarihSaat(b.acilmaZamani)}
                    {b.kapanmaZamani && ` — Kaldıran: ${tr(b.kapatanAd)} · ${tarihSaat(b.kapanmaZamani)}`}
                  </div>
                  {!b.kapanmaZamani && yazabilir && (
                    kaldir?.id === b.id ? (
                      <div className="flex gap-2 pt-1">
                        <input className={cn(girdi, "h-9")} autoFocus value={gerekce} onChange={(e) => setGerekce(e.target.value)} placeholder="Kaldırma gerekçesi" />
                        <Button size="sm" onClick={() => kapatM.mutate()} disabled={gerekce.trim().length < 5 || kapatM.isPending} className="h-9 bg-uygun hover:bg-uygun/90">
                          Kaldır
                        </Button>
                      </div>
                    ) : (
                      <button onClick={() => setKaldir(b)} className="inline-flex items-center gap-1 text-xs font-semibold text-uygun hover:underline">
                        <LockOpen className="h-3.5 w-3.5" /> Blokeyi kaldır
                      </button>
                    )
                  )}
                </li>
              ))}
              {liste.data && !liste.data.length && <li className="px-4 py-3 text-sm text-tas-400">Bloke kaydı yok.</li>}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
