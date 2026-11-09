// Kalite Yonetim Sistemi destek kayitlari (ISO 9001: 7.1.5, 7.2, 8.4, 8.7, 9.1.2, 10.2):
// musteri sikayeti + iade, DOF, olcum aletleri ve kalibrasyon, bakim / ariza kaydi, egitim, tedarikci degerlendirme, numune arsivi.
// Kurallar backend'de: DOF kapanmadan sikayet kapanmaz, sorumlu kendi DOF'unu kapatamaz, kalibrasyonu gecmis aletle olcum yapilmaz,
// tedarikci puani lotlardan hesaplanir; bakim / ariza elle, tek seferde kaydedilir.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/iso/PageHeader";
import { Alan, BarkodLink, Bolum, DurumRozeti, girdi } from "@/components/iso/FormParcalari";
import { IslemFormu, Sekmeler, Tablo, nokta, sayiMi, useIslem } from "@/components/iso/Islem";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useTanimlar } from "@/lib/tanimlar";
import { rolVar, useOturum } from "@/lib/oturum";
import { durumAdi, sayi, tarihSaat, tr } from "@/lib/sozluk";
import {
  bugunStr, useAletler, useKysKisiler, type Alet, type Bakim, type Dof, type Egitim, type Sikayet, type TedarikciDegerlendirme,
} from "@/lib/kys";
import { barkodAyikla } from "@/components/izle/BarkodArama";

export const Route = createFileRoute("/_panel/kys")({ component: Kys });

type Sekme = "sikayet" | "dof" | "kalibrasyon" | "bakim" | "egitim" | "tedarikci" | "numune";

const renkOf = (d: string): "yesil" | "turuncu" | "kirmizi" | "gri" | "siyah" =>
  ({ KAPANDI: "siyah", ACIK: "kirmizi", INCELEMEDE: "turuncu", UYGULAMADA: "turuncu", DOGRULAMA_BEKLIYOR: "turuncu", GECERLI: "yesil", YAKLASIYOR: "turuncu", GECMIS: "kirmizi", KULLANIM_DISI: "kirmizi", ONAYLI: "yesil", SARTLI: "turuncu", ASKIDA: "kirmizi", BASARILI: "yesil", SURESI_DOLDU: "kirmizi", TEKRAR_GEREKLI: "kirmizi", ARSIVDE: "yesil", IMHA_EDILDI: "gri" } as const)[d] ?? "gri";

function Kys() {
  const sik = useQuery({ queryKey: ["kys", "sikayetler"], queryFn: () => api<Sikayet[]>("/kys/sikayetler") });
  const dof = useQuery({ queryKey: ["kys", "doflar"], queryFn: () => api<Dof[]>("/kys/doflar") });
  const al = useAletler();
  return (
    <div>
      <PageHeader eyebrow="KYS" title="Kalite Sistemi" description="Şikâyet, düzeltici faaliyet, kalibrasyon, bakım, eğitim, tedarikçi ve numune kayıtları — üretim kayıtlarıyla bağlantılı." />
      <div className="p-8">
        <Sekmeler
          sekmeler={[
            { k: "sikayet" as Sekme, ad: "Şikâyet ve iade", sayi: sik.data?.filter((x) => x.durum !== "KAPANDI").length },
            { k: "dof", ad: "DÖF", sayi: dof.data?.filter((x) => x.durum !== "KAPANDI").length },
            { k: "kalibrasyon", ad: "Kalibrasyon", sayi: al.data?.filter((x) => x.kalibrasyonDurumu === "GECMIS" || x.kalibrasyonDurumu === "KULLANIM_DISI").length },
            { k: "bakim", ad: "Bakım / arıza" },
            { k: "egitim", ad: "Eğitim" },
            { k: "tedarikci", ad: "Tedarikçi değerlendirme" },
            { k: "numune", ad: "Numune arşivi" },
          ]}
        >
          {(k) => (
            <>
              {k === "sikayet" && <Sikayetler liste={sik.data} yukleniyor={sik.isLoading} />}
              {k === "dof" && <Doflar liste={dof.data} yukleniyor={dof.isLoading} />}
              {k === "kalibrasyon" && <Kalibrasyon liste={al.data} yukleniyor={al.isLoading} />}
              {k === "bakim" && <Bakimlar />}
              {k === "egitim" && <Egitimler />}
              {k === "tedarikci" && <Tedarikci />}
              {k === "numune" && <Numuneler />}
            </>
          )}
        </Sekmeler>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sikayet + iade
function Sikayetler({ liste, yukleniyor }: { liste?: Sikayet[]; yukleniyor: boolean }) {
  const o = useOturum();
  const yetkili = rolVar(o, "KALITE", "YONETIM");
  const t = useTanimlar();
  const kisiler = useKysKisiler();
  const [f, setF] = useState({ musteriId: "", sevkiyatNo: "", lotNo: "", konu: "", aciklama: "" });
  const yeni = useIslem(() => api<any>("/kys/sikayetler", { govde: { ...f, sevkiyatNo: f.sevkiyatNo || undefined, lotNo: f.lotNo || undefined } }), {
    basari: (c) => `${c.no} şikâyet kaydı açıldı`,
    sonra: () => setF({ musteriId: "", sevkiyatNo: "", lotNo: "", konu: "", aciklama: "" }),
  });
  const [secili, setSecili] = useState<string | null>(null);
  const s = liste?.find((x) => x.no === secili);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Bolum baslik="Şikâyetler">
        <Tablo
          yukleniyor={yukleniyor}
          satirlar={liste}
          anahtar={(r) => r.no}
          satirSinifi={(r) => (r.no === secili ? "bg-tas-50" : "cursor-pointer hover:bg-tas-50")}
          sutunlar={[
            { baslik: "No", hucre: (r) => <button className="font-mono text-xs font-semibold underline" onClick={() => setSecili(r.no)}>{r.no}</button> },
            { baslik: "Müşteri", hucre: (r) => tr(r.musteri) },
            { baslik: "Konu", hucre: (r) => <span className="line-clamp-2">{tr(r.konu)}</span> },
            { baslik: "Sevkiyat / lot", hucre: (r) => <span className="font-mono text-xs">{[r.sevkiyatNo, r.lotNo].filter(Boolean).join(" · ") || "—"}</span> },
            { baslik: "İade", sag: true, hucre: (r) => (r.iadeMiktari ? sayi(r.iadeMiktari) : "—") },
            { baslik: "DÖF", hucre: (r) => (r.dofNo ? <span className="font-mono text-xs">{r.dofNo} · {durumAdi(r.dofDurum)}</span> : "—") },
            { baslik: "Durum", hucre: (r) => <DurumRozeti renk={renkOf(r.durum)}>{durumAdi(r.durum)}</DurumRozeti> },
          ]}
        />
      </Bolum>
      <div className="space-y-5">
        {s && yetkili && s.durum !== "KAPANDI" && <SikayetIslemleri s={s} kisiler={kisiler.data || []} />}
        {s && s.durum === "KAPANDI" && (
          <Bolum baslik={s.no}>
            <p className="text-sm text-tas-600">{tr(s.kapanisNotu)}</p>
            <p className="mt-1 text-xs text-tas-400">{tr(s.kapatanAd)} · {tarihSaat(s.kapanmaZamani)}</p>
          </Bolum>
        )}
        {yetkili && (
          <IslemFormu
            baslik="Yeni şikâyet"
            aciklama="Sevkiyat ya da lot verilirse o müşteriye gerçekten sevk edilmiş olmalı."
            dugme="Şikâyet aç"
            devreDisi={!f.musteriId || f.konu.trim().length < 3}
            bekliyor={yeni.isPending}
            onGonder={() => yeni.mutate()}
          >
            <Alan etiket="Müşteri">
              <select className={girdi} value={f.musteriId} onChange={(e) => setF({ ...f, musteriId: e.target.value })}>
                <option value="">Seçiniz</option>
                {t.data?.musteriler.map((m) => <option key={m.id} value={m.id}>{tr(m.unvan)}</option>)}
              </select>
            </Alan>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Sevkiyat no (isteğe bağlı)"><input className={`${girdi} font-mono`} value={f.sevkiyatNo} onChange={(e) => setF({ ...f, sevkiyatNo: e.target.value })} placeholder="SV-2611-0001" /></Alan>
              <Alan etiket="Üretim lotu (isteğe bağlı)"><input className={`${girdi} font-mono`} value={f.lotNo} onChange={(e) => setF({ ...f, lotNo: e.target.value })} placeholder="FG-2611-0001" /></Alan>
            </div>
            <Alan etiket="Konu"><input className={girdi} value={f.konu} onChange={(e) => setF({ ...f, konu: e.target.value })} /></Alan>
            <Alan etiket="Açıklama"><Textarea rows={2} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} /></Alan>
          </IslemFormu>
        )}
      </div>
    </div>
  );
}

function SikayetIslemleri({ s, kisiler }: { s: Sikayet; kisiler: { id: string; adSoyad: string }[] }) {
  const [iade, setIade] = useState({ barkodlar: "", neden: "" });
  const [d, setD] = useState({ sorumluId: "", termin: bugunStr(14) });
  const [k, setK] = useState({ not: "", hakli: true });
  const barkodlar = iade.barkodlar.split(/[\s,;]+/).filter(Boolean).map(barkodAyikla);
  const iadeM = useIslem(() => api<any>("/kalite/musteri-iadesi", { govde: { sikayetNo: s.no, barkodlar, neden: iade.neden } }), {
    basari: (c) => `${c.iadeler.length} parça (${sayi(c.toplam)}) karantinaya alındı; kararı Karantina ekranında son kontrolde verilir`,
    sonra: () => setIade({ barkodlar: "", neden: "" }),
  });
  const dofM = useIslem(() => api<any>(`/kys/sikayetler/${s.no}/dof`, { govde: d }), { basari: (c) => `${c.dof.no} açıldı` });
  const kapatM = useIslem(() => api<any>(`/kys/sikayetler/${s.no}/kapat`, { govde: { kapanisNotu: k.not, hakli: k.hakli } }), { basari: `${s.no} kapandı` });
  return (
    <div className="space-y-4">
      <IslemFormu
        baslik={`${s.no} · müşteri iadesi`}
        aciklama="Geri gelen parçaları okutun. Parça bu müşteriye sevk edilmiş olmalı; karantinaya alınır, kararı son kontrolde verilir."
        dugme="İadeyi al"
        devreDisi={!barkodlar.length || iade.neden.trim().length < 3}
        bekliyor={iadeM.isPending}
        onGonder={() => iadeM.mutate()}
      >
        <Alan etiket="Barkodlar"><Textarea rows={2} className="font-mono" value={iade.barkodlar} onChange={(e) => setIade({ ...iade, barkodlar: e.target.value })} /></Alan>
        <Alan etiket="Neden"><input className={girdi} value={iade.neden} onChange={(e) => setIade({ ...iade, neden: e.target.value })} /></Alan>
      </IslemFormu>
      {!s.dofNo && (
        <IslemFormu baslik="DÖF aç" dugme="DÖF aç" devreDisi={!d.sorumluId || !d.termin} bekliyor={dofM.isPending} onGonder={() => dofM.mutate()}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Alan etiket="Sorumlu">
              <select className={girdi} value={d.sorumluId} onChange={(e) => setD({ ...d, sorumluId: e.target.value })}>
                <option value="">Seçiniz</option>
                {kisiler.map((x) => <option key={x.id} value={x.id}>{tr(x.adSoyad)}</option>)}
              </select>
            </Alan>
            <Alan etiket="Termin"><input type="date" min={bugunStr()} className={girdi} value={d.termin} onChange={(e) => setD({ ...d, termin: e.target.value })} /></Alan>
          </div>
        </IslemFormu>
      )}
      <IslemFormu
        baslik="Şikâyeti kapat"
        aciklama={k.hakli ? "Haklı şikâyet: bağlı DÖF kapanmış ve iade parçaların kararı verilmiş olmalı." : "Haksız şikâyet: DÖF gerekmez, gerekçe en az 10 karakter."}
        dugme="Kapat"
        devreDisi={k.not.trim().length < (k.hakli ? 3 : 10)}
        bekliyor={kapatM.isPending}
        onGonder={() => kapatM.mutate()}
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!k.hakli} onChange={(e) => setK({ ...k, hakli: !e.target.checked })} /> Şikâyet haksız (ürün uygun)
        </label>
        <Alan etiket="Kapanış notu"><Textarea rows={2} value={k.not} onChange={(e) => setK({ ...k, not: e.target.value })} /></Alan>
      </IslemFormu>
    </div>
  );
}

// ---------------------------------------------------------------- DOF
function Doflar({ liste, yukleniyor }: { liste?: Dof[]; yukleniyor: boolean }) {
  const o = useOturum();
  const benim = o?.kullanici.id;
  const kalite = rolVar(o, "KALITE");
  const kisiler = useKysKisiler();
  const [secili, setSecili] = useState<string | null>(null);
  const df = liste?.find((x) => x.no === secili);
  const [f, setF] = useState({ kaynak: "IC_DENETIM", kaynakNo: "", problem: "", sorumluId: "", termin: bugunStr(30) });
  const yeni = useIslem(() => api<any>("/kys/doflar", { govde: { ...f, kaynakNo: f.kaynakNo || undefined } }), {
    basari: (c) => `${c.no} açıldı`,
    sonra: () => setF({ ...f, kaynakNo: "", problem: "" }),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Bolum baslik="Düzeltici faaliyetler">
        <Tablo
          yukleniyor={yukleniyor}
          satirlar={liste}
          anahtar={(r) => r.no}
          satirSinifi={(r) => (r.no === secili ? "bg-tas-50" : undefined)}
          sutunlar={[
            { baslik: "No", hucre: (r) => <button className="font-mono text-xs font-semibold underline" onClick={() => setSecili(r.no)}>{r.no}</button> },
            { baslik: "Kaynak", hucre: (r) => <span className="text-xs">{r.kaynak}{r.kaynakNo ? ` · ${r.kaynakNo}` : ""}</span> },
            { baslik: "Problem", hucre: (r) => <span className="line-clamp-2">{tr(r.problem)}</span> },
            { baslik: "Sorumlu", hucre: (r) => tr(r.sorumluAd) },
            { baslik: "Termin", hucre: (r) => <span className={r.gecikti ? "font-semibold text-unity" : ""}>{r.termin}{r.gecikti ? " (gecikti)" : ""}</span> },
            { baslik: "Durum", hucre: (r) => <DurumRozeti renk={renkOf(r.durum)}>{durumAdi(r.durum)}</DurumRozeti> },
          ]}
        />
      </Bolum>
      <div className="space-y-5">
        {df && <DofIslemleri df={df} benimMi={df.sorumlu === benim} kalite={kalite} />}
        {rolVar(o, "KALITE", "YONETIM") && (
          <IslemFormu baslik="Yeni DÖF" aciklama="Şikâyetten doğan DÖF, Şikâyet sekmesinden açılır." dugme="DÖF aç" devreDisi={f.problem.trim().length < 5 || !f.sorumluId || !f.termin} bekliyor={yeni.isPending} onGonder={() => yeni.mutate()}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Kaynak">
                <select className={girdi} value={f.kaynak} onChange={(e) => setF({ ...f, kaynak: e.target.value })}>
                  {[["IC_DENETIM", "İç denetim"], ["PROSES", "Proses"], ["TEDARIKCI", "Tedarikçi"], ["DIGER", "Diğer"]].map(([k, a]) => <option key={k} value={k}>{a}</option>)}
                </select>
              </Alan>
              <Alan etiket="Kaynak no (isteğe bağlı)"><input className={girdi} value={f.kaynakNo} onChange={(e) => setF({ ...f, kaynakNo: e.target.value })} /></Alan>
              <Alan etiket="Sorumlu">
                <select className={girdi} value={f.sorumluId} onChange={(e) => setF({ ...f, sorumluId: e.target.value })}>
                  <option value="">Seçiniz</option>
                  {kisiler.data?.map((x) => <option key={x.id} value={x.id}>{tr(x.adSoyad)}</option>)}
                </select>
              </Alan>
              <Alan etiket="Termin"><input type="date" min={bugunStr()} className={girdi} value={f.termin} onChange={(e) => setF({ ...f, termin: e.target.value })} /></Alan>
            </div>
            <Alan etiket="Problem"><Textarea rows={2} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} /></Alan>
          </IslemFormu>
        )}
      </div>
    </div>
  );
}

function DofIslemleri({ df, benimMi, kalite }: { df: Dof; benimMi: boolean; kalite: boolean }) {
  const [k, setK] = useState({ kokNeden: df.kokNeden || "", faaliyet: df.faaliyet || "" });
  const [not, setNot] = useState("");
  const kokM = useIslem(() => api(`/kys/doflar/${df.no}/kok-neden`, { govde: k }), { basari: "Kök neden ve faaliyet kaydedildi" });
  const tamamM = useIslem(() => api(`/kys/doflar/${df.no}/tamamla`, { govde: {} }), { basari: "Doğrulamaya gönderildi" });
  const dogrulaM = useIslem((etkili?: boolean) => api(`/kys/doflar/${df.no}/dogrula`, { govde: { etkili: dogrulamaRef.etkili, etkinlikNotu: not } }), {
    basari: () => (dogrulamaRef.etkili ? `${df.no} kapandı` : `${df.no} uygulamaya geri döndü`),
    sonra: () => setNot(""),
  });
  return (
    <Bolum baslik={df.no} sag={<DurumRozeti renk={renkOf(df.durum)}>{durumAdi(df.durum)}</DurumRozeti>}>
      <div className="space-y-3 text-sm">
        <p className="text-tas-600">{tr(df.problem)}</p>
        {(df.durum === "ACIK" || df.durum === "UYGULAMADA") && (benimMi || kalite) ? (
          <>
            <Alan etiket="Kök neden"><Textarea rows={2} value={k.kokNeden} onChange={(e) => setK({ ...k, kokNeden: e.target.value })} /></Alan>
            <Alan etiket="Düzeltici faaliyet"><Textarea rows={2} value={k.faaliyet} onChange={(e) => setK({ ...k, faaliyet: e.target.value })} /></Alan>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={k.kokNeden.trim().length < 10 || k.faaliyet.trim().length < 10 || kokM.isPending} onClick={() => kokM.mutate()}>
                Kaydet
              </Button>
              {df.durum === "UYGULAMADA" && benimMi && (
                <Button size="sm" className="bg-unity hover:bg-unity-koyu" disabled={tamamM.isPending} onClick={() => tamamM.mutate()}>
                  Faaliyet tamamlandı
                </Button>
              )}
            </div>
            {!benimMi && <p className="text-xs text-tas-400">Tamamlandı bildirimini yalnızca sorumlu ({tr(df.sorumluAd)}) yapar.</p>}
          </>
        ) : (
          <>
            {df.kokNeden && <p><b>Kök neden:</b> {tr(df.kokNeden)}</p>}
            {df.faaliyet && <p><b>Faaliyet:</b> {tr(df.faaliyet)}</p>}
          </>
        )}
        {df.etkinlikNotu && <p className="rounded-lg bg-tas-50 px-3 py-2 text-xs">Etkinlik: {tr(df.etkinlikNotu)}{df.kapatanAd ? ` — ${tr(df.kapatanAd)}` : ""}</p>}
        {df.durum === "DOGRULAMA_BEKLIYOR" && kalite && (
          benimMi ? (
            <p className="text-xs text-unity">Sorumlusu olduğunuz DÖF'ü siz doğrulayamazsınız (dört göz kuralı).</p>
          ) : (
            <div className="space-y-2 border-t border-tas-100 pt-3">
              <Alan etiket="Etkinlik değerlendirmesi"><Textarea rows={2} value={not} onChange={(e) => setNot(e.target.value)} /></Alan>
              <div className="flex gap-2">
                <Button size="sm" className="bg-uygun hover:bg-uygun/90" disabled={not.trim().length < 3 || dogrulaM.isPending} onClick={() => { dogrulamaRef.etkili = true; dogrulaM.mutate(); }}>
                  Etkili — kapat
                </Button>
                <Button size="sm" variant="outline" disabled={not.trim().length < 3 || dogrulaM.isPending} onClick={() => { dogrulamaRef.etkili = false; dogrulaM.mutate(); }}>
                  Etkili değil — geri gönder
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    </Bolum>
  );
}
// Dogrulama dugmesinin secimi (mutation parametresiz calistigi icin)
const dogrulamaRef = { etkili: true };

// ---------------------------------------------------------------- Kalibrasyon
function Kalibrasyon({ liste, yukleniyor }: { liste?: Alet[]; yukleniyor: boolean }) {
  const kalite = rolVar(useOturum(), "KALITE");
  const [secili, setSecili] = useState<string | null>(null);
  const [f, setF] = useState({ kod: "", ad: "", konum: "", periyotAy: "12" });
  const [k, setK] = useState({ tarih: bugunStr(), sonuc: "UYGUN", sertifikaNo: "", yapan: "", aciklama: "" });
  const [supheli, setSupheli] = useState<any>(null);
  const gecmis = useQuery({ queryKey: ["kys", "kalibrasyon", secili], enabled: !!secili, queryFn: () => api<any[]>(`/kys/aletler/${secili}/kalibrasyonlar`) });
  const yeni = useIslem(() => api("/kys/aletler", { govde: { ...f, periyotAy: Number(f.periyotAy) } }), { basari: `${f.kod} eklendi`, sonra: () => setF({ kod: "", ad: "", konum: "", periyotAy: "12" }) });
  const kal = useIslem(() => api<any>(`/kys/aletler/${secili}/kalibrasyon`, { govde: k }), {
    basari: (c) => (c.alet.durum === "KULLANIMDA" ? `Sonraki kalibrasyon: ${c.alet.sonrakiKalibrasyon}` : `${secili} kullanım dışı; ${c.supheliOlcumler.length} ölçüm şüpheli`),
    sonra: (c) => setSupheli(c.supheliOlcumler.length ? c : null),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Bolum baslik="Ölçüm aletleri">
        <Tablo
          yukleniyor={yukleniyor}
          satirlar={liste}
          anahtar={(r) => r.kod}
          satirSinifi={(r) => (r.kod === secili ? "bg-tas-50" : undefined)}
          sutunlar={[
            { baslik: "Kod", hucre: (r) => <button className="font-mono text-xs font-semibold underline" onClick={() => { setSecili(r.kod); setSupheli(null); }}>{r.kod}</button> },
            { baslik: "Alet", hucre: (r) => <>{tr(r.ad)}<div className="text-[11px] text-tas-400">{tr(r.konum)}</div></> },
            { baslik: "Periyot", sag: true, hucre: (r) => `${r.periyotAy} ay` },
            { baslik: "Son", hucre: (r) => r.sonKalibrasyon || "—" },
            { baslik: "Sonraki", hucre: (r) => <>{r.sonrakiKalibrasyon || "—"}{r.kalanGun !== null && <div className="text-[11px] text-tas-400">{r.kalanGun >= 0 ? `${r.kalanGun} gün kaldı` : `${-r.kalanGun} gün geçti`}</div>}</> },
            { baslik: "Durum", hucre: (r) => <DurumRozeti renk={renkOf(r.kalibrasyonDurumu)}>{{ GECERLI: "Geçerli", YAKLASIYOR: "Yaklaşıyor", GECMIS: "Geçmiş", KULLANIM_DISI: "Kullanım dışı" }[r.kalibrasyonDurumu]}</DurumRozeti> },
            { baslik: "Ölçüm", sag: true, hucre: (r) => r.olcumSayisi },
          ]}
        />
      </Bolum>
      <div className="space-y-5">
        {secili && kalite && (
          <IslemFormu
            baslik={`${secili} · kalibrasyon kaydı`}
            aciklama="Uygun: sonraki tarih = kalibrasyon tarihi + periyot. Uygun değil: alet kullanım dışı olur, son uygun kalibrasyondan beri bu aletle yapılan ölçümler listelenir."
            dugme="Kaydet"
            devreDisi={!k.tarih || (k.sonuc === "UYGUN_DEGIL" && k.aciklama.trim().length < 3)}
            bekliyor={kal.isPending}
            onGonder={() => kal.mutate()}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Tarih"><input type="date" max={bugunStr()} className={girdi} value={k.tarih} onChange={(e) => setK({ ...k, tarih: e.target.value })} /></Alan>
              <Alan etiket="Sonuç">
                <select className={girdi} value={k.sonuc} onChange={(e) => setK({ ...k, sonuc: e.target.value })}>
                  <option value="UYGUN">Uygun</option>
                  <option value="UYGUN_DEGIL">Uygun değil</option>
                </select>
              </Alan>
              <Alan etiket="Sertifika no"><input className={girdi} value={k.sertifikaNo} onChange={(e) => setK({ ...k, sertifikaNo: e.target.value })} /></Alan>
              <Alan etiket="Yapan"><input className={girdi} value={k.yapan} onChange={(e) => setK({ ...k, yapan: e.target.value })} /></Alan>
            </div>
            <Alan etiket={k.sonuc === "UYGUN_DEGIL" ? "Açıklama (zorunlu)" : "Açıklama"}><input className={girdi} value={k.aciklama} onChange={(e) => setK({ ...k, aciklama: e.target.value })} /></Alan>
          </IslemFormu>
        )}
        {supheli && (
          <Bolum baslik="Şüpheli ölçümler" className="border-unity/40">
            <p className="mb-2 text-sm text-unity-koyu">Etkilenen iş emirleri: {supheli.etkilenenIsEmirleri.join(", ") || "—"}. Gerekirse Geri Çağırma ekranından ilgili üretimi bloke edin.</p>
            <Tablo satirlar={supheli.supheliOlcumler} anahtar={(r: any) => `${r.zaman}${r.karakteristik}`} sutunlar={[
              { baslik: "Zaman", hucre: (r: any) => tarihSaat(r.zaman) },
              { baslik: "Aşama", hucre: (r: any) => r.asama },
              { baslik: "İş emri", hucre: (r: any) => r.isEmriNo },
              { baslik: "Ölçüm", hucre: (r: any) => `${tr(r.karakteristik)} ${sayi(r.deger, 3)}` },
            ]} />
          </Bolum>
        )}
        {secili && (
          <Bolum baslik={`${secili} · geçmiş`}>
            <Tablo<any> yukleniyor={gecmis.isLoading} satirlar={gecmis.data} anahtar={(r) => r.id} sutunlar={[
              { baslik: "Tarih", hucre: (r) => r.tarih },
              { baslik: "Sonuç", hucre: (r) => <DurumRozeti renk={r.sonuc === "UYGUN" ? "yesil" : "kirmizi"}>{r.sonuc === "UYGUN" ? "Uygun" : "Uygun değil"}</DurumRozeti> },
              { baslik: "Sertifika", hucre: (r) => r.sertifikaNo || "—" },
              { baslik: "Kaydeden", hucre: (r) => tr(r.kaydedenAd) },
            ]} />
          </Bolum>
        )}
        {kalite && (
          <IslemFormu baslik="Yeni ölçüm aleti" dugme="Ekle" devreDisi={!f.kod || !f.ad || !(Number(f.periyotAy) >= 1)} bekliyor={yeni.isPending} onGonder={() => yeni.mutate()}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Kod"><input className={`${girdi} font-mono uppercase`} value={f.kod} onChange={(e) => setF({ ...f, kod: e.target.value.toUpperCase() })} placeholder="KMP-03" /></Alan>
              <Alan etiket="Periyot (ay)"><input className={girdi} inputMode="numeric" value={f.periyotAy} onChange={(e) => setF({ ...f, periyotAy: e.target.value })} /></Alan>
              <Alan etiket="Ad"><input className={girdi} value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} /></Alan>
              <Alan etiket="Konum"><input className={girdi} value={f.konum} onChange={(e) => setF({ ...f, konum: e.target.value })} /></Alan>
            </div>
            <p className="text-xs text-tas-400">Yeni alet ilk kalibrasyon kaydı girilene kadar ölçümde kullanılamaz.</p>
          </IslemFormu>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Bakim / ariza (elle, tek seferlik kayit)
function Bakimlar() {
  const o = useOturum();
  const t = useTanimlar();
  const bakim = useQuery({ queryKey: ["kys", "bakimlar"], queryFn: () => api<Bakim[]>("/kys/bakimlar") });
  const bos = { makineId: "", tur: "ARIZA", tarih: bugunStr(), ariza: "", yapilan: "", kullanilanParca: "", durusDk: "" };
  const [f, setF] = useState(bos);
  const yeni = useIslem(
    () => api<any>("/kys/bakimlar", { govde: { ...f, ariza: f.ariza || undefined, kullanilanParca: f.kullanilanParca || undefined, durusDk: nokta(f.durusDk) } }),
    { basari: (c) => `${c.no} kaydedildi (${c.makineKod}, ${sayi(c.durusDk, 0)} dk)`, sonra: () => setF({ ...bos, tarih: f.tarih }) },
  );
  const dk = Number(nokta(f.durusDk));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Bolum baslik="Bakım ve arıza kayıtları">
        <Tablo<Bakim> yukleniyor={bakim.isLoading} satirlar={bakim.data} anahtar={(r) => r.no} sutunlar={[
          { baslik: "No", hucre: (r) => <span className="font-mono text-xs font-semibold">{r.no}</span> },
          { baslik: "Tarih", hucre: (r) => r.tarih },
          { baslik: "Makine", hucre: (r) => r.makineKod },
          { baslik: "Tür", hucre: (r) => <DurumRozeti renk={r.tur === "ARIZA" ? "kirmizi" : "turuncu"}>{r.tur === "ARIZA" ? "Arıza" : "Planlı bakım"}</DurumRozeti> },
          { baslik: "Arıza / yapılan", hucre: (r) => <>{r.ariza && <div className="font-semibold">{tr(r.ariza)}</div>}<div className="text-tas-600">{tr(r.yapilan)}</div>{r.kullanilanParca && <div className="text-[11px] text-tas-400">Parça: {tr(r.kullanilanParca)}</div>}</> },
          { baslik: "Duruş", sag: true, hucre: (r) => `${sayi(r.durusDk, 0)} dk` },
          { baslik: "Kaydeden", hucre: (r) => tr(r.kaydedenAd) },
        ]} />
      </Bolum>
      {rolVar(o, "SEF", "OPERATOR") && (
        <IslemFormu
          baslik="Bakım / arıza kaydı"
          aciklama="İş bittikten sonra elle girilir: hangi makine, ne oldu, ne yapıldı, makine kaç dakika durdu. Makine kullanılabilirliği (KPI) bu dakikalardan hesaplanır. Kayıt sonradan değiştirilemez; yanlışsa yeni kayıt girilir."
          dugme="Kaydet"
          devreDisi={!f.makineId || !f.tarih || f.yapilan.trim().length < 5 || (f.tur === "ARIZA" && f.ariza.trim().length < 3) || !sayiMi(f.durusDk) || dk < 0}
          bekliyor={yeni.isPending}
          onGonder={() => yeni.mutate()}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Alan etiket="Makine">
              <select className={girdi} value={f.makineId} onChange={(e) => setF({ ...f, makineId: e.target.value })}>
                <option value="">Seçiniz</option>
                {t.data?.makineler.map((m) => <option key={m.id} value={m.id}>{m.kod} — {tr(m.ad)}</option>)}
              </select>
            </Alan>
            <Alan etiket="Tür">
              <select className={girdi} value={f.tur} onChange={(e) => setF({ ...f, tur: e.target.value })}>
                <option value="ARIZA">Arıza</option>
                <option value="PLANLI">Planlı bakım</option>
              </select>
            </Alan>
            <Alan etiket="Tarih"><input type="date" max={bugunStr()} className={girdi} value={f.tarih} onChange={(e) => setF({ ...f, tarih: e.target.value })} /></Alan>
            <Alan etiket="Duruş süresi (dk)"><input className={girdi} inputMode="numeric" value={f.durusDk} onChange={(e) => setF({ ...f, durusDk: e.target.value })} placeholder="45" /></Alan>
          </div>
          {f.tur === "ARIZA" && (
            <Alan etiket="Arıza (zorunlu)"><input className={girdi} value={f.ariza} onChange={(e) => setF({ ...f, ariza: e.target.value })} placeholder="Tahrik kayışı koptu" /></Alan>
          )}
          <Alan etiket="Yapılan işlem (zorunlu)"><input className={girdi} value={f.yapilan} onChange={(e) => setF({ ...f, yapilan: e.target.value })} placeholder="Kayış değiştirildi, test edildi" /></Alan>
          <Alan etiket="Kullanılan parça (isteğe bağlı)"><input className={girdi} value={f.kullanilanParca} onChange={(e) => setF({ ...f, kullanilanParca: e.target.value })} /></Alan>
        </IslemFormu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Egitim
function Egitimler() {
  const o = useOturum();
  const kisiler = useKysKisiler();
  const liste = useQuery({ queryKey: ["kys", "egitimler"], queryFn: () => api<Egitim[]>("/kys/egitimler") });
  const bos = { kullaniciId: "", konu: "", tarih: bugunStr(), egitmen: "", sureSaat: "", sonuc: "BASARILI", gecerlilikBitis: "" };
  const [f, setF] = useState(bos);
  const yeni = useIslem(
    () => api("/kys/egitimler", { govde: { ...f, sureSaat: f.sureSaat ? nokta(f.sureSaat) : undefined, gecerlilikBitis: f.gecerlilikBitis || undefined, egitmen: f.egitmen || undefined } }),
    { basari: "Eğitim kaydedildi", sonra: () => setF({ ...bos, konu: f.konu, egitmen: f.egitmen }) },
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Bolum baslik="Eğitim kayıtları">
        <Tablo<Egitim> yukleniyor={liste.isLoading} satirlar={liste.data} anahtar={(r) => r.id} sutunlar={[
          { baslik: "Kişi", hucre: (r) => tr(r.adSoyad) },
          { baslik: "Konu", hucre: (r) => tr(r.konu) },
          { baslik: "Tarih", hucre: (r) => r.tarih },
          { baslik: "Süre", sag: true, hucre: (r) => (r.sureSaat ? `${sayi(r.sureSaat)} sa` : "—") },
          { baslik: "Geçerlilik", hucre: (r) => r.gecerlilikBitis || "süresiz" },
          { baslik: "Durum", hucre: (r) => <DurumRozeti renk={renkOf(r.gecerlilik)}>{{ GECERLI: "Geçerli", SURESI_DOLDU: "Süresi doldu", TEKRAR_GEREKLI: "Tekrar gerekli" }[r.gecerlilik]}</DurumRozeti> },
        ]} />
      </Bolum>
      {rolVar(o, "KALITE", "YONETIM", "SEF") && (
        <IslemFormu
          baslik="Eğitim kaydı"
          aciklama="Yapılmış eğitim kaydedilir (ileri tarih girilemez). Kayıt sonradan değiştirilemez; hatalıysa yeni kayıt girilir."
          dugme="Kaydet"
          devreDisi={!f.kullaniciId || f.konu.trim().length < 3 || !f.tarih || (!!f.sureSaat && !sayiMi(f.sureSaat)) || (!!f.gecerlilikBitis && f.gecerlilikBitis < f.tarih)}
          bekliyor={yeni.isPending}
          onGonder={() => yeni.mutate()}
        >
          <Alan etiket="Kişi">
            <select className={girdi} value={f.kullaniciId} onChange={(e) => setF({ ...f, kullaniciId: e.target.value })}>
              <option value="">Seçiniz</option>
              {kisiler.data?.map((x) => <option key={x.id} value={x.id}>{tr(x.adSoyad)}</option>)}
            </select>
          </Alan>
          <Alan etiket="Konu"><input className={girdi} value={f.konu} onChange={(e) => setF({ ...f, konu: e.target.value })} /></Alan>
          <div className="grid gap-3 sm:grid-cols-2">
            <Alan etiket="Tarih"><input type="date" max={bugunStr()} className={girdi} value={f.tarih} onChange={(e) => setF({ ...f, tarih: e.target.value })} /></Alan>
            <Alan etiket="Süre (saat)"><input className={girdi} inputMode="decimal" value={f.sureSaat} onChange={(e) => setF({ ...f, sureSaat: e.target.value })} /></Alan>
            <Alan etiket="Eğitmen"><input className={girdi} value={f.egitmen} onChange={(e) => setF({ ...f, egitmen: e.target.value })} /></Alan>
            <Alan etiket="Sonuç">
              <select className={girdi} value={f.sonuc} onChange={(e) => setF({ ...f, sonuc: e.target.value })}>
                <option value="BASARILI">Başarılı</option>
                <option value="TEKRAR_GEREKLI">Tekrar gerekli</option>
              </select>
            </Alan>
            <Alan etiket="Geçerlilik bitişi (isteğe bağlı)"><input type="date" min={f.tarih} className={girdi} value={f.gecerlilikBitis} onChange={(e) => setF({ ...f, gecerlilikBitis: e.target.value })} /></Alan>
          </div>
        </IslemFormu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Tedarikci
function Tedarikci() {
  const o = useOturum();
  const t = useTanimlar();
  const liste = useQuery({ queryKey: ["kys", "tedarikci"], queryFn: () => api<TedarikciDegerlendirme[]>("/kys/tedarikci-degerlendirme") });
  const ay = new Date().getMonth() + 1;
  const [f, setF] = useState({ tedarikciId: "", donem: `${new Date().getFullYear()}-Q${Math.ceil(ay / 3)}`, teslimatPuani: "", belgePuani: "", aciklama: "" });
  const donemGecerli = /^\d{4}-Q[1-4]$/.test(f.donem);
  const on = useQuery({
    queryKey: ["kys", "tedarikci-onizleme", f.tedarikciId, f.donem],
    enabled: !!f.tedarikciId && donemGecerli,
    queryFn: () => api<any>(`/kys/tedarikci-degerlendirme/onizleme?tedarikciId=${f.tedarikciId}&donem=${f.donem}`),
  });
  const puan = (s: string) => (sayiMi(s) && Number(nokta(s)) >= 0 && Number(nokta(s)) <= 100 ? Number(nokta(s)) : null);
  const tes = puan(f.teslimatPuani);
  const bel = puan(f.belgePuani);
  const kal = on.data?.kalitePuani ?? null;
  const toplam = kal !== null && tes !== null && bel !== null ? Math.round((kal * 0.5 + tes * 0.3 + bel * 0.2) * 100) / 100 : null;
  const sonuc = toplam === null ? null : toplam >= 80 ? "ONAYLI" : toplam >= 60 ? "SARTLI" : "ASKIDA";
  const kaydet = useIslem(() => api<any>("/kys/tedarikci-degerlendirme", { govde: { ...f, teslimatPuani: tes, belgePuani: bel, aciklama: f.aciklama || undefined } }), {
    basari: (c) => `${c.hesap.toplam} puan → ${durumAdi(c.hesap.sonuc)}`,
    sonra: () => setF({ ...f, teslimatPuani: "", belgePuani: "", aciklama: "" }),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Bolum baslik="Değerlendirmeler">
        <Tablo<TedarikciDegerlendirme> yukleniyor={liste.isLoading} satirlar={liste.data} anahtar={(r) => r.id} sutunlar={[
          { baslik: "Tedarikçi", hucre: (r) => tr(r.unvan) },
          { baslik: "Dönem", hucre: (r) => r.donem },
          { baslik: "Lot (kabul/top.)", sag: true, hucre: (r) => `${r.kabulLot}/${r.lotSayisi}` },
          { baslik: "Kalite", sag: true, hucre: (r) => sayi(r.kalitePuani) },
          { baslik: "Teslimat", sag: true, hucre: (r) => sayi(r.teslimatPuani) },
          { baslik: "Belge", sag: true, hucre: (r) => sayi(r.belgePuani) },
          { baslik: "Toplam", sag: true, hucre: (r) => <b>{sayi(r.toplamPuan)}</b> },
          { baslik: "Sonuç", hucre: (r) => <DurumRozeti renk={renkOf(r.sonuc)}>{durumAdi(r.sonuc)}</DurumRozeti> },
        ]} />
      </Bolum>
      {rolVar(o, "KALITE", "YONETIM") && (
        <IslemFormu
          baslik="Dönem değerlendirmesi"
          aciklama="Kalite puanı girilmez: dönemdeki giriş kontrollerinden hesaplanır (ilk seferde kabul edilen lot / karar verilen lot × 100). Toplam = kalite × 0,5 + teslimat × 0,3 + belge × 0,2. ≥80 Onaylı, ≥60 Şartlı, <60 Askıda (askıdaki tedarikçiden mal kabul yapılamaz)."
          dugme="Kaydet ve tedarikçi durumunu güncelle"
          devreDisi={!f.tedarikciId || !donemGecerli || tes === null || bel === null || !on.data?.lotSayisi || (sonuc !== "ONAYLI" && f.aciklama.trim().length < 3)}
          bekliyor={kaydet.isPending}
          onGonder={() => kaydet.mutate()}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Alan etiket="Tedarikçi">
              <select className={girdi} value={f.tedarikciId} onChange={(e) => setF({ ...f, tedarikciId: e.target.value })}>
                <option value="">Seçiniz</option>
                {t.data?.tedarikciler.map((x) => <option key={x.id} value={x.id}>{tr(x.unvan)} ({durumAdi(x.onayDurumu)})</option>)}
              </select>
            </Alan>
            <Alan etiket="Dönem"><input className={`${girdi} font-mono`} value={f.donem} onChange={(e) => setF({ ...f, donem: e.target.value.toUpperCase() })} placeholder="2026-Q4" /></Alan>
            <Alan etiket="Teslimat puanı (0-100)"><input className={girdi} inputMode="decimal" value={f.teslimatPuani} onChange={(e) => setF({ ...f, teslimatPuani: e.target.value })} /></Alan>
            <Alan etiket="Belge puanı (0-100)"><input className={girdi} inputMode="decimal" value={f.belgePuani} onChange={(e) => setF({ ...f, belgePuani: e.target.value })} /></Alan>
          </div>
          {on.data && (
            <div className="rounded-lg bg-tas-50 px-3 py-2 text-sm text-tas-600">
              {on.data.lotSayisi ? (
                <>
                  {on.data.baslangic} – {on.data.bitis}: karar verilen {on.data.lotSayisi} lot, ilk seferde kabul {on.data.kabulLot} → kalite puanı <b>{sayi(kal)}</b>
                  {toplam !== null && <> · toplam <b>{sayi(toplam)}</b> → <b>{durumAdi(sonuc)}</b></>}
                </>
              ) : (
                "Bu dönemde karar verilmiş lot yok; değerlendirme yapılamaz."
              )}
            </div>
          )}
          <Alan etiket={sonuc && sonuc !== "ONAYLI" ? "Açıklama (zorunlu)" : "Açıklama"}><input className={girdi} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} /></Alan>
        </IslemFormu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Numune arsivi
function Numuneler() {
  const kalite = rolVar(useOturum(), "KALITE");
  const [sadeceImha, setSadeceImha] = useState(false);
  const liste = useQuery({ queryKey: ["kalite", "numuneler", sadeceImha], queryFn: () => api<any[]>(`/kalite/numuneler${sadeceImha ? "?imhaGelen=1" : ""}`) });
  const imha = useIslem(() => api<any>(`/kalite/numuneler/${numuneRef.barkod}/imha`, { govde: { not: "Saklama süresi doldu" } }), { basari: (c) => `${c.barkod} imha edildi` });
  return (
    <Bolum
      baslik="Şahit numune arşivi"
      sag={
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sadeceImha} onChange={(e) => setSadeceImha(e.target.checked)} /> Yalnızca imhası gelenler
        </label>
      }
    >
      <p className="mb-3 text-xs text-tas-500">Saklama süresi dolmadan ya da lotunda açık müşteri şikâyeti varken numune imha edilemez (delil).</p>
      <Tablo<any> yukleniyor={liste.isLoading} satirlar={liste.data} anahtar={(r) => r.barkod} sutunlar={[
        { baslik: "Numune", hucre: (r) => <BarkodLink barkod={r.barkod} /> },
        { baslik: "Lot", hucre: (r) => <span className="font-mono text-xs">{r.lotNo}</span> },
        { baslik: "Ürün", hucre: (r) => r.urunKod },
        { baslik: "Yer", hucre: (r) => r.yer || "—" },
        { baslik: "Alınma", hucre: (r) => tarihSaat(r.olusturmaZamani) },
        { baslik: "İmha tarihi", hucre: (r) => <span className={r.imhaGelen && r.durum === "ARSIVDE" ? "font-semibold text-dikkat" : ""}>{r.imhaTarihi}</span> },
        { baslik: "Durum", hucre: (r) => <DurumRozeti renk={renkOf(r.durum)} alt={r.acikSikayet ? `açık şikâyet: ${r.acikSikayet}` : r.imhaEdenAd ? `${tr(r.imhaEdenAd)} · ${tarihSaat(r.imhaZamani)}` : undefined}>{durumAdi(r.durum)}</DurumRozeti> },
        {
          baslik: "",
          hucre: (r) =>
            kalite && r.durum === "ARSIVDE" && r.imhaGelen && !r.acikSikayet ? (
              <Button size="sm" variant="outline" disabled={imha.isPending} onClick={() => { numuneRef.barkod = r.barkod; imha.mutate(); }}>İmha et</Button>
            ) : null,
        },
      ]} />
    </Bolum>
  );
}
const numuneRef = { barkod: "" };
