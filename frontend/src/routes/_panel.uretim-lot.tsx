// F-03 Uretim Lot: her top bir uretim lotudur (F-02'de "Topu bitir" ile olusur).
// Metraj/kesim (tire 1, tire 2...), sahit numune ve son kontrol buradan yapilir.
// Miktar dokumu: Toplam = top metraji + karantinaya ayrilan; Uygun + Karantina (karar bekleyen) + Red/Hurda.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ClipboardCheck, Loader2, Printer, Scissors } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { KayitTablosu, type KayitSatiri } from "@/components/iso/KayitTablosu";
import {
  AkisDugmesi, Alan, BarkodLink, BilgiKutulari, Bolum, DurumRozeti, EtiketListesi, KimNeYapti, PencereBasligi, SatirDugmesi, Yukleniyor, girdi,
} from "@/components/iso/FormParcalari";
import { EtiketOnizleme } from "@/components/barkod/Etiket";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getTable } from "@/lib/iso-data";
import { api, ApiHatasi, hataMesaji } from "@/lib/api";
import { rolVar, useOturum } from "@/lib/oturum";
import { useTanimlar } from "@/lib/tanimlar";
import { BIRIM_TIPI, durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { cn } from "@/lib/utils";
import { lotHesap, vardiya, type LotSatiri } from "@/lib/lot";

export const Route = createFileRoute("/_panel/uretim-lot")({ component: UretimLot });

function UretimLot() {
  const table = getTable("uretim-lot")!;
  const oturum = useOturum();
  const kalite = rolVar(oturum, "KALITE");
  const kesebilir = rolVar(oturum, "OPERATOR", "SEF", "KALITE");
  const arama = Route.useSearch() as { ac?: string };
  const [secili, setSecili] = useState<{ no: string; islem?: Panel } | null>(arama.ac ? { no: arama.ac } : null);
  useEffect(() => {
    if (arama.ac) setSecili({ no: arama.ac });
  }, [arama.ac]);

  const liste = useQuery({ queryKey: ["lotlar"], queryFn: () => api<LotSatiri[]>("/lotlar"), refetchInterval: 20_000 });

  const satirlar: KayitSatiri[] = useMemo(
    () =>
      (liste.data || []).map((l) => {
        const h = lotHesap(l);
        return {
          anahtar: l.no,
          veri: {
            Tarih: l.bitis,
            "Üretim Emri No": l.isEmriNo,
            "Lot No": l.no,
            "Ürün Kodu": l.urunKod,
            Makine: l.makineKod,
            Operatör: tr(l.operatorAd),
            Vardiya: vardiya(l.baslangic),
            Başlangıç: l.baslangic,
            Bitiş: l.bitis,
            "Hammadde Lot No": l.hammaddeLotlari,
            "Toplam Üretim": h.toplam,
            "Uygun Miktar": l.uygun,
            Karantina: l.karantinaBekleyen,
            "Red/Hurda": h.redHurda,
            "Fire %": h.fire,
            "Lot Durumu": h.durum,
          },
          baglantilar: { "Lot No": l.no, ...(l.hammaddeLotlari && !l.hammaddeLotlari.includes(",") ? { "Hammadde Lot No": l.hammaddeLotlari } : {}) },
          akis: l.no,
          kaydeden: { ad: l.operatorAd, zaman: l.bitis },
        };
      }),
    [liste.data],
  );
  const bul = (no: string) => liste.data?.find((x) => x.no === no);

  return (
    <div className="animate-belir">
      <PageHeader eyebrow={table.code} title={table.title} description={table.description} />
      <div className="p-8">
        <KayitTablosu
          table={table}
          satirlar={satirlar}
          onayTuru="URETIM_LOT"
          yukleniyor={liste.isLoading}
          hata={liste.isError ? hataMesaji(liste.error, "Liste yüklenemedi.") : null}
          bosMesaj="Henüz üretim lotu yok. Lotlar F-02 Üretim Emri'nde “Topu bitir” ile oluşur."
          onSatir={(s) => setSecili({ no: s.anahtar })}
          sorumluHucre={() => <span className="text-tas-500">Kalite</span>}
          onayHucre={(s) => {
            const l = bul(s.anahtar)!;
            const h = lotHesap(l);
            return <DurumRozeti renk={h.renk}>{h.durum}</DurumRozeti>;
          }}
          bendeMi={(s) => {
            const l = bul(s.anahtar)!;
            return (kalite && l.kaliteBekleyen > 0) || (kesebilir && l.topDurum === "KESIM_BEKLIYOR");
          }}
          ekIslem={(s) => {
            const l = bul(s.anahtar)!;
            return (
              <>
                {kesebilir && l.topDurum === "KESIM_BEKLIYOR" && (
                  <SatirDugmesi vurgu onClick={() => setSecili({ no: l.no, islem: "kesim" })}>
                    <Scissors className="h-3.5 w-3.5" /> Kes
                  </SatirDugmesi>
                )}
                {kalite && l.kaliteBekleyen > 0 && (
                  <SatirDugmesi vurgu onClick={() => setSecili({ no: l.no, islem: "son" })}>
                    <ClipboardCheck className="h-3.5 w-3.5" /> Son kontrol
                  </SatirDugmesi>
                )}
              </>
            );
          }}
        />
      </div>
      {secili && <LotAyrinti no={secili.no} ilkIslem={secili.islem} kapat={() => setSecili(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------
type Panel = "kesim" | "numune" | "son";
type Birim = { barkod: string; tip: string; ilkMiktar: number; miktar: number; olcuBirimi: string; durum: string; bloke: boolean; yer: string | null; ek: any; olusturmaZamani: string; kaynakBirimId: string | null; olusturanAd: string | null };
type Kar = { id: string; ad: string; nominal: number | null; altSinir: number | null; ustSinir: number | null; olcuBirimi: string | null };

function LotAyrinti({ no, ilkIslem, kapat }: { no: string; ilkIslem?: Panel; kapat: () => void }) {
  const oturum = useOturum();
  const qc = useQueryClient();
  const a = useQuery({ queryKey: ["lotlar", no], queryFn: () => api<{ lot: LotSatiri; birimler: Birim[]; metrajKarakteristikleri: Kar[] }>(`/lotlar/${encodeURIComponent(no)}`) });
  const [panel, setPanel] = useState<Panel | null>(ilkIslem || null);
  const [etiketler, setEtiketler] = useState<string[]>([]);
  const [etiket, setEtiket] = useState<string | null>(null);
  const l = a.data?.lot;
  const h = l ? lotHesap(l) : null;
  const kalite = rolVar(oturum, "KALITE");

  const bitti = (yeni?: string[]) => {
    if (yeni?.length) setEtiketler(yeni);
    setPanel(null);
    qc.invalidateQueries();
  };

  const dugme = (k: Panel, etiket: string, Ikon: typeof Scissors, goster: boolean) =>
    goster && (
      <Button
        variant="outline"
        onClick={() => setPanel(panel === k ? null : k)}
        className={cn("gap-1.5", panel === k && "border-murekkep bg-murekkep text-white hover:bg-murekkep hover:text-white")}
      >
        <Ikon className="h-4 w-4" /> {etiket}
      </Button>
    );

  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <PencereBasligi
          ust="F-03 · Üretim lotu"
          baslik={no}
          mono
          aciklama={
            l ? (
              <>
                {l.urunKod} {tr(l.urunAd)} · {l.makineKod} · iş emri{" "}
                <Link to={"/tablo/uretim-emri" as any} search={{ ac: l.isEmriNo } as any} className="font-mono font-semibold underline">
                  {l.isEmriNo}
                </Link>{" "}
                · {tr(l.operatorAd)}
              </>
            ) : (
              "Yükleniyor…"
            )
          }
        >
          {h && <DurumRozeti renk={h.renk}>{h.durum}</DurumRozeti>}
          <AkisDugmesi barkod={no} etiket="Akış diyagramı ve bakiye" />
          {l && dugme("kesim", "Kesim (metraj)", Scissors, rolVar(oturum, "OPERATOR", "SEF", "KALITE") && l.topDurum === "KESIM_BEKLIYOR")}
          {l && dugme("numune", "Şahit numune", Archive, rolVar(oturum, "KALITE", "OPERATOR") && !l.numuneBarkod)}
          {l && dugme("son", "Son kontrol", ClipboardCheck, kalite && l.kaliteBekleyen > 0)}
        </PencereBasligi>
        {!a.data || !l || !h ? (
          <Yukleniyor />
        ) : (
          <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
              {panel === "kesim" && <KesimPaneli lot={l} kars={a.data.metrajKarakteristikleri} bitti={bitti} />}
              {panel === "numune" && <NumunePaneli lot={l} bitti={bitti} />}
              {panel === "son" && <SonKontrolPaneli lot={l} bitti={bitti} />}
              {etiketler.length > 0 && <EtiketListesi barkodlar={etiketler} key={etiketler.join()} />}

              <BilgiKutulari
                kutular={[
                  ["Toplam üretim", `${sayi(h.toplam)} ${l.olcuBirimi}`],
                  ["Uygun", `${sayi(l.uygun)} ${l.olcuBirimi}`],
                  ["Karantinada", `${sayi(l.karantinaBekleyen)} ${l.olcuBirimi}`],
                  ["Red / hurda", `${sayi(h.redHurda)} ${l.olcuBirimi}`],
                ]}
              />
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="text-tas-500">
                  Fire: <b className="text-murekkep">%{sayi(h.fire * 100, 1)}</b>
                </div>
                <div className="text-tas-500">
                  Vardiya: <b className="text-murekkep">{vardiya(l.baslangic)}</b>
                </div>
                <div className="text-tas-500">
                  Başlangıç: <b className="text-murekkep">{tarihSaat(l.baslangic)}</b>
                </div>
                <div className="text-tas-500">
                  Bitiş: <b className="text-murekkep">{tarihSaat(l.bitis)}</b>
                </div>
              </div>
              <div className="text-sm text-tas-500">
                Hammadde lotları:{" "}
                {(l.hammaddeLotlari || "").split(", ").filter(Boolean).map((x) => (
                  <span key={x} className="mr-2">
                    <BarkodLink barkod={x} />
                  </span>
                ))}
                {!l.hammaddeLotlari && "—"}
              </div>

              <Bolum baslik="Lotun parçaları">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] font-bold uppercase tracking-wider text-tas-500">
                      <tr>
                        <th className="pb-2">Barkod</th>
                        <th className="pb-2">Tür</th>
                        <th className="pb-2 text-right">Miktar</th>
                        <th className="pb-2 pl-3">Durum</th>
                        <th className="pb-2 pl-3">Kaydeden</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tas-100">
                      {a.data.birimler.map((b) => (
                        <tr key={b.barkod} className={cn(etiket === b.barkod && "bg-unity-acik")}>
                          <td className="whitespace-nowrap py-2">
                            <BarkodLink barkod={b.barkod} />
                          </td>
                          <td className="py-2 text-xs text-tas-500">{BIRIM_TIPI[b.tip]?.kisa || b.tip}</td>
                          <td className="sayi whitespace-nowrap py-2 text-right">
                            {sayi(b.tip === "FG_LOT" || b.tip === "KR" ? b.ilkMiktar : b.miktar)} {b.olcuBirimi}
                          </td>
                          <td className="py-2 pl-3 text-xs">
                            {durumAdi(b.durum)}
                            {b.bloke && <b className="ml-1 text-unity">· bloke</b>}
                            {b.ek?.sartliKabul && <b className="ml-1 text-dikkat">· şartlı</b>}
                          </td>
                          <td className="whitespace-nowrap py-2 pl-3 text-xs text-tas-500">{tr(b.olusturanAd)}</td>
                          <td className="py-2 text-right">
                            <button onClick={() => setEtiket(etiket === b.barkod ? null : b.barkod)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-tas-500 hover:bg-tas-100 hover:text-unity">
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
              </Bolum>
            </div>
            <div className="space-y-5">
              <KimNeYapti tur="URETIM_LOT" no={no} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PanelKutusu({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border-2 border-murekkep/80 bg-white p-4">
      <div>
        <div className="font-display text-lg font-bold text-murekkep">{baslik}</div>
        {aciklama && <p className="text-sm text-tas-500">{aciklama}</p>}
      </div>
      {children}
    </div>
  );
}

function KesimPaneli({ lot, kars, bitti }: { lot: LotSatiri; kars: Kar[]; bitti: (e?: string[]) => void }) {
  const t = useTanimlar();
  const boyVarsayilan = t.data?.urunler.find((u) => u.kod === lot.urunKod)?.kesimBoyu;
  const [adet, setAdet] = useState("");
  const [boy, setBoy] = useState("");
  const [liste, setListe] = useState("");
  const [fire, setFire] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [olcum, setOlcum] = useState<Record<string, string>>({});
  useEffect(() => {
    if (boyVarsayilan && !boy) {
      setBoy(String(boyVarsayilan));
      setAdet(String(Math.floor(lot.topMetraji / boyVarsayilan)));
    }
  }, [boyVarsayilan]);
  const n = (x: string) => Number(String(x).replace(",", "."));
  const parcalar = liste.trim()
    ? liste.split(/[\s;,]+/).filter(Boolean).map(n)
    : n(adet) > 0 && n(boy) > 0
      ? Array.from({ length: Math.min(500, Math.floor(n(adet))) }, () => n(boy))
      : [];
  const toplam = parcalar.reduce((a, x) => a + (x || 0), 0) + (n(fire) || 0);
  const fark = lot.topMetraji - toplam;

  const m = useMutation({
    mutationFn: () =>
      api<any>(`/lotlar/${lot.no}/kesim`, {
        govde: {
          parcalar,
          kesimFiresi: fire ? n(fire) : undefined,
          aciklama: aciklama || undefined,
          olcumler: kars.map((k) => ({ karakteristikId: k.id, deger: (olcum[k.id] || "").replace(",", ".") })),
        },
      }),
    onSuccess: (c) => {
      toast.success(`${c.birimler.length} parça kesildi ve etiketlendi. Parçalar son kontrol bekliyor.`);
      bitti(c.birimler.map((b: any) => b.barkod));
    },
    onError: (e) => {
      if (e instanceof ApiHatasi && e.durum === 409 && e.kod === "HATA") {
        toast.error("Metraj ölçümü tolerans dışı: top karantinaya alındı, kesim yapılmadı.");
        bitti();
      } else toast.error(hataMesaji(e, "Kesim yapılamadı."));
    },
  });
  const gecersiz = !parcalar.length || parcalar.some((x) => !(x > 0)) || kars.some((k) => !olcum[k.id]);

  return (
    <PanelKutusu baslik="Kesim (metraj)" aciklama={`Top ${sayi(lot.topMetraji)} ${lot.olcuBirimi}. Her parçaya aynı lot altında -01, -02… numaralı etiket basılır.`}>
      {kars.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {kars.map((k) => (
            <Alan key={k.id} etiket={`${tr(k.ad)} (${k.altSinir ?? "–"} … ${k.ustSinir ?? "–"} ${k.olcuBirimi || ""})`}>
              <input className={girdi} inputMode="decimal" value={olcum[k.id] || ""} onChange={(e) => setOlcum({ ...olcum, [k.id]: e.target.value })} placeholder={k.nominal !== null ? String(k.nominal) : ""} />
            </Alan>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Alan etiket="Parça sayısı">
          <input className={girdi} inputMode="numeric" value={adet} onChange={(e) => setAdet(e.target.value)} disabled={!!liste.trim()} />
        </Alan>
        <Alan etiket={`Parça boyu (${lot.olcuBirimi})`}>
          <input className={girdi} inputMode="decimal" value={boy} onChange={(e) => setBoy(e.target.value)} disabled={!!liste.trim()} />
        </Alan>
        <Alan etiket={`Kesim firesi (${lot.olcuBirimi})`}>
          <input className={girdi} inputMode="decimal" value={fire} onChange={(e) => setFire(e.target.value)} placeholder="0" />
        </Alan>
      </div>
      <Alan etiket="Ya da parça boylarını tek tek yazın" ipucu="Örnek: 100 100 100 95 (boşluk ya da virgülle)">
        <input className={girdi} value={liste} onChange={(e) => setListe(e.target.value)} />
      </Alan>
      <div className={cn("rounded-lg px-3 py-2 text-sm", Math.abs(fark) > lot.topMetraji * 0.01 ? "bg-dikkat-acik text-dikkat" : "bg-tas-50 text-tas-600")}>
        {parcalar.length} parça + fire = <b>{sayi(toplam)}</b> {lot.olcuBirimi} · toptan fark {sayi(fark)} {lot.olcuBirimi}
        {Math.abs(fark) > lot.topMetraji * 0.01 && " — fark %1'i aşıyor, açıklama zorunlu"}
      </div>
      <Alan etiket="Açıklama">
        <input className={girdi} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      </Alan>
      <Button onClick={() => m.mutate()} disabled={gecersiz || m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Kes ve etiketleri bas
      </Button>
    </PanelKutusu>
  );
}

function NumunePaneli({ lot, bitti }: { lot: LotSatiri; bitti: (e?: string[]) => void }) {
  const t = useTanimlar();
  const [yer, setYer] = useState("");
  const m = useMutation({
    mutationFn: () => api<any>(`/lotlar/${lot.no}/numune`, { govde: { arsivYeri: yer || undefined } }),
    onSuccess: (c) => {
      toast.success(`Şahit numune ${c.numune.barkod} alındı. İmha tarihi: ${c.numune.ek?.imhaTarihi}`);
      bitti([c.numune.barkod]);
    },
    onError: (e) => toast.error(hataMesaji(e, "Numune alınamadı.")),
  });
  return (
    <PanelKutusu baslik="Şahit numune" aciklama="Her lottan bir numune alınır ve saklama süresi boyunca arşivlenir. Küçük numune etiketi basılır.">
      <Alan etiket="Arşiv yeri">
        <select className={girdi} value={yer} onChange={(e) => setYer(e.target.value)}>
          <option value="">Belirtilmedi</option>
          {t.data?.["depo-yerleri"]
            .filter((y) => y.tip === "NUMUNE")
            .map((y) => (
              <option key={y.kod} value={y.kod}>
                {y.kod} {y.ad ? `— ${tr(y.ad)}` : ""}
              </option>
            ))}
        </select>
      </Alan>
      <Button onClick={() => m.mutate()} disabled={m.isPending} className="bg-unity font-semibold hover:bg-unity-koyu">
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Numuneyi kaydet ve etiket bas
      </Button>
    </PanelKutusu>
  );
}

function SonKontrolPaneli({ lot, bitti }: { lot: LotSatiri; bitti: (e?: string[]) => void }) {
  const [karar, setKarar] = useState("SERBEST");
  const [not, setNot] = useState("");
  const m = useMutation({
    mutationFn: () => api<any>("/kalite/son-kontrol", { govde: { lotNo: lot.no, karar, not: not || undefined } }),
    onSuccess: (c) => {
      toast.success(`${c.sayi} parça: ${durumAdi(c.karar)}`);
      bitti();
    },
    onError: (e) => toast.error(hataMesaji(e, "Kaydedilemedi.")),
  });
  const secenek = [
    ["SERBEST", "Uygun — serbest bırak", "border-uygun bg-uygun-acik text-uygun"],
    ["KARANTINA", "Karantinaya al", "border-dikkat bg-dikkat-acik text-dikkat"],
    ["RET", "Ret (hurda)", "border-unity bg-sorun-acik text-unity-koyu"],
  ];
  return (
    <PanelKutusu baslik="Son kontrol" aciklama={`${sayi(lot.kaliteBekleyen)} ${lot.olcuBirimi} parça kalite onayı bekliyor. Karar lotun bekleyen tüm parçalarına uygulanır.`}>
      <div className="grid gap-2 sm:grid-cols-3">
        {secenek.map(([k, e, s]) => (
          <button key={k} type="button" onClick={() => setKarar(k)} className={cn("rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition", karar === k ? s : "border-tas-200 text-tas-600")}>
            {e}
          </button>
        ))}
      </div>
      <Alan etiket={karar === "SERBEST" ? "Not (isteğe bağlı)" : "Gerekçe (zorunlu)"}>
        <input className={girdi} value={not} onChange={(e) => setNot(e.target.value)} />
      </Alan>
      <Button onClick={() => m.mutate()} disabled={m.isPending || (karar !== "SERBEST" && !not.trim())} className="bg-unity font-semibold hover:bg-unity-koyu">
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Kararı kaydet
      </Button>
    </PanelKutusu>
  );
}
