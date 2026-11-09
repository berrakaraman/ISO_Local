// F-02 Uretim Emri: sef is emrini acar ve onaya gonderir. Onaylanan is emri uretime alinir.
// Uretimin tum adimlari bu sayfadan yapilir (makine basi ekrani gelene kadar):
// hammadde okutma -> ilk parca -> karantinaya ayirma -> top bitirme -> isi bitirme (miktar dengesi).
// Kayit silinmez; yalnizca baslamamis is emri gerekceyle iptal edilir.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Ban, CheckCircle2, Flag, Pause, Play, Plus, Loader2, ScanBarcode, ShieldAlert, Ruler, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import { OnayIslemleri } from "@/components/iso/OnayIslemleri";
import { OnayRozeti } from "@/components/iso/StatusBadge";
import { IptalPenceresi } from "@/components/iso/IptalPenceresi";
import {
  AkisDugmesi, Alan, BarkodLink, BilgiKutulari, Bolum, EtiketListesi, KimNeYapti, KisiSecimi, PencereBasligi, Yukleniyor, girdi, onayOzeti,
} from "@/components/iso/FormParcalari";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getTable } from "@/lib/iso-data";
import { useTanimlar } from "@/lib/tanimlar";
import { api, hataMesaji } from "@/lib/api";
import { rolVar, useOturum } from "@/lib/oturum";
import { useKisiler, type OnayDurum } from "@/lib/onay";
import { durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { useAletler } from "@/lib/kys";
import { barkodAyikla } from "@/components/izle/BarkodArama";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/uretim-emri")({ component: UretimEmri });

type IsEmriSatiri = {
  no: string; durum: string; hedefMiktar: number; planlananTarih: string | null; siparisNo: string | null; aciklama: string | null;
  baslangic: string | null; bitis: string | null; olusturmaZamani: string;
  urunKod: string; urunAd: string; olcuBirimi: string; makineKod: string; musteri: string | null;
  uretilen: number; karantina: number; olusturanAd: string | null;
  iptalEdenAd: string | null; iptalZamani: string | null; iptalGerekcesi: string | null;
  onayId: string | null; onayDurum: OnayDurum | null; onayAtananId: string | null; onayAtananAd: string | null;
  onayKararZamani: string | null; onayKararNotu: string | null; onayKararVerenAd: string | null;
};

const DURUM_RENGI: Record<string, string> = {
  PLANLANDI: "bg-tas-100 text-tas-600",
  ILK_PARCA_BEKLIYOR: "bg-dikkat-acik text-dikkat",
  URETIMDE: "bg-uygun-acik text-uygun",
  DURAKLATILDI: "bg-dikkat-acik text-dikkat",
  TAMAMLANDI: "bg-murekkep text-white",
  TAMAMLANDI_FARK: "bg-sorun-acik text-unity-koyu",
  IPTAL: "bg-tas-200 text-tas-500",
};

function IsEmriDurumu({ durum }: { durum: string }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", DURUM_RENGI[durum])}>{durumAdi(durum)}</span>;
}

function UretimEmri() {
  const table = getTable("uretim-emri")!;
  const oturum = useOturum();
  const sef = rolVar(oturum, "SEF");
  const arama = Route.useSearch() as { ac?: string };
  const [yeni, setYeni] = useState(false);
  const [secili, setSecili] = useState<string | null>(arama.ac || null);
  const [iptalNo, setIptalNo] = useState<string | null>(null);
  useEffect(() => {
    if (arama.ac) setSecili(arama.ac);
  }, [arama.ac]);

  const liste = useQuery({ queryKey: ["is-emirleri"], queryFn: () => api<IsEmriSatiri[]>("/is-emirleri"), refetchInterval: 20_000 });

  const satirlar: KayitSatiri[] = useMemo(
    () =>
      (liste.data || []).map((r) => ({
        anahtar: r.no,
        veri: {
          "Üretim Emri No": r.no,
          "Sipariş No": r.siparisNo,
          "Müşteri/Proje": tr(r.musteri),
          "Ürün Kodu": r.urunKod,
          "Ürün Adı": tr(r.urunAd),
          "Planlanan Miktar": r.hedefMiktar,
          Üretilen: r.uretilen,
          Karantina: r.karantina,
          Birim: r.olcuBirimi,
          "Planlanan Makine": r.makineKod,
          "Planlanan Tarih": r.planlananTarih,
          Durum: durumAdi(r.durum),
        },
        akis: r.uretilen > 0 ? r.no : undefined,
        kaydeden: { ad: r.olusturanAd, zaman: r.olusturmaZamani },
        onay: onayOzeti(r),
        iptal: r.durum === "IPTAL" ? { ad: r.iptalEdenAd, zaman: r.iptalZamani, gerekce: r.iptalGerekcesi } : null,
      })),
    [liste.data],
  );

  return (
    <div className="animate-belir">
      <PageHeader eyebrow={table.code} title={table.title} description={table.description} />
      <div className="p-8">
        <KayitTablosu
          table={table}
          satirlar={satirlar}
          onayTuru="IS_EMRI"
          yukleniyor={liste.isLoading}
          hata={liste.isError ? hataMesaji(liste.error, "Liste yüklenemedi.") : null}
          onSatir={(s) => setSecili(s.anahtar)}
          onIptal={sef ? (s) => setIptalNo(s.anahtar) : undefined}
          iptalEdilebilir={(s) => liste.data?.find((x) => x.no === s.anahtar)?.durum === "PLANLANDI"}
          araclar={
            sef && (
              <Button onClick={() => setYeni(true)} className="h-10 gap-2 bg-unity px-4 font-semibold hover:bg-unity-koyu">
                <Plus className="h-4 w-4" /> Yeni Kayıt
              </Button>
            )
          }
        />
      </div>
      {yeni && <YeniIsEmri kapat={() => setYeni(false)} acildi={(no) => setSecili(no)} />}
      {secili && <IsEmriAyrinti no={secili} satir={liste.data?.find((x) => x.no === secili)} kapat={() => setSecili(null)} iptalEt={sef ? setIptalNo : undefined} />}
      {iptalNo && <IptalPenceresi kayitNo={iptalNo} yol={`/is-emirleri/${iptalNo}/iptal`} acik kapat={() => setIptalNo(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------

function YeniIsEmri({ kapat, acildi }: { kapat: () => void; acildi: (no: string) => void }) {
  const qc = useQueryClient();
  const t = useTanimlar();
  const kisiler = useKisiler(undefined, "IS_EMRI");
  const [f, setF] = useState({ urunId: "", makineId: "", hedefMiktar: "", planlananTarih: new Date().toISOString().slice(0, 10), musteriId: "", siparisNo: "", aciklama: "", atananId: "" });
  const urun = t.data?.urunler.find((u) => u.id === f.urunId);
  const m = useMutation({
    mutationFn: () =>
      api<{ isEmri: { no: string }; hammaddeIhtiyaci: { kod: string; ad: string; ihtiyacKg: number }[] }>("/is-emirleri", {
        govde: { ...f, hedefMiktar: f.hedefMiktar.replace(",", "."), musteriId: f.musteriId || undefined, siparisNo: f.siparisNo || undefined, aciklama: f.aciklama || undefined },
      }),
    onSuccess: (c) => {
      const ihtiyac = c.hammaddeIhtiyaci.map((x) => `${x.kod} ${sayi(x.ihtiyacKg)} kg`).join(", ");
      toast.success(`${c.isEmri.no} açıldı ve onaya gönderildi.${ihtiyac ? ` Hammadde ihtiyacı: ${ihtiyac}` : ""}`);
      qc.invalidateQueries();
      kapat();
      acildi(c.isEmri.no);
    },
    onError: (e) => toast.error(hataMesaji(e, "İş emri açılamadı.")),
  });
  const eksik = !f.urunId || !f.makineId || !(Number(f.hedefMiktar.replace(",", ".")) > 0) || !f.atananId;
  return (
    <Dialog open onOpenChange={(o) => !o && !m.isPending && kapat()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <PencereBasligi ust="F-02 · Üretim Emri" baslik="Yeni iş emri" aciklama="İş emri onaylandıktan sonra üretime alınabilir." />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!eksik) m.mutate();
          }}
          className="grid gap-4 px-6 pb-6 sm:grid-cols-2"
        >
          <Alan etiket="Ürün">
            <select className={girdi} value={f.urunId} onChange={(e) => setF({ ...f, urunId: e.target.value })}>
              <option value="">Seçiniz</option>
              {t.data?.urunler.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.kod} — {tr(u.ad)}
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="Makine">
            <select className={girdi} value={f.makineId} onChange={(e) => setF({ ...f, makineId: e.target.value })}>
              <option value="">Seçiniz</option>
              {t.data?.makineler
                .filter((x) => x.tip !== "METRAJ")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.kod} — {tr(x.ad)}
                  </option>
                ))}
            </select>
          </Alan>
          <Alan etiket={`Planlanan miktar (${urun?.olcuBirimi || "m"})`}>
            <input className={girdi} inputMode="decimal" value={f.hedefMiktar} onChange={(e) => setF({ ...f, hedefMiktar: e.target.value })} />
          </Alan>
          <Alan etiket="Planlanan tarih">
            <input className={girdi} type="date" value={f.planlananTarih} onChange={(e) => setF({ ...f, planlananTarih: e.target.value })} />
          </Alan>
          <Alan etiket="Müşteri / proje (isteğe bağlı)">
            <select className={girdi} value={f.musteriId} onChange={(e) => setF({ ...f, musteriId: e.target.value })}>
              <option value="">Stok için</option>
              {t.data?.musteriler.map((x) => (
                <option key={x.id} value={x.id}>
                  {tr(x.unvan)}
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="Sipariş no (isteğe bağlı)">
            <input className={girdi} value={f.siparisNo} onChange={(e) => setF({ ...f, siparisNo: e.target.value })} />
          </Alan>
          <Alan etiket="Açıklama (isteğe bağlı)" genis>
            <input className={girdi} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} />
          </Alan>
          <div className="border-t border-tas-200 pt-4 sm:col-span-2">
            <KisiSecimi etiket="İş emrini onaylayacak sorumlu" kisiler={kisiler.data} deger={f.atananId} onChange={(v) => setF({ ...f, atananId: v })} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={kapat}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={eksik || m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
              {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet ve onaya gönder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------
// Is emri ayrintisi + uretim islemleri
// ---------------------------------------------------------------------------------
type Ayrinti = {
  isEmri: { no: string; durum: string; hedefMiktar: number; urunKod: string; urunAd: string; urunBirimi: string; makineKod: string; baslangic: string | null; bitis: string | null; denge: any };
  prosesDurumu: { planVar: boolean; aralikDk: number; sonOlcum: string | null; gecenDk: number | null; gecikti: boolean; duzeltmeBekliyor: boolean };
  sayaclar: { uretilen: number; karantina: number; karantinaSayisi: number; topSayisi: number };
  baglamalar: { id: number; barkod: string; lotNo: string; malzemeKod: string; baglamaMiktari: number; guncelMiktar: number; olcuBirimi: string; baglamaZamani: string; cikarmaZamani: string | null; tuketilen: number | null }[];
  toplar: { barkod: string; ilkMiktar: number; durum: string; olusturmaZamani: string }[];
  karantinalar: { barkod: string; ilkMiktar: number; olcuBirimi: string; durum: string; ek: any; olusturmaZamani: string }[];
  olcumler: { id: number; asama: string; karakteristik: string; deger: number; sonuc: string; denemeNo: number; zaman: string; altSinir: number | null; ustSinir: number | null; olcuBirimi: string | null }[];
  karakteristikler: { id: string; asama: string; ad: string; nominal: number | null; altSinir: number | null; ustSinir: number | null; olcuBirimi: string | null }[];
};

type Islem = "bagla" | "ilk" | "proses" | "karantina" | "top" | "duraklat" | "bitir" | "fark" | null;

function IsEmriAyrinti({ no, satir, kapat, iptalEt }: { no: string; satir?: IsEmriSatiri; kapat: () => void; iptalEt?: (no: string) => void }) {
  const oturum = useOturum();
  const qc = useQueryClient();
  const a = useQuery({ queryKey: ["is-emirleri", no], queryFn: () => api<Ayrinti>(`/is-emirleri/${encodeURIComponent(no)}`), refetchInterval: 15_000 });
  const [islem, setIslem] = useState<Islem>(null);
  const [etiketler, setEtiketler] = useState<string[]>([]);
  const yenile = () => qc.invalidateQueries();

  const uretici = rolVar(oturum, "OPERATOR", "SEF");
  const kalite = rolVar(oturum, "KALITE");
  const sef = rolVar(oturum, "SEF");
  const tanim = useTanimlar();
  // Ilk parca onayini kalite verir; firma ayarinda izin verildiyse operator de verebilir
  const ilkParcaYetkili = kalite || (rolVar(oturum, "OPERATOR") && !!(tanim.data as any)?.firma?.ayarlar?.ilkParcaOperatorOnaylayabilir);
  const d = a.data;
  const durum = d?.isEmri.durum || satir?.durum || "";
  const onay = satir ? onayOzeti(satir) : null;
  const onayBekliyor = !!onay && onay.durum !== "ONAYLANDI";

  const basla = useMutation({
    mutationFn: () => api(`/is-emirleri/${no}/baslat`, { govde: {} }),
    onSuccess: (c: any) => {
      if (c?.durum === "URETIMDE") {
        toast.success(`${no} devam ediyor.`);
        setIslem(null);
      } else {
        toast.success(`${no} başlatıldı. Hammaddeleri okutun; kalite ilk parça onayını verecek.`);
        setIslem("bagla");
      }
      yenile();
    },
    onError: (e) => toast.error(hataMesaji(e, "Başlatılamadı.")),
  });

  const dugme = (k: Islem, etiket: string, Ikon: typeof Play, goster: boolean, vurgu = false) =>
    goster && (
      <Button
        key={k}
        variant="outline"
        onClick={() => setIslem(islem === k ? null : k)}
        className={cn("gap-1.5", islem === k && "border-murekkep bg-murekkep text-white hover:bg-murekkep hover:text-white", vurgu && islem !== k && "border-unity text-unity")}
      >
        <Ikon className="h-4 w-4" /> {etiket}
      </Button>
    );

  const calisiyor = ["ILK_PARCA_BEKLIYOR", "URETIMDE", "DURAKLATILDI"].includes(durum);

  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <PencereBasligi
          ust="F-02 · Üretim emri"
          baslik={no}
          mono
          ustuCizili={durum === "IPTAL"}
          aciklama={d ? `${d.isEmri.urunKod} ${tr(d.isEmri.urunAd)} · ${d.isEmri.makineKod} · hedef ${sayi(d.isEmri.hedefMiktar)} ${d.isEmri.urunBirimi}` : "Yükleniyor…"}
        >
          {durum && <IsEmriDurumu durum={durum} />}
          {(d?.sayaclar.topSayisi ?? 0) > 0 && <AkisDugmesi barkod={no} />}
          {durum === "PLANLANDI" && uretici && (
            <Button onClick={() => basla.mutate()} disabled={basla.isPending || onayBekliyor} className="gap-1.5 bg-uygun hover:bg-uygun/90" title={onayBekliyor ? "Önce iş emri onaylanmalı" : undefined}>
              {basla.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Üretime başla
            </Button>
          )}
          {durum === "DURAKLATILDI" && uretici && (
            <Button onClick={() => basla.mutate()} disabled={basla.isPending} className="gap-1.5 bg-uygun hover:bg-uygun/90">
              <Play className="h-4 w-4" /> Devam et
            </Button>
          )}
          {calisiyor && dugme("bagla", "Hammadde okut", ScanBarcode, uretici)}
          {durum === "ILK_PARCA_BEKLIYOR" && dugme("ilk", "İlk parça kontrolü", Ruler, ilkParcaYetkili, true)}
          {durum === "URETIMDE" && d?.prosesDurumu.planVar && dugme("proses", "Proses ölçümü", Activity, uretici || kalite, !!(d?.prosesDurumu.gecikti || d?.prosesDurumu.duzeltmeBekliyor))}
          {calisiyor && dugme("karantina", "Karantinaya ayır", ShieldAlert, rolVar(oturum, "OPERATOR", "SEF", "KALITE"))}
          {durum === "URETIMDE" && dugme("top", "Topu bitir", Flag, uretici, true)}
          {["URETIMDE", "ILK_PARCA_BEKLIYOR"].includes(durum) && dugme("duraklat", "Duraklat", Pause, uretici)}
          {["URETIMDE", "DURAKLATILDI"].includes(durum) && dugme("bitir", "İşi bitir", CheckCircle2, uretici)}
          {durum === "TAMAMLANDI_FARK" && dugme("fark", "Farkı açıkla", AlertTriangle, sef, true)}
          {durum === "PLANLANDI" && iptalEt && (
            <Button variant="outline" onClick={() => iptalEt(no)} className="gap-1.5 text-unity">
              <Ban className="h-4 w-4" /> İptal et
            </Button>
          )}
        </PencereBasligi>

        {!d ? (
          <Yukleniyor />
        ) : (
          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[1.35fr_1fr]">
            <div className="space-y-5">
              {durum === "PLANLANDI" && onayBekliyor && (
                <div className="rounded-lg border border-dikkat/30 bg-dikkat-acik px-4 py-3 text-sm text-dikkat">
                  Bu iş emri {tr(onay?.atananAd)} tarafından onaylanmadan üretime alınamaz.
                </div>
              )}
              {durum === "IPTAL" && satir && (
                <div className="rounded-lg border border-murekkep/15 bg-tas-100 px-4 py-3 text-sm text-tas-600">
                  <b className="text-murekkep">İptal edildi — kayıt silinmedi.</b> {tr(satir.iptalEdenAd)} · {tarihSaat(satir.iptalZamani)} · {tr(satir.iptalGerekcesi)}
                </div>
              )}

              {durum === "ILK_PARCA_BEKLIYOR" && (
                <div className="rounded-lg border border-dikkat/30 bg-dikkat-acik px-4 py-3 text-sm text-dikkat">
                  İlk parça onayı bekleniyor. Hammaddeleri okutun; kalite ilk parçayı ölçüp onaylayınca üretim başlar.
                </div>
              )}
              {durum === "URETIMDE" && d.prosesDurumu.duzeltmeBekliyor && (
                <div className="rounded-lg border border-unity/30 bg-sorun-acik px-4 py-3 text-sm text-unity-koyu">
                  Son proses ölçümü uygun değildi. Ayarı düzeltip yeni bir proses ölçümü yapın; uygun çıkmadan top bitirilemez.
                </div>
              )}
              {durum === "URETIMDE" && d.prosesDurumu.gecikti && (
                <div className="rounded-lg border border-unity/30 bg-sorun-acik px-4 py-3 text-sm text-unity-koyu">
                  Periyodik proses ölçümü gecikti: son uygun ölçüm {sayi(d.prosesDurumu.gecenDk, 0)} dk önce (aralık {d.prosesDurumu.aralikDk} dk). Ölçüm yapılmadan top bitirilemez.
                </div>
              )}
              {durum === "DURAKLATILDI" && (
                <div className="rounded-lg border border-dikkat/30 bg-dikkat-acik px-4 py-3 text-sm text-dikkat">
                  İş duraklatıldı. Devam etmek için sağ üstteki <b>Devam et</b>. Arıza ya da bakım olduysa KYS Kayıtları → Bakım / arıza'ya kaydedin.
                </div>
              )}
              {islem && (
                <IslemPaneli
                  key={islem}
                  islem={islem}
                  no={no}
                  d={d}
                  bitti={(yeniEtiketler) => {
                    if (yeniEtiketler?.length) setEtiketler(yeniEtiketler);
                    if (islem !== "bagla" && islem !== "karantina") setIslem(null);
                    yenile();
                  }}
                />
              )}
              {etiketler.length > 0 && <EtiketListesi barkodlar={etiketler} key={etiketler.join()} />}

              <BilgiKutulari
                kutular={[
                  ["Hedef", `${sayi(d.isEmri.hedefMiktar)} ${d.isEmri.urunBirimi}`],
                  ["Üretilen (top)", `${sayi(d.sayaclar.uretilen)} ${d.isEmri.urunBirimi}`],
                  ["Karantina", `${sayi(d.sayaclar.karantina)} ${d.isEmri.urunBirimi}`],
                  ["Top sayısı", String(d.sayaclar.topSayisi)],
                ]}
              />
              {d.isEmri.denge && <Denge denge={d.isEmri.denge} />}

              <Bolum baslik="Makineye takılan hammaddeler">
                {d.baglamalar.length ? (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-tas-100">
                      {d.baglamalar.map((g) => (
                        <tr key={g.id}>
                          <td className="py-2">
                            <BarkodLink barkod={g.barkod} />
                            <span className="ml-2 text-xs text-tas-400">{g.malzemeKod}</span>
                          </td>
                          <td className="sayi py-2 text-right">
                            {sayi(g.baglamaMiktari)} {g.olcuBirimi}
                          </td>
                          <td className="py-2 pl-3 text-xs text-tas-500">
                            {g.cikarmaZamani ? `tüketilen ${sayi(g.tuketilen)} ${g.olcuBirimi}` : <span className="font-semibold text-uygun">makinede</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-tas-400">Henüz hammadde okutulmadı.</p>
                )}
              </Bolum>

              <div className="grid gap-5 md:grid-cols-2">
                <Bolum baslik="Toplar (üretim lotları)">
                  {d.toplar.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {d.toplar.map((t) => (
                        <li key={t.barkod} className="flex items-center justify-between gap-2">
                          <BarkodLink barkod={t.barkod} />
                          <span className="sayi">{sayi(t.ilkMiktar)} {d.isEmri.urunBirimi}</span>
                          <span className="text-xs text-tas-500">{durumAdi(t.durum)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-tas-400">Henüz top bitirilmedi.</p>
                  )}
                </Bolum>
                <Bolum baslik="Karantinaya ayrılanlar">
                  {d.karantinalar.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {d.karantinalar.map((k) => (
                        <li key={k.barkod} className="flex items-center justify-between gap-2">
                          <BarkodLink barkod={k.barkod} />
                          <span className="sayi">{sayi(k.ilkMiktar)} {k.olcuBirimi}</span>
                          <span className="truncate text-xs text-tas-500">{k.ek?.hataKodu}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-tas-400">Karantina yok.</p>
                  )}
                </Bolum>
              </div>

              {d.olcumler.some((o) => o.asama === "ILK_PARCA" || o.asama === "PROSES") && (
                <Bolum baslik="İlk parça ve proses ölçümleri">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-tas-100">
                      {d.olcumler
                        .filter((o) => o.asama === "ILK_PARCA" || o.asama === "PROSES")
                        .map((o) => (
                          <tr key={o.id}>
                            <td className="py-1.5 text-xs text-tas-400">
                              {o.asama === "PROSES" ? "Proses" : "İlk parça"} {o.denemeNo}. · {tarihSaat(o.zaman)}
                            </td>
                            <td className="py-1.5">{tr(o.karakteristik)}</td>
                            <td className="sayi py-1.5 text-right">
                              {sayi(o.deger, 3)} {o.olcuBirimi}
                            </td>
                            <td className="py-1.5 pl-3 text-xs text-tas-400">
                              {o.altSinir ?? "–"} … {o.ustSinir ?? "–"}
                            </td>
                            <td className="py-1.5 pl-3">
                              {o.sonuc === "UYGUN" ? <CheckCircle2 className="h-4 w-4 text-uygun" /> : <XCircle className="h-4 w-4 text-unity" />}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Bolum>
              )}
            </div>

            <div className="space-y-5">
              <Bolum baslik="İş emri onayı">
                {onay ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-tas-500">Sorumlu</span>
                      <b>{tr(onay.atananAd)}</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tas-500">Durum</span>
                      <OnayRozeti durum={onay.durum} />
                    </div>
                    {onay.kararVerenAd && (
                      <div className="rounded-lg bg-tas-50 px-3 py-2 text-xs text-tas-600">
                        <b className="text-murekkep">{tr(onay.kararVerenAd)}</b> · {tarihSaat(onay.kararZamani)}
                        {onay.kararNotu && <div>“{tr(onay.kararNotu)}”</div>}
                      </div>
                    )}
                    {durum !== "IPTAL" && <OnayIslemleri onay={onay} tur="IS_EMRI" kayitNo={no} />}
                  </div>
                ) : (
                  <p className="text-sm text-tas-400">Onaya gönderilmemiş (eski kayıt).</p>
                )}
              </Bolum>
              <KimNeYapti tur="IS_EMRI" no={no} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Denge({ denge }: { denge: any }) {
  return (
    <div className={cn("rounded-xl border p-4", denge.toleransAsildi ? "border-unity/30 bg-sorun-acik/40" : "border-uygun/30 bg-uygun-acik/40")}>
      <div className="mb-2 font-display text-lg font-bold text-murekkep">Miktar dengesi</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[11px] uppercase text-tas-400">Beklenen</div>
          <b className="sayi">{sayi(denge.beklenenMetraj)} m</b>
        </div>
        <div>
          <div className="text-[11px] uppercase text-tas-400">Üretilen + karantina</div>
          <b className="sayi">{sayi(denge.uretilenToplam)} m</b>
        </div>
        <div>
          <div className="text-[11px] uppercase text-tas-400">Fark</div>
          <b className="sayi">
            {sayi(denge.fark)} m (%{sayi(denge.farkYuzde)})
          </b>
        </div>
        <div>
          <div className="text-[11px] uppercase text-tas-400">Tolerans</div>
          <b>%{sayi(denge.toleransYuzde)}</b>
        </div>
      </div>
      {denge.kalemler?.map((k: any) => (
        <div key={k.malzeme} className={cn("mt-1 text-xs", k.eksik ? "font-semibold text-unity" : "text-tas-500")}>
          {k.malzeme}: {sayi(k.tuketilenKg, 3)} kg tüketildi, {k.gramMetre} g/m → {sayi(k.beklenenMetraj)} m
          {k.gerekenKg !== undefined && <> · üretilen için gereken {sayi(k.gerekenKg, 3)} kg</>}
          {k.eksik && " · bu malzeme hiç kullanılmadı!"}
        </div>
      ))}
      {denge.hedefMiktar !== undefined && (
        <div className="mt-2 text-sm text-tas-600">
          Hedef {sayi(denge.hedefMiktar)} m · gerçekleşen {sayi(denge.uretilenToplam)} m (%{sayi(denge.hedefGerceklesmeYuzde)}) · hedef farkı {sayi(denge.hedefFarki)} m
        </div>
      )}
      {denge.farkAciklamasi && <div className="mt-2 text-sm text-tas-600">Açıklama: {tr(denge.farkAciklamasi)}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Uretim islemleri (her biri ayri kucuk form)
// ---------------------------------------------------------------------------------
function IslemPaneli({ islem, no, d, bitti }: { islem: Exclude<Islem, null>; no: string; d: Ayrinti; bitti: (etiketler?: string[]) => void }) {
  const t = useTanimlar();
  const birim = d.isEmri.urunBirimi;
  const [v, setV] = useState<Record<string, string>>({});
  const [ilkSonuc, setIlkSonuc] = useState<any>(null);
  const okutRef = useRef<HTMLInputElement>(null);
  const kars = d.karakteristikler.filter((k) => k.asama === (islem === "proses" ? "PROSES" : "ILK_PARCA"));
  const aletler = useAletler();
  const gecerliAletler = (aletler.data || []).filter((a) => a.kalibrasyonDurumu === "GECERLI" || a.kalibrasyonDurumu === "YAKLASIYOR");
  const acikBaglamalar = d.baglamalar.filter((g) => !g.cikarmaZamani);

  const m = useMutation({
    mutationFn: async () => {
      switch (islem) {
        case "bagla":
          return api(`/is-emirleri/${no}/bagla`, { govde: { barkod: barkodAyikla(v.barkod || "") } });
        case "ilk":
        case "proses":
          return api(`/is-emirleri/${no}/${islem === "ilk" ? "ilk-parca" : "proses-olcum"}`, {
            govde: { olcumler: kars.map((k) => ({ karakteristikId: k.id, deger: (v[k.id] || "").replace(",", ".") })), aletKod: v.aletKod || undefined },
          });
        case "karantina":
          return api(`/is-emirleri/${no}/karantina`, { govde: { hataKodu: v.hataKodu, miktar: (v.miktar || "").replace(",", "."), not: v.not || undefined } });
        case "top":
          return api(`/is-emirleri/${no}/top-bitir`, { govde: { metraj: (v.metraj || "").replace(",", "."), agirlik: v.agirlik ? v.agirlik.replace(",", ".") : undefined } });
        case "duraklat":
          return api(`/is-emirleri/${no}/duraklat`, { govde: { gerekce: v.gerekce || undefined } });
        case "bitir":
          return api(`/is-emirleri/${no}/bitir`, {
            govde: { iadeler: acikBaglamalar.map((g) => ({ barkod: g.barkod, kalanMiktar: (v[`k_${g.barkod}`] || "0").replace(",", ".") })), aciklama: v.aciklama || undefined },
          });
        case "fark":
          return api(`/is-emirleri/${no}/fark-aciklamasi`, { govde: { aciklama: v.aciklama } });
      }
    },
    onSuccess: (c: any) => {
      if (islem === "bagla") {
        toast.success(`${c.barkod} makineye takıldı (${sayi(c.miktar)} ${c.olcuBirimi}).`);
        setV({});
        setTimeout(() => okutRef.current?.focus(), 0);
        return bitti();
      }
      if (islem === "ilk") {
        setIlkSonuc(c);
        if (c.onaylandi) toast.success("İlk parça onaylandı. Üretim başladı.");
        else toast.error("İlk parça uygun değil. Ayarı düzeltip tekrar ölçün.");
        return bitti();
      }
      if (islem === "proses") {
        setIlkSonuc(c);
        if (c.uygun) toast.success("Proses ölçümü uygun. Üretim devam ediyor.");
        else toast.error("Tolerans dışı! İş emri durduruldu. Şüpheli üretimi karantinaya ayırın, ayarı düzeltip yeniden başlatın.");
        return bitti();
      }
      if (islem === "duraklat") {
        toast.success("İş duraklatıldı.");
        return bitti();
      }
      if (islem === "karantina") {
        toast.success(`${c.karantina.barkod} karantina etiketi hazır. İş emrinin karantina toplamı: ${sayi(c.sayaclar.karantina)} ${birim}`);
        setV({});
        return bitti([c.karantina.barkod]);
      }
      if (islem === "top") {
        toast.success(`${c.lot.no} topu bitirildi (${sayi(c.top.ilkMiktar)} ${birim}).`);
        if (c.uyari) toast.warning(c.uyari);
        return bitti([c.top.barkod]);
      }
      if (islem === "bitir") {
        toast[c.durum === "TAMAMLANDI" ? "success" : "warning"](
          c.durum === "TAMAMLANDI" ? "İş emri tamamlandı. Miktar dengesi tutuyor." : `İş emri bitti; fark %${sayi(c.denge.farkYuzde)}. Şefin farkı açıklaması gerekiyor.`,
        );
        return bitti();
      }
      toast.success("Kaydedildi.");
      bitti();
    },
    onError: (e) => {
      toast.error(hataMesaji(e, "İşlem yapılamadı."));
      if (islem === "bagla") {
        setV({});
        setTimeout(() => okutRef.current?.focus(), 0);
      }
    },
  });

  const gonder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!m.isPending) m.mutate();
  };
  const kaydetDugmesi = (etiket: string, devreDisi = false) => (
    <Button type="submit" disabled={devreDisi || m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
      {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {etiket}
    </Button>
  );
  const sayiGir = (k: string, ph?: string, autoFocus = false) => (
    <input className={girdi} inputMode="decimal" autoFocus={autoFocus} value={v[k] || ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={ph} />
  );

  return (
    <form onSubmit={gonder} className="space-y-4 rounded-xl border-2 border-murekkep/80 bg-white p-4">
      {islem === "bagla" && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">Hammadde okut</div>
          <p className="text-sm text-tas-500">Makineye takılan bobin / çuvalın barkodunu okutun. Okuyucu Enter gönderince kaydedilir; sıradakini okutabilirsiniz.</p>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tas-400" />
            <input
              ref={okutRef}
              autoFocus
              className={cn(girdi, "h-12 pl-11 font-mono text-base")}
              value={v.barkod || ""}
              onChange={(e) => setV({ barkod: e.target.value })}
              placeholder="RM-2610-0001-01"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <p className="text-[11px] text-tas-400">Kalitenin kabul etmediği, bloke ya da reçete dışı malzeme sistem tarafından reddedilir.</p>
        </>
      )}

      {(islem === "ilk" || islem === "proses") && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">{islem === "ilk" ? "İlk parça kontrolü" : "Periyodik proses ölçümü"}</div>
          {islem === "proses" && <p className="text-sm text-tas-500">Bir değer bile tolerans dışıysa iş emri otomatik durur. Ayarı düzeltip Devam et deyin; top bitirmeden önce uygun bir proses ölçümü gerekir.</p>}
          {!kars.length && <p className="text-sm text-unity">Bu ürün için kontrol planında {islem === "ilk" ? "ilk parça" : "proses"} maddesi yok. Tanımlar → Kontrol planı.</p>}
          <Alan etiket="Ölçüm aleti" ipucu="Yalnızca kalibrasyonu geçerli aletler listelenir">
            <select className={girdi} value={v.aletKod || ""} onChange={(e) => setV({ ...v, aletKod: e.target.value })}>
              <option value="">Seçilmedi</option>
              {gecerliAletler.map((a) => (
                <option key={a.kod} value={a.kod}>
                  {a.kod} — {tr(a.ad)} (kal. {a.sonrakiKalibrasyon})
                </option>
              ))}
            </select>
          </Alan>
          <div className="grid gap-3 sm:grid-cols-2">
            {kars.map((k, i) => (
              <Alan key={k.id} etiket={`${tr(k.ad)} (${k.altSinir ?? "–"} … ${k.ustSinir ?? "–"} ${k.olcuBirimi || ""})`}>
                {sayiGir(k.id, k.nominal !== null ? String(k.nominal) : undefined, i === 0)}
              </Alan>
            ))}
          </div>
          {ilkSonuc && (
            <div className={cn("rounded-lg px-3 py-2 text-sm", (ilkSonuc.onaylandi ?? ilkSonuc.uygun) ? "bg-uygun-acik text-uygun" : "bg-sorun-acik text-unity-koyu")}>
              {ilkSonuc.deneme}. ölçüm: {(ilkSonuc.onaylandi ?? ilkSonuc.uygun) ? (islem === "ilk" ? "uygun, üretim başladı" : "uygun") : islem === "ilk" ? "uygun değil" : "tolerans dışı, iş emri durdu"} —{" "}
              {ilkSonuc.sonuclar.map((s: any) => `${s.karakteristik} ${s.deger}${s.uygun ? " ✓" : " ✗"}`).join(", ")}
            </div>
          )}
          {kaydetDugmesi("Ölçümleri kaydet", !kars.length || kars.some((k) => !v[k.id]))}
        </>
      )}

      {islem === "karantina" && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">Karantinaya ayır</div>
          <p className="text-sm text-tas-500">Ayrılan parçaya karantina etiketi basılır ve yapıştırılır. Miktar iş emrinin toplamından düşer.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Alan etiket="Hata kodu">
              <select className={girdi} value={v.hataKodu || ""} onChange={(e) => setV({ ...v, hataKodu: e.target.value })}>
                <option value="">Seçiniz</option>
                {t.data?.["hata-kodlari"].map((h) => (
                  <option key={h.kod} value={h.kod}>
                    {h.kod} — {tr(h.aciklama)}
                  </option>
                ))}
              </select>
            </Alan>
            <Alan etiket={`Miktar (${birim})`}>{sayiGir("miktar", "10")}</Alan>
            <Alan etiket="Not (isteğe bağlı)">
              <input className={girdi} value={v.not || ""} onChange={(e) => setV({ ...v, not: e.target.value })} />
            </Alan>
          </div>
          {kaydetDugmesi("Ayır ve karantina etiketi bas", !v.hataKodu || !(Number((v.miktar || "").replace(",", ".")) > 0))}
        </>
      )}

      {islem === "top" && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">Topu bitir</div>
          <p className="text-sm text-tas-500">Biten top bir üretim lotu olur ve etiketlenir. Bu topa ait karantina parçaları lota bağlanır.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Alan etiket={`Metraj (${birim})`}>{sayiGir("metraj", "1000", true)}</Alan>
            <Alan etiket="Ağırlık kg (isteğe bağlı)" ipucu="Girilirse reçeteye göre metrajla karşılaştırılır">
              {sayiGir("agirlik")}
            </Alan>
          </div>
          {kaydetDugmesi("Topu bitir ve etiket bas", !(Number((v.metraj || "").replace(",", ".")) > 0))}
        </>
      )}

      {islem === "duraklat" && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">Duraklat</div>
          <p className="text-sm text-tas-500">İş durur; Devam et ile kaldığı yerden sürer (ilk parça yeniden istenmez). Arıza ya da bakım olduysa KYS Kayıtları → Bakım / arıza'ya kaydedin.</p>
          <Alan etiket="Açıklama (isteğe bağlı)">
            <input className={girdi} autoFocus value={v.gerekce || ""} onChange={(e) => setV({ ...v, gerekce: e.target.value })} placeholder="Mola, malzeme bekleniyor, arıza…" />
          </Alan>
          {kaydetDugmesi("Duraklat")}
        </>
      )}

      {islem === "bitir" && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">İşi bitir</div>
          <p className="text-sm text-tas-500">Makinede kalan hammaddeleri tartın. Kalan miktar depoya iade edilir, gerisi tüketilmiş sayılır ve miktar dengesi hesaplanır.</p>
          {acikBaglamalar.map((g) => (
            <div key={g.barkod} className="grid items-end gap-3 sm:grid-cols-[1fr_180px]">
              <div className="text-sm">
                <BarkodLink barkod={g.barkod} /> <span className="text-xs text-tas-400">takılan {sayi(g.baglamaMiktari)} {g.olcuBirimi}</span>
              </div>
              <Alan etiket={`Kalan (${g.olcuBirimi})`}>{sayiGir(`k_${g.barkod}`, "0")}</Alan>
            </div>
          ))}
          <Alan etiket="Açıklama (isteğe bağlı)">
            <input className={girdi} value={v.aciklama || ""} onChange={(e) => setV({ ...v, aciklama: e.target.value })} />
          </Alan>
          {kaydetDugmesi("İşi bitir ve dengeyi hesapla")}
        </>
      )}

      {islem === "fark" && (
        <>
          <div className="font-display text-lg font-bold text-murekkep">Farkı açıkla</div>
          <p className="text-sm text-tas-500">Hammadde ile üretilen arasındaki fark toleransı aştı. Nedenini yazın; açıklama kayda geçer ve iş emri kapanır.</p>
          <Textarea rows={3} autoFocus value={v.aciklama || ""} onChange={(e) => setV({ ...v, aciklama: e.target.value })} />
          {kaydetDugmesi("Açıklamayı kaydet", (v.aciklama || "").trim().length < 5)}
        </>
      )}
    </form>
  );
}
