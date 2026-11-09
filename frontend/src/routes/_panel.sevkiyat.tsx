// F-06 Sevkiyat: depo sevkiyati acar, her parca barkoduyla okutularak eklenir (paket/etiket kontrolu).
// Sevkiyat onaya gider; onaylanan sevkiyat irsaliye numarasiyla sevk edilir (CRM'e gidecek kayit kuyruga yazilir).
// Kayit silinmez: yanlis okutulan parca "cikarilir" (iz kalir), hazirlanan sevkiyat gerekceyle iptal edilir.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Plus, ScanBarcode, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import { OnayIslemleri } from "@/components/iso/OnayIslemleri";
import { OnayRozeti } from "@/components/iso/StatusBadge";
import { IptalPenceresi } from "@/components/iso/IptalPenceresi";
import { AkisDugmesi, Alan, BarkodLink, BilgiKutulari, Bolum, DurumRozeti, KimNeYapti, KisiSecimi, PencereBasligi, Yukleniyor, girdi, onayOzeti } from "@/components/iso/FormParcalari";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getTable } from "@/lib/iso-data";
import { api, hataMesaji } from "@/lib/api";
import { rolVar, useOturum } from "@/lib/oturum";
import { useKisiler, type OnayDurum } from "@/lib/onay";
import { useTanimlar } from "@/lib/tanimlar";
import { durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { barkodAyikla } from "@/components/izle/BarkodArama";

export const Route = createFileRoute("/_panel/sevkiyat")({ component: Sevkiyat });

type SevkSatiri = {
  no: string; durum: string; siparisNo: string | null; irsaliyeNo: string | null; olusturmaZamani: string; onayZamani: string | null;
  musteri: string; urunKod: string | null; birimSayisi: number; toplamMiktar: number; olcuBirimi: string | null; lotlar: string | null; urunler: string | null;
  olusturanAd: string | null; onaylayanAd: string | null; iptalEdenAd: string | null; iptalZamani: string | null; iptalGerekcesi: string | null;
  onayId: string | null; onayDurum: OnayDurum | null; onayAtananId: string | null; onayAtananAd: string | null;
  onayKararZamani: string | null; onayKararNotu: string | null; onayKararVerenAd: string | null;
};

const DURUM_RENK: Record<string, "gri" | "yesil" | "siyah"> = { HAZIRLANIYOR: "gri", SEVK_EDILDI: "yesil", IPTAL: "siyah" };

function Sevkiyat() {
  const table = getTable("sevkiyat")!;
  const oturum = useOturum();
  const depo = rolVar(oturum, "DEPO", "SEF");
  const arama = Route.useSearch() as { ac?: string };
  const [yeni, setYeni] = useState(false);
  const [secili, setSecili] = useState<string | null>(arama.ac || null);
  const [iptalNo, setIptalNo] = useState<string | null>(null);
  useEffect(() => {
    if (arama.ac) setSecili(arama.ac);
  }, [arama.ac]);

  const liste = useQuery({ queryKey: ["sevkiyat"], queryFn: () => api<SevkSatiri[]>("/sevkiyat"), refetchInterval: 20_000 });

  const satirlar: KayitSatiri[] = useMemo(
    () =>
      (liste.data || []).map((s) => ({
        anahtar: s.no,
        veri: {
          "Sevk Tarihi": s.onayZamani || s.olusturmaZamani,
          "Sevk No": s.no,
          Müşteri: tr(s.musteri),
          "Ürün Kodu": s.urunler || s.urunKod,
          "Lot No": s.lotlar,
          "Sevk Miktarı": s.toplamMiktar,
          Birim: s.olcuBirimi,
          "İrsaliye No": s.irsaliyeNo,
          "Paket/Etiket Kontrolü": s.birimSayisi ? `Uygun · ${s.birimSayisi} etiket okutuldu` : "Okutma bekliyor",
          Hazırlayan: tr(s.olusturanAd),
          Onaylayan: tr(s.onaylayanAd),
          Durum: durumAdi(s.durum),
        },
        baglantilar: s.lotlar && !s.lotlar.includes(",") ? { "Lot No": s.lotlar } : undefined,
        akis: s.birimSayisi ? s.no : undefined,
        kaydeden: { ad: s.olusturanAd, zaman: s.olusturmaZamani },
        onay: onayOzeti(s),
        iptal: s.durum === "IPTAL" ? { ad: s.iptalEdenAd, zaman: s.iptalZamani, gerekce: s.iptalGerekcesi } : null,
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
          onayTuru="SEVKIYAT"
          yukleniyor={liste.isLoading}
          hata={liste.isError ? hataMesaji(liste.error, "Liste yüklenemedi.") : null}
          onSatir={(s) => setSecili(s.anahtar)}
          onIptal={depo ? (s) => setIptalNo(s.anahtar) : undefined}
          iptalEdilebilir={(s) => liste.data?.find((x) => x.no === s.anahtar)?.durum === "HAZIRLANIYOR"}
          araclar={
            depo && (
              <Button onClick={() => setYeni(true)} className="h-10 gap-2 bg-unity px-4 font-semibold hover:bg-unity-koyu">
                <Plus className="h-4 w-4" /> Yeni Kayıt
              </Button>
            )
          }
        />
      </div>
      {yeni && <YeniSevkiyat kapat={() => setYeni(false)} acildi={setSecili} />}
      {secili && <SevkAyrinti no={secili} satir={liste.data?.find((x) => x.no === secili)} kapat={() => setSecili(null)} iptalEt={depo ? setIptalNo : undefined} />}
      {iptalNo && <IptalPenceresi kayitNo={iptalNo} yol={`/sevkiyat/${iptalNo}/iptal`} acik kapat={() => setIptalNo(null)} />}
    </div>
  );
}

function YeniSevkiyat({ kapat, acildi }: { kapat: () => void; acildi: (no: string) => void }) {
  const qc = useQueryClient();
  const t = useTanimlar();
  const kisiler = useKisiler(undefined, "SEVKIYAT");
  const [f, setF] = useState({ musteriId: "", urunId: "", siparisNo: "", irsaliyeNo: "", atananId: "" });
  const m = useMutation({
    mutationFn: () =>
      api<{ no: string }>("/sevkiyat", {
        govde: { musteriId: f.musteriId, urunId: f.urunId || undefined, siparisNo: f.siparisNo || undefined, irsaliyeNo: f.irsaliyeNo || undefined, atananId: f.atananId },
      }),
    onSuccess: (c) => {
      toast.success(`${c.no} açıldı. Parçaları okutun.`);
      qc.invalidateQueries();
      kapat();
      acildi(c.no);
    },
    onError: (e) => toast.error(hataMesaji(e, "Sevkiyat açılamadı.")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-w-2xl p-0">
        <PencereBasligi ust="F-06 · Sevkiyat" baslik="Yeni sevkiyat" aciklama="Açtıktan sonra parçaları barkodla okutarak eklersiniz. Onaylanan sevkiyat sevk edilir." />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="grid gap-4 px-6 pb-6 sm:grid-cols-2"
        >
          <Alan etiket="Müşteri">
            <select className={girdi} value={f.musteriId} onChange={(e) => setF({ ...f, musteriId: e.target.value })}>
              <option value="">Seçiniz</option>
              {t.data?.musteriler.map((x) => (
                <option key={x.id} value={x.id}>
                  {tr(x.unvan)}
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="Ürün (isteğe bağlı)">
            <select className={girdi} value={f.urunId} onChange={(e) => setF({ ...f, urunId: e.target.value })}>
              <option value="">Karışık</option>
              {t.data?.urunler.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.kod} — {tr(x.ad)}
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="Sipariş no (isteğe bağlı)">
            <input className={girdi} value={f.siparisNo} onChange={(e) => setF({ ...f, siparisNo: e.target.value })} />
          </Alan>
          <Alan etiket="İrsaliye no (sevkte de girilebilir)">
            <input className={girdi} value={f.irsaliyeNo} onChange={(e) => setF({ ...f, irsaliyeNo: e.target.value })} />
          </Alan>
          <div className="border-t border-tas-200 pt-4 sm:col-span-2">
            <KisiSecimi etiket="Sevkiyatı onaylayacak sorumlu" kisiler={kisiler.data} deger={f.atananId} onChange={(v) => setF({ ...f, atananId: v })} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={kapat}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={!f.musteriId || !f.atananId || m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
              {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Aç ve onaya gönder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Ayrinti = {
  sevkiyat: { no: string; durum: string; musteri: string; siparisNo: string | null; irsaliyeNo: string | null };
  satirlar: { id: number; miktar: number; zaman: string; barkod: string; olcuBirimi: string; durum: string; lotNo: string; urunKod: string }[];
};

function SevkAyrinti({ no, satir, kapat, iptalEt }: { no: string; satir?: SevkSatiri; kapat: () => void; iptalEt?: (no: string) => void }) {
  const oturum = useOturum();
  const qc = useQueryClient();
  const a = useQuery({ queryKey: ["sevkiyat", no], queryFn: () => api<Ayrinti>(`/sevkiyat/${encodeURIComponent(no)}`) });
  const [barkod, setBarkod] = useState("");
  const [irsaliye, setIrsaliye] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const depo = rolVar(oturum, "DEPO", "SEF");
  const d = a.data;
  const hazir = d?.sevkiyat.durum === "HAZIRLANIYOR";
  const onay = satir ? onayOzeti(satir) : null;
  const onayBekliyor = !!onay && onay.durum !== "ONAYLANDI";
  useEffect(() => {
    if (d?.sevkiyat.irsaliyeNo && !irsaliye) setIrsaliye(d.sevkiyat.irsaliyeNo);
  }, [d?.sevkiyat.irsaliyeNo]);

  const odak = () => setTimeout(() => ref.current?.focus(), 0);
  const okut = useMutation({
    mutationFn: (b: string) => api<any>(`/sevkiyat/${no}/okut`, { govde: { barkod: b } }),
    onSuccess: (c) => {
      toast.success(`${c.eklenen} eklendi · ${c.birimSayisi} parça, ${sayi(c.toplam)}`);
      setBarkod("");
      qc.invalidateQueries();
      odak();
    },
    onError: (e) => {
      toast.error(hataMesaji(e, "Eklenemedi."));
      setBarkod("");
      odak();
    },
  });
  const cikar = useMutation({
    mutationFn: (b: string) => api<any>(`/sevkiyat/${no}/cikar`, { govde: { barkod: b } }),
    onSuccess: (c) => {
      toast.success(`${c.cikarilan} sevkiyattan çıkarıldı (kayıt silinmedi).`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Çıkarılamadı.")),
  });
  const sevk = useMutation({
    mutationFn: () => api<any>(`/sevkiyat/${no}/onayla`, { govde: { irsaliyeNo: irsaliye.trim() } }),
    onSuccess: (c) => {
      toast.success(`${no} sevk edildi: ${c.satirSayisi} parça. Müşteri ve lot bilgisi kayda geçti.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Sevk edilemedi.")),
  });

  const toplam = d?.satirlar.reduce((x, s) => x + s.miktar, 0) || 0;

  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <PencereBasligi
          ust="F-06 · Sevkiyat"
          baslik={no}
          mono
          ustuCizili={d?.sevkiyat.durum === "IPTAL"}
          aciklama={d ? `${tr(d.sevkiyat.musteri)}${d.sevkiyat.siparisNo ? ` · sipariş ${d.sevkiyat.siparisNo}` : ""}` : "Yükleniyor…"}
        >
          {d && <DurumRozeti renk={DURUM_RENK[d.sevkiyat.durum] || "gri"}>{durumAdi(d.sevkiyat.durum)}</DurumRozeti>}
          {!!d?.satirlar.length && <AkisDugmesi barkod={no} />}
          {hazir && iptalEt && (
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
              {satir?.durum === "IPTAL" && (
                <div className="rounded-lg border border-murekkep/15 bg-tas-100 px-4 py-3 text-sm text-tas-600">
                  <b className="text-murekkep">İptal edildi — kayıt silinmedi.</b> {tr(satir.iptalEdenAd)} · {tarihSaat(satir.iptalZamani)} · {tr(satir.iptalGerekcesi)}
                </div>
              )}
              {hazir && depo && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const b = barkodAyikla(barkod);
                    if (b && !okut.isPending) okut.mutate(b);
                  }}
                  className="space-y-2 rounded-xl border-2 border-murekkep/80 p-4"
                >
                  <div className="font-display text-lg font-bold text-murekkep">Parça okut</div>
                  <p className="text-sm text-tas-500">Araca yüklenen her parçanın etiketini okutun. Karantinadaki, bloke ya da kalite onayı almamış parça kabul edilmez.</p>
                  <div className="relative">
                    <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tas-400" />
                    <input ref={ref} autoFocus className={`${girdi} h-12 pl-11 font-mono text-base`} value={barkod} onChange={(e) => setBarkod(e.target.value)} placeholder="FG-2610-0001-01" spellCheck={false} autoComplete="off" />
                  </div>
                </form>
              )}
              <BilgiKutulari
                kutular={[
                  ["Parça", String(d.satirlar.length)],
                  ["Toplam", `${sayi(toplam)} ${d.satirlar[0]?.olcuBirimi || ""}`],
                  ["Lot sayısı", String(new Set(d.satirlar.map((s) => s.lotNo)).size)],
                  ["İrsaliye", d.sevkiyat.irsaliyeNo || "—"],
                ]}
              />
              <Bolum baslik="Sevkiyattaki parçalar">
                {d.satirlar.length ? (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-tas-100">
                      {d.satirlar.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2">
                            <BarkodLink barkod={s.barkod} />
                          </td>
                          <td className="py-2 text-xs text-tas-500">{s.urunKod}</td>
                          <td className="sayi py-2 text-right">
                            {sayi(s.miktar)} {s.olcuBirimi}
                          </td>
                          <td className="py-2 pl-3 text-xs text-tas-500">{durumAdi(s.durum)}</td>
                          <td className="py-2 text-right">
                            {hazir && depo && (
                              <button onClick={() => cikar.mutate(s.barkod)} title="Sevkiyattan çıkar (kayıt silinmez)" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-tas-500 hover:bg-unity-acik hover:text-unity">
                                <X className="h-3.5 w-3.5" /> Çıkar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-tas-400">Henüz parça okutulmadı.</p>
                )}
              </Bolum>
              {hazir && depo && (
                <div className="space-y-3 rounded-xl border border-tas-200 p-4">
                  <div className="font-display text-lg font-bold text-murekkep">Sevk et</div>
                  {onayBekliyor && <p className="text-sm text-dikkat">Sevk için önce {tr(onay?.atananAd)} sevkiyatı onaylamalı.</p>}
                  <div className="flex flex-wrap items-end gap-3">
                    <Alan etiket="İrsaliye no">
                      <input className={girdi} value={irsaliye} onChange={(e) => setIrsaliye(e.target.value)} />
                    </Alan>
                    <Button onClick={() => sevk.mutate()} disabled={!irsaliye.trim() || !d.satirlar.length || onayBekliyor || sevk.isPending} className="h-10 gap-1.5 bg-uygun font-semibold hover:bg-uygun/90">
                      {sevk.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Sevk et
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-5">
              <Bolum baslik="Sevkiyat onayı">
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
                    {satir?.durum !== "IPTAL" && <OnayIslemleri onay={onay} tur="SEVKIYAT" kayitNo={no} />}
                  </div>
                ) : (
                  <p className="text-sm text-tas-400">Onaya gönderilmemiş (eski kayıt).</p>
                )}
                {satir && (
                  <div className="mt-3 space-y-1 border-t border-tas-100 pt-3 text-xs text-tas-500">
                    <div>
                      Hazırlayan: <b className="text-murekkep">{tr(satir.olusturanAd)}</b> · {tarihSaat(satir.olusturmaZamani)}
                    </div>
                    {satir.onaylayanAd && (
                      <div>
                        Sevk eden: <b className="text-murekkep">{tr(satir.onaylayanAd)}</b> · {tarihSaat(satir.onayZamani)}
                      </div>
                    )}
                  </div>
                )}
              </Bolum>
              <KimNeYapti tur="SEVKIYAT" no={no} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
