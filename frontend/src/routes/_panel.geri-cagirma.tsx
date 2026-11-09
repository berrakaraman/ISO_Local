// Geri cagirma (sunum sayfa 12): supheli uretimi bul -> etkilenen parcalari bloke et -> sevk edilenlerin musterilerini gor.
// Iki yol: (1) makine + zaman araligi (ornek: proses olcumu tolerans disi cikti), (2) hammadde lotundan ileri izleme.
// Bloke edilen parca kesilemez, sevk edilemez, serbest birakilamaz; bloke kalite tarafindan gerekceyle kaldirilir.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Search, Unlock } from "lucide-react";
import { PageHeader } from "@/components/iso/PageHeader";
import { Alan, BarkodLink, Bolum, DurumRozeti, girdi } from "@/components/iso/FormParcalari";
import { IslemFormu, Tablo, useIslem } from "@/components/iso/Islem";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTanimlar } from "@/lib/tanimlar";
import { rolVar, useOturum } from "@/lib/oturum";
import { BIRIM_TIPI, durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import { barkodAyikla } from "@/components/izle/BarkodArama";

export const Route = createFileRoute("/_panel/geri-cagirma")({ component: GeriCagirma });

type Etkilenen = {
  barkod: string; tip: string; miktar: number; olcuBirimi: string; durum: string; bloke: boolean; lotNo: string | null;
  sevkiyatNo?: string | null; musteri?: string | null;
};
const KAPALI = ["BOLUNDU", "HURDA", "RET", "IPTAL", "TUKENDI", "IMHA_EDILDI"];

function GeriCagirma() {
  const o = useOturum();
  const kalite = rolVar(o, "KALITE");
  const t = useTanimlar();
  const [yol, setYol] = useState<"makine" | "lot">("makine");
  const [f, setF] = useState({ makine: "", baslangic: "", bitis: "", lotNo: "" });
  const [arama, setArama] = useState<typeof f | null>(null);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [neden, setNeden] = useState("");

  const sonuc = useQuery({
    queryKey: ["geri-cagirma", yol, arama],
    enabled: !!arama,
    queryFn: async (): Promise<Etkilenen[]> => {
      if (yol === "makine") {
        const q = new URLSearchParams({ makine: arama!.makine, baslangic: new Date(arama!.baslangic).toISOString(), bitis: new Date(arama!.bitis).toISOString() });
        return (await api<{ birimler: Etkilenen[] }>(`/kalite/etkilenenler?${q}`)).birimler;
      }
      const agac = await api<{ dugumler: any[]; baglar: { kaynak: string; hedef: string; tip: string }[] }>(
        `/izlenebilirlik/${encodeURIComponent(barkodAyikla(arama!.lotNo))}?yon=ileri`,
      );
      // Parca -> sevkiyat dugumu (SEVK baglari); sevk edilmis parca icin son sevkiyat
      const sevkOf = new Map<string, any>();
      for (const b of agac.baglar.filter((x) => x.tip === "SEVK")) {
        const s = agac.dugumler.find((y) => y.id === b.hedef);
        if (s && s.durum === "SEVK_EDILDI") sevkOf.set(b.kaynak, s);
      }
      return agac.dugumler
        .filter((x) => ["FG_LOT", "FG", "KR", "NM"].includes(x.tur))
        .map((x) => {
          const s = sevkOf.get(x.id);
          return { barkod: x.barkod, tip: x.tur, miktar: x.miktar, olcuBirimi: x.olcuBirimi, durum: x.durum, bloke: x.bloke, lotNo: x.lotNo, sevkiyatNo: s?.baslik ?? null, musteri: s?.musteri ?? null };
        });
    },
  });
  const satirlar: Etkilenen[] = sonuc.data || [];
  const acik = satirlar.filter((x) => !KAPALI.includes(x.durum));
  const sevkEdilen = satirlar.filter((x) => x.durum === "SEVK_EDILDI");
  const musteriler = [...new Set(sevkEdilen.map((x) => x.musteri).filter(Boolean))] as string[];
  const toplam = useMemo(() => Math.round(acik.reduce((a, x) => a + Number(x.miktar || 0), 0) * 1000) / 1000, [acik]);

  const bloke = useIslem(() => api<any>("/kalite/bloke", { govde: { barkodlar: [...secili], neden } }), {
    basari: (c) => `${c.blokeEdilen} parça bloke edildi${c.sevkEdilmisOlanlar.length ? ` · ${c.sevkEdilmisOlanlar.length} parça müşteride (sikayet/iade süreci başlatın)` : ""}`,
    sonra: () => {
      setSecili(new Set());
      setNeden("");
    },
  });
  const blokeler = useQuery({ queryKey: ["blokeler"], queryFn: () => api<any[]>("/kalite/blokeler?acik=1") });
  const [kaldir, setKaldir] = useState<{ id: string; gerekce: string } | null>(null);
  const kaldirM = useIslem(() => api<any>(`/kalite/bloke/${kaldir!.id}/kaldir`, { govde: { gerekce: kaldir!.gerekce } }), {
    basari: (c) => `${c.kaldirilan} parçanın blokesi kalktı`,
    sonra: () => setKaldir(null),
  });

  const hazir = yol === "makine" ? !!(f.makine && f.baslangic && f.bitis && f.baslangic < f.bitis) : !!f.lotNo.trim();

  return (
    <div>
      <PageHeader eyebrow="Kalite" title="Geri Çağırma ve Bloke" description="Şüpheli üretimi bulun, etkilenen parçaları bloke edin, sevk edilenlerin hangi müşteride olduğunu görün." />
      <div className="space-y-6 p-8">
        <IslemFormu baslik="Etkilenenleri bul" dugme="Ara" devreDisi={!hazir} onGonder={() => { setSecili(new Set()); setArama({ ...f }); }}>
          <div className="flex gap-2">
            {(["makine", "lot"] as const).map((k) => (
              <Button key={k} type="button" variant={yol === k ? "default" : "outline"} size="sm" onClick={() => { setYol(k); setArama(null); }}>
                {k === "makine" ? "Makine + zaman aralığı" : "Hammadde lotundan"}
              </Button>
            ))}
          </div>
          {yol === "makine" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Alan etiket="Makine">
                <select className={girdi} value={f.makine} onChange={(e) => setF({ ...f, makine: e.target.value })}>
                  <option value="">Seçiniz</option>
                  {t.data?.makineler.map((m) => (
                    <option key={m.kod} value={m.kod}>
                      {m.kod} — {tr(m.ad)}
                    </option>
                  ))}
                </select>
              </Alan>
              <Alan etiket="Başlangıç">
                <input type="datetime-local" className={girdi} value={f.baslangic} onChange={(e) => setF({ ...f, baslangic: e.target.value })} />
              </Alan>
              <Alan etiket="Bitiş">
                <input type="datetime-local" className={girdi} value={f.bitis} onChange={(e) => setF({ ...f, bitis: e.target.value })} />
              </Alan>
            </div>
          ) : (
            <Alan etiket="Hammadde lot no ya da ambalaj barkodu">
              <input className={`${girdi} font-mono`} value={f.lotNo} onChange={(e) => setF({ ...f, lotNo: e.target.value })} placeholder="RM-2611-0001" />
            </Alan>
          )}
        </IslemFormu>

        {arama && (
          <Bolum
            baslik={<><Search className="h-4 w-4" /> Etkilenen parçalar</>}
            sag={
              <span className="text-xs text-tas-500">
                {satirlar.length} kayıt · açıkta {acik.length} parça ({sayi(toplam)}) · müşteride {sevkEdilen.length}
                {musteriler.length > 0 && ` (${musteriler.map(tr).join(", ")})`}
              </span>
            }
          >
            <Tablo<Etkilenen>
              yukleniyor={sonuc.isLoading}
              satirlar={satirlar}
              anahtar={(r) => r.barkod}
              bos={sonuc.isError ? "Arama yapılamadı." : "Bu aralıkta üretim yok."}
              sutunlar={[
                {
                  baslik: "",
                  hucre: (r) =>
                    kalite && !KAPALI.includes(r.durum) && !r.bloke ? (
                      <input
                        type="checkbox"
                        checked={secili.has(r.barkod)}
                        onChange={(e) => {
                          const s = new Set(secili);
                          e.target.checked ? s.add(r.barkod) : s.delete(r.barkod);
                          setSecili(s);
                        }}
                      />
                    ) : null,
                },
                { baslik: "Barkod", hucre: (r) => <BarkodLink barkod={r.barkod} /> },
                { baslik: "Tür", hucre: (r) => BIRIM_TIPI[r.tip]?.kisa || r.tip },
                { baslik: "Lot", hucre: (r) => <span className="font-mono text-xs">{r.lotNo}</span> },
                { baslik: "Miktar", sag: true, hucre: (r) => `${sayi(r.miktar)} ${r.olcuBirimi || ""}` },
                {
                  baslik: "Durum",
                  hucre: (r) => (
                    <DurumRozeti renk={r.bloke ? "kirmizi" : r.durum === "SEVK_EDILDI" ? "turuncu" : KAPALI.includes(r.durum) ? "gri" : "yesil"}>
                      {r.bloke ? "Bloke · " : ""}
                      {durumAdi(r.durum)}
                    </DurumRozeti>
                  ),
                },
                { baslik: "Müşteri / sevkiyat", hucre: (r) => (r.musteri ? `${tr(r.musteri)} · ${r.sevkiyatNo}` : "—") },
              ]}
            />
            {kalite && acik.some((x) => !x.bloke) && (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-tas-100 pt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setSecili(new Set(acik.filter((x) => !x.bloke).map((x) => x.barkod)))}>
                  Açıktakilerin hepsini seç
                </Button>
                <Alan etiket="Bloke nedeni">
                  <input className={girdi} value={neden} onChange={(e) => setNeden(e.target.value)} placeholder="OR03 15:20-15:55 çap sapması" />
                </Alan>
                <Button disabled={!secili.size || neden.trim().length < 5 || bloke.isPending} onClick={() => bloke.mutate()} className="gap-1.5 bg-unity hover:bg-unity-koyu">
                  <Lock className="h-4 w-4" /> {secili.size} parçayı bloke et
                </Button>
              </div>
            )}
          </Bolum>
        )}

        <Bolum baslik="Açık blokeler">
          <Tablo<any>
            yukleniyor={blokeler.isLoading}
            satirlar={blokeler.data}
            anahtar={(r) => r.id}
            bos="Açık bloke yok."
            sutunlar={[
              { baslik: "Açılış", hucre: (r) => tarihSaat(r.acilmaZamani) },
              { baslik: "Neden", hucre: (r) => tr(r.neden) },
              { baslik: "Açan", hucre: (r) => tr(r.acanAd) },
              { baslik: "Parça", sag: true, hucre: (r) => r.birimSayisi },
              {
                baslik: "",
                hucre: (r) =>
                  kalite &&
                  (kaldir?.id === r.id ? (
                    <div className="flex gap-2">
                      <input className={girdi} autoFocus placeholder="Kaldırma gerekçesi" value={kaldir.gerekce} onChange={(e) => setKaldir({ id: r.id, gerekce: e.target.value })} />
                      <Button size="sm" disabled={kaldir.gerekce.trim().length < 5 || kaldirM.isPending} onClick={() => kaldirM.mutate()}>
                        Kaldır
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setKaldir({ id: r.id, gerekce: "" })}>
                      <Unlock className="h-3.5 w-3.5" /> Blokeyi kaldır
                    </Button>
                  )),
              },
            ]}
          />
        </Bolum>
      </div>
    </div>
  );
}
