// F-04 Karantina / Red: uretimde ayrilan parcalar (karantina etiketi basilir) ve kalitenin kararlari.
// Karar: Olumlu / Sartli kabul -> parca yeni FG numarasiyla kullanilabilir olur; Yeniden isleme; Hurda.
// Sorumlu/Onay sutunlari formun kendi kararini gosterir: karar kalitenindir.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, Loader2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import { AkisDugmesi, Alan, BilgiKutulari, Bolum, DurumRozeti, EtiketListesi, KimNeYapti, PencereBasligi, SatirDugmesi, girdi } from "@/components/iso/FormParcalari";
import { EtiketOnizleme } from "@/components/barkod/Etiket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getTable } from "@/lib/iso-data";
import { api, hataMesaji } from "@/lib/api";
import { rolVar, useOturum } from "@/lib/oturum";
import { useTanimlar } from "@/lib/tanimlar";
import { durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/karantina-red")({ component: KarantinaRed });

type KR = {
  barkod: string; ilkMiktar: number; olcuBirimi: string; durum: string; ek: { hataKodu?: string; hataAciklama?: string; not?: string };
  olusturmaZamani: string; urunKod: string | null; lotNo: string | null; isEmriNo: string | null; makineKod: string | null;
  kaydedenAd: string | null; kaydedenSicil: string | null;
  kararZamani: string | null; kararNotu: string | null; kararVerenAd: string | null; yeniBarkod: string | null;
};

const BEKLEYEN = ["KARAR_BEKLIYOR", "YENIDEN_ISLEME"];
const ONAY_GIBI: Record<string, ["yesil" | "turuncu" | "kirmizi" | "gri", string]> = {
  KARAR_BEKLIYOR: ["gri", "Bekliyor"],
  YENIDEN_ISLEME: ["turuncu", "Askıda · yeniden işleme"],
  OLUMLU: ["yesil", "Onaylandı · olumlu"],
  SARTLI_KABUL: ["yesil", "Onaylandı · şartlı"],
  HURDA: ["kirmizi", "Reddedildi · hurda"],
};

function KarantinaRed() {
  const table = getTable("karantina-red")!;
  const oturum = useOturum();
  const kalite = rolVar(oturum, "KALITE");
  const ayirabilir = rolVar(oturum, "OPERATOR", "SEF", "KALITE");
  const arama = Route.useSearch() as { ac?: string };
  const [secili, setSecili] = useState<{ no: string; karar?: boolean } | null>(arama.ac ? { no: arama.ac } : null);
  const [yeni, setYeni] = useState(false);
  useEffect(() => {
    if (arama.ac) setSecili({ no: arama.ac });
  }, [arama.ac]);

  const liste = useQuery({ queryKey: ["karantinalar"], queryFn: () => api<KR[]>("/kalite/karantinalar"), refetchInterval: 20_000 });
  const bul = (no: string) => liste.data?.find((x) => x.barkod === no);

  const satirlar: KayitSatiri[] = useMemo(
    () =>
      (liste.data || []).map((k) => ({
        anahtar: k.barkod,
        veri: {
          "Kayıt Tarihi": k.olusturmaZamani,
          "Ürün Kodu": k.urunKod,
          "Lot No": k.lotNo || "Top bitmedi",
          Makine: k.makineKod,
          "Sepet/Ayrım": tr(k.ek?.not) || "Karantina alanı",
          "Hata Kodu": k.ek?.hataKodu,
          "Hata Açıklaması": tr(k.ek?.hataAciklama),
          Miktar: k.ilkMiktar,
          Birim: k.olcuBirimi,
          Karar: durumAdi(k.durum),
          "Karar Veren": tr(k.kararVerenAd),
          "Karar Tarihi": k.kararZamani,
          "Etiket No": k.barkod,
          "Yeni Etiket No": k.yeniBarkod,
        },
        baglantilar: { "Etiket No": k.barkod, ...(k.yeniBarkod ? { "Yeni Etiket No": k.yeniBarkod } : {}), ...(k.lotNo ? { "Lot No": k.lotNo } : {}) },
        akis: k.barkod,
        barkodlar: k.yeniBarkod ? [k.yeniBarkod] : [],
        kaydeden: { ad: k.kaydedenAd, zaman: k.olusturmaZamani },
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
          onayTuru="KARANTINA"
          yukleniyor={liste.isLoading}
          hata={liste.isError ? hataMesaji(liste.error, "Liste yüklenemedi.") : null}
          onSatir={(s) => setSecili({ no: s.anahtar })}
          sorumluHucre={() => <span className="text-tas-500">Kalite</span>}
          onayHucre={(s) => {
            const k = bul(s.anahtar)!;
            const [renk, yazi] = ONAY_GIBI[k.durum] || ["gri", durumAdi(k.durum)];
            return <DurumRozeti renk={renk} alt={k.kararVerenAd ? `${tr(k.kararVerenAd)} · ${tarihSaat(k.kararZamani)}` : undefined}>{yazi}</DurumRozeti>;
          }}
          bendeMi={(s) => kalite && BEKLEYEN.includes(bul(s.anahtar)!.durum)}
          ekIslem={(s) =>
            kalite && BEKLEYEN.includes(bul(s.anahtar)!.durum) ? (
              <SatirDugmesi vurgu onClick={() => setSecili({ no: s.anahtar, karar: true })}>
                <Gavel className="h-3.5 w-3.5" /> Karar ver
              </SatirDugmesi>
            ) : null
          }
          araclar={
            ayirabilir && (
              <Button onClick={() => setYeni(true)} className="h-10 gap-2 bg-unity px-4 font-semibold hover:bg-unity-koyu">
                <Plus className="h-4 w-4" /> Yeni Kayıt
              </Button>
            )
          }
        />
      </div>
      {yeni && <YeniKarantina kapat={() => setYeni(false)} />}
      {secili && <KarantinaAyrinti kr={bul(secili.no)} no={secili.no} kararAcik={!!secili.karar} kapat={() => setSecili(null)} />}
    </div>
  );
}

function YeniKarantina({ kapat }: { kapat: () => void }) {
  const qc = useQueryClient();
  const t = useTanimlar();
  const ie = useQuery({ queryKey: ["is-emirleri", "calisan"], queryFn: () => api<{ no: string; urunKod: string; makineKod: string; olcuBirimi: string }[]>("/is-emirleri?durum=URETIMDE,ILK_PARCA_BEKLIYOR") });
  const [f, setF] = useState({ isEmri: "", hataKodu: "", miktar: "", not: "" });
  const [sonuc, setSonuc] = useState<string | null>(null);
  const secili = ie.data?.find((x) => x.no === f.isEmri);
  const m = useMutation({
    mutationFn: () => api<any>(`/is-emirleri/${f.isEmri}/karantina`, { govde: { hataKodu: f.hataKodu, miktar: f.miktar.replace(",", "."), not: f.not || undefined } }),
    onSuccess: (c) => {
      toast.success(`${c.karantina.barkod} karantina etiketi hazır.`);
      setSonuc(c.karantina.barkod);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Kaydedilemedi.")),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <PencereBasligi ust="F-04 · Karantina / Red" baslik={sonuc ? `${sonuc} ayrıldı` : "Karantinaya ayır"} aciklama="Üretimde olan bir iş emrinden ayrılan parça. Etiketi basıp parçaya yapıştırın." />
        <div className="space-y-4 px-6 pb-6">
          {sonuc ? (
            <>
              <EtiketListesi barkodlar={[sonuc]} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setSonuc(null); setF({ ...f, miktar: "", not: "" }); }}>
                  Bir tane daha
                </Button>
                <Button onClick={kapat}>Tamam</Button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                m.mutate();
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Alan etiket="Üretimdeki iş emri" genis ipucu={!ie.data?.length && !ie.isLoading ? "Şu an üretimde iş emri yok." : undefined}>
                <select className={girdi} value={f.isEmri} onChange={(e) => setF({ ...f, isEmri: e.target.value })}>
                  <option value="">Seçiniz</option>
                  {ie.data?.map((x) => (
                    <option key={x.no} value={x.no}>
                      {x.no} — {x.urunKod} · {x.makineKod}
                    </option>
                  ))}
                </select>
              </Alan>
              <Alan etiket="Hata kodu">
                <select className={girdi} value={f.hataKodu} onChange={(e) => setF({ ...f, hataKodu: e.target.value })}>
                  <option value="">Seçiniz</option>
                  {t.data?.["hata-kodlari"].map((h) => (
                    <option key={h.kod} value={h.kod}>
                      {h.kod} — {tr(h.aciklama)}
                    </option>
                  ))}
                </select>
              </Alan>
              <Alan etiket={`Miktar (${secili?.olcuBirimi || "m"})`}>
                <input className={girdi} inputMode="decimal" value={f.miktar} onChange={(e) => setF({ ...f, miktar: e.target.value })} />
              </Alan>
              <Alan etiket="Sepet / not (isteğe bağlı)" genis>
                <input className={girdi} value={f.not} onChange={(e) => setF({ ...f, not: e.target.value })} placeholder="Sarı sepet, tel koptu…" />
              </Alan>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={kapat}>
                  Vazgeç
                </Button>
                <Button type="submit" disabled={!f.isEmri || !f.hataKodu || !(Number(f.miktar.replace(",", ".")) > 0) || m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
                  {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Ayır ve etiket bas
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KarantinaAyrinti({ kr, no, kararAcik, kapat }: { kr?: KR; no: string; kararAcik: boolean; kapat: () => void }) {
  const oturum = useOturum();
  const qc = useQueryClient();
  const [karar, setKarar] = useState<string>("");
  const [not, setNot] = useState("");
  const [yeniEtiket, setYeniEtiket] = useState<string | null>(null);
  const bekliyor = !!kr && BEKLEYEN.includes(kr.durum);
  const kalite = rolVar(oturum, "KALITE");
  const m = useMutation({
    mutationFn: () => api<any>(`/kalite/karantina/${no}/karar`, { govde: { karar, not: not || undefined } }),
    onSuccess: (c) => {
      toast.success(`${no}: ${durumAdi(c.karar)}${c.yeniBirim ? ` → yeni etiket ${c.yeniBirim.barkod}` : ""}`);
      if (c.yeniBirim) setYeniEtiket(c.yeniBirim.barkod);
      setKarar("");
      setNot("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Karar kaydedilemedi.")),
  });
  const secenekler: [string, string, string, string][] = [
    ["OLUMLU", "Olumlu", "Parça kullanılabilir; yeni barkodla etiketlenir", "border-uygun bg-uygun-acik text-uygun"],
    ["SARTLI_KABUL", "Şartlı kabul", "Kullanılabilir, şartı not edilir", "border-uygun bg-uygun-acik text-uygun"],
    ...(kr?.durum === "KARAR_BEKLIYOR" ? ([["YENIDEN_ISLEME", "Yeniden işleme", "Düzeltilip tekrar değerlendirilir", "border-dikkat bg-dikkat-acik text-dikkat"]] as [string, string, string, string][]) : []),
    ["HURDA", "Hurda", "Kullanılamaz; fire olarak düşer", "border-unity bg-sorun-acik text-unity-koyu"],
  ];
  const notZorunlu = karar === "SARTLI_KABUL" || karar === "HURDA";

  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <PencereBasligi ust="F-04 · Karantina parçası" baslik={no} mono aciklama={kr ? `${kr.ek?.hataKodu} ${tr(kr.ek?.hataAciklama)} · iş emri ${kr.isEmriNo} · ${kr.makineKod}` : ""}>
          {kr && <DurumRozeti renk={(ONAY_GIBI[kr.durum] || ["gri"])[0]}>{durumAdi(kr.durum)}</DurumRozeti>}
          <AkisDugmesi barkod={no} />
        </PencereBasligi>
        {kr && (
          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-5">
              {bekliyor && kalite && (
                <div className={cn("space-y-4 rounded-xl border-2 bg-white p-4", kararAcik ? "border-murekkep/80" : "border-tas-200")}>
                  <div className="font-display text-lg font-bold text-murekkep">Kalite kararı</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {secenekler.map(([k, e, a, s]) => (
                      <button key={k} type="button" onClick={() => setKarar(k)} className={cn("rounded-lg border-2 px-3 py-2.5 text-left transition", karar === k ? s : "border-tas-200 text-tas-600 hover:border-tas-300")}>
                        <div className="text-sm font-semibold">{e}</div>
                        <div className="text-[11px] opacity-80">{a}</div>
                      </button>
                    ))}
                  </div>
                  <Alan etiket={notZorunlu ? "Gerekçe (zorunlu)" : "Not (isteğe bağlı)"}>
                    <input className={girdi} value={not} onChange={(e) => setNot(e.target.value)} />
                  </Alan>
                  <Button onClick={() => m.mutate()} disabled={!karar || (notZorunlu && !not.trim()) || m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
                    {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} Kararı kaydet
                  </Button>
                </div>
              )}
              {yeniEtiket && <EtiketListesi barkodlar={[yeniEtiket]} baslik="Parçanın yeni etiketi: eski karantina etiketinin üstüne yapıştırın" />}
              <BilgiKutulari
                kutular={[
                  ["Miktar", `${sayi(kr.ilkMiktar)} ${kr.olcuBirimi}`],
                  ["Ayıran", tr(kr.kaydedenAd) || "—"],
                  ["Lot", kr.lotNo || "—"],
                  ["Karar", durumAdi(kr.durum)],
                ]}
              />
              {kr.kararVerenAd && (
                <div className="rounded-lg bg-tas-50 px-4 py-3 text-sm text-tas-600">
                  <b className="text-murekkep">{tr(kr.kararVerenAd)}</b> · {tarihSaat(kr.kararZamani)} · {durumAdi(kr.durum)}
                  {kr.kararNotu && <div>“{tr(kr.kararNotu)}”</div>}
                </div>
              )}
              <Bolum baslik="Karantina etiketi">
                <EtiketOnizleme barkod={no} />
              </Bolum>
            </div>
            <div className="space-y-5">
              <KimNeYapti tur="KARANTINA" no={no} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
