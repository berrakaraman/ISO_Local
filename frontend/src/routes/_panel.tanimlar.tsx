// Tanimlar: makine, malzeme, tedarikci, musteri, urun, recete, kontrol plani, hata kodu, depo yeri, kullanici.
// HICBIR TANIM SILINMEZ. Yonetici "Pasife al" der: secim listelerinden duser, eski kayitlarda gorunmeye devam eder.
// Her degisiklik kim/ne zaman/gerekce ile degisiklik izine yazilir. Degistirme yetkisi yalnizca yoneticide.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, KeyRound, Loader2, Lock, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/iso/PageHeader";
import { Alan, PencereBasligi, girdi } from "@/components/iso/FormParcalari";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, hataMesaji } from "@/lib/api";
import { ROL_ADLARI, rolVar, useOturum, type Rol } from "@/lib/oturum";
import { sayi, tarihSaat, tr } from "@/lib/sozluk";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/tanimlar")({ component: TanimlarSayfasi });

type AlanTanimi = {
  ad: string; // API alan adi
  etiket: string;
  tip?: "metin" | "kod" | "sayi" | "secim" | "baglanti";
  secenekler?: [string, string][];
  baglanti?: string; // baglanti listesi: "urunler" | "malzemeler"
  zorunlu?: boolean;
  kilitli?: boolean; // duzenlerken degismez (barkod/kod butunlugu)
};
type Tur = { id: string; ad: string; tekil: string; alanlar: AlanTanimi[]; aktifYok?: boolean; aciklama?: string };

const MAKINE_TIPI: [string, string][] = [["ORGU", "Örgü"], ["EKSTRUZYON", "Ekstrüzyon"], ["METRAJ", "Metraj"], ["MASURA", "Masura"], ["DIGER", "Diğer"]];
const ASAMA: [string, string][] = [["ILK_PARCA", "İlk parça"], ["PROSES", "Proses"], ["METRAJ", "Metraj"], ["SON_KONTROL", "Son kontrol"]];

const TURLER: Tur[] = [
  { id: "makineler", ad: "Makineler", tekil: "makine", alanlar: [
    { ad: "kod", etiket: "Kod", tip: "kod", zorunlu: true, kilitli: true },
    { ad: "ad", etiket: "Ad", zorunlu: true },
    { ad: "tip", etiket: "Tip", tip: "secim", secenekler: MAKINE_TIPI, zorunlu: true },
  ] },
  { id: "malzemeler", ad: "Hammaddeler", tekil: "hammadde", alanlar: [
    { ad: "kod", etiket: "Kod", tip: "kod", zorunlu: true, kilitli: true },
    { ad: "ad", etiket: "Ad", zorunlu: true },
    { ad: "olcuBirimi", etiket: "Birim", tip: "secim", secenekler: [["kg", "kg"], ["m", "m"], ["adet", "adet"]] },
  ] },
  { id: "tedarikciler", ad: "Tedarikçiler", tekil: "tedarikçi", alanlar: [
    { ad: "unvan", etiket: "Unvan", zorunlu: true },
    { ad: "onayDurumu", etiket: "Onay durumu", tip: "secim", secenekler: [["ONAYLI", "Onaylı"], ["SARTLI", "Şartlı"], ["ASKIDA", "Askıda (kabul yapılamaz)"]], zorunlu: true },
  ] },
  { id: "musteriler", ad: "Müşteriler", tekil: "müşteri", alanlar: [
    { ad: "unvan", etiket: "Unvan", zorunlu: true },
    { ad: "crmRef", etiket: "CRM kodu" },
  ] },
  { id: "urunler", ad: "Ürünler", tekil: "ürün", alanlar: [
    { ad: "kod", etiket: "Kod", tip: "kod", zorunlu: true, kilitli: true },
    { ad: "ad", etiket: "Ad", zorunlu: true },
    { ad: "olcuBirimi", etiket: "Birim", tip: "secim", secenekler: [["m", "m"], ["kg", "kg"], ["adet", "adet"]] },
    { ad: "kesimBoyu", etiket: "Kesim boyu (m)", tip: "sayi" },
    { ad: "numuneBoyu", etiket: "Numune boyu (m)", tip: "sayi" },
  ] },
  { id: "receteler", ad: "Reçeteler", tekil: "reçete", aktifYok: true,
    aciklama: "Ürünün metresinde hangi hammaddeden kaç gram var. Miktar dengesi buna göre hesaplanır.", alanlar: [
    { ad: "urunId", etiket: "Ürün", tip: "baglanti", baglanti: "urunler", zorunlu: true, kilitli: true },
    { ad: "malzemeId", etiket: "Hammadde", tip: "baglanti", baglanti: "malzemeler", zorunlu: true, kilitli: true },
    { ad: "gramMetre", etiket: "Gram / metre", tip: "sayi", zorunlu: true },
  ] },
  { id: "karakteristikler", ad: "Kontrol planı", tekil: "kontrol maddesi",
    aciklama: "İlk parça, metraj ve son kontrolde ölçülen değerler ve sınırları.", alanlar: [
    { ad: "urunId", etiket: "Ürün", tip: "baglanti", baglanti: "urunler", zorunlu: true, kilitli: true },
    { ad: "asama", etiket: "Aşama", tip: "secim", secenekler: ASAMA, zorunlu: true },
    { ad: "ad", etiket: "Ölçülen", zorunlu: true },
    { ad: "nominal", etiket: "Nominal", tip: "sayi" },
    { ad: "altSinir", etiket: "Alt sınır", tip: "sayi" },
    { ad: "ustSinir", etiket: "Üst sınır", tip: "sayi" },
    { ad: "olcuBirimi", etiket: "Birim" },
    { ad: "sira", etiket: "Sıra", tip: "sayi" },
  ] },
  { id: "hata-kodlari", ad: "Hata kodları", tekil: "hata kodu", alanlar: [
    { ad: "kod", etiket: "Kod", tip: "kod", zorunlu: true, kilitli: true },
    { ad: "aciklama", etiket: "Açıklama", zorunlu: true },
  ] },
  { id: "depo-yerleri", ad: "Depo yerleri", tekil: "depo yeri", alanlar: [
    { ad: "kod", etiket: "Kod", tip: "kod", zorunlu: true, kilitli: true },
    { ad: "ad", etiket: "Ad" },
    { ad: "tip", etiket: "Tip", tip: "secim", secenekler: [["RAF", "Raf"], ["KARANTINA", "Karantina"], ["NUMUNE", "Numune"], ["SEVK", "Sevk"]], zorunlu: true },
  ] },
];

type Satir = Record<string, any> & { id: string; aktif?: boolean };

function TanimlarSayfasi() {
  const oturum = useOturum();
  const yonetici = rolVar(oturum, "ADMIN");
  const [secili, setSecili] = useState("makineler");

  const sekmeler = [...TURLER.map((t) => ({ id: t.id, ad: t.ad })), ...(yonetici ? [{ id: "kullanicilar", ad: "Kullanıcılar" }] : [])];

  return (
    <div className="animate-belir">
      <PageHeader
        eyebrow="Ayarlar"
        title="Tanımlar"
        description="Formlardaki seçim listeleri. Hiçbir tanım silinmez: kullanılmayan tanım pasife alınır, eski kayıtlarda görünmeye devam eder."
      />
      <div className="grid gap-6 p-8 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {sekmeler.map((s) => (
            <button
              key={s.id}
              onClick={() => setSecili(s.id)}
              className={cn(
                "relative whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition",
                secili === s.id ? "bg-murekkep font-semibold text-white" : "text-tas-600 hover:bg-tas-100 hover:text-murekkep",
              )}
            >
              {secili === s.id && <span className="egik absolute -left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 bg-unity" />}
              {s.ad}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {!yonetici && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-tas-200 bg-white px-4 py-2.5 text-sm text-tas-500">
              <Lock className="h-4 w-4" /> Tanımları yalnızca yönetici değiştirebilir. Siz yalnızca görüntüleyebilirsiniz.
            </div>
          )}
          {secili === "kullanicilar" ? (
            <Kullanicilar />
          ) : (
            <TanimTablosu key={secili} tur={TURLER.find((t) => t.id === secili)!} yonetici={yonetici} />
          )}
        </div>
      </div>
    </div>
  );
}

function useListe(id: string) {
  return useQuery({ queryKey: ["tanimlar", id, "hepsi"], queryFn: () => api<Satir[]>(`/tanimlar/${id}?hepsi=1`) });
}

function TanimTablosu({ tur, yonetici }: { tur: Tur; yonetici: boolean }) {
  const liste = useListe(tur.id);
  const urunler = useListe("urunler");
  const malzemeler = useListe("malzemeler");
  const [q, setQ] = useState("");
  const [duzenle, setDuzenle] = useState<Satir | "yeni" | null>(null);
  const [pasif, setPasif] = useState<Satir | null>(null);

  const ad = (baglanti: string, id: string) => {
    const l = baglanti === "urunler" ? urunler.data : malzemeler.data;
    const x = l?.find((y) => y.id === id);
    return x ? `${x.kod} ${tr(x.ad)}` : "—";
  };
  const goster = (a: AlanTanimi, r: Satir) => {
    const v = r[a.ad];
    if (v === null || v === undefined || v === "") return "—";
    if (a.tip === "baglanti") return ad(a.baglanti!, v);
    if (a.tip === "secim") return a.secenekler?.find((s) => s[0] === v)?.[1] ?? v;
    if (a.tip === "sayi") return sayi(v, 4);
    return tr(String(v));
  };

  const satirlar = useMemo(() => {
    const ql = q.trim().toLocaleLowerCase("tr");
    return (liste.data || [])
      .filter((r) => !ql || tur.alanlar.map((a) => goster(a, r)).join(" ").toLocaleLowerCase("tr").includes(ql))
      .sort((a, b) => Number(b.aktif !== false) - Number(a.aktif !== false));
  }, [liste.data, q, urunler.data, malzemeler.data]);

  const pasifSayisi = (liste.data || []).filter((r) => r.aktif === false).length;

  return (
    <div className="overflow-hidden rounded-xl border border-tas-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tas-200 p-4">
        <div>
          <h2 className="font-display text-2xl font-bold italic text-murekkep">{tur.ad}</h2>
          <p className="text-xs text-tas-400">
            {tur.aciklama || `${(liste.data || []).length - pasifSayisi} aktif${pasifSayisi ? ` · ${pasifSayisi} pasif` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tas-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" className={cn(girdi, "w-56 pl-9")} />
          </div>
          {yonetici && (
            <Button onClick={() => setDuzenle("yeni")} className="h-10 gap-2 bg-unity font-semibold hover:bg-unity-koyu">
              <Plus className="h-4 w-4" /> Yeni {tur.tekil}
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tas-200 bg-tas-50 text-left text-[11px] font-bold uppercase tracking-wider text-tas-500">
              {tur.alanlar.map((a) => (
                <th key={a.ad} className={cn("whitespace-nowrap px-4 py-3", a.tip === "sayi" && "text-right")}>
                  {a.etiket}
                </th>
              ))}
              {!tur.aktifYok && <th className="px-4 py-3">Durum</th>}
              {yonetici && <th className="px-4 py-3 text-right">İşlem</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-tas-100">
            {liste.isLoading && (
              <tr>
                <td colSpan={9} className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-tas-400" />
                </td>
              </tr>
            )}
            {satirlar.map((r) => {
              const p = r.aktif === false;
              return (
                <tr key={r.id} className={cn("hover:bg-tas-50", p && "text-tas-400")}>
                  {tur.alanlar.map((a) => (
                    <td
                      key={a.ad}
                      className={cn(
                        "whitespace-nowrap px-4 py-3",
                        a.tip === "kod" && "font-mono text-xs font-semibold",
                        a.tip === "sayi" && "sayi text-right",
                        p ? "line-through decoration-tas-300" : "text-murekkep",
                      )}
                    >
                      {goster(a, r)}
                    </td>
                  ))}
                  {!tur.aktifYok && (
                    <td className="px-4 py-3">
                      {p ? (
                        <span className="rounded-full bg-tas-200 px-2.5 py-0.5 text-xs font-semibold text-tas-600">Pasif</span>
                      ) : (
                        <span className="rounded-full bg-uygun-acik px-2.5 py-0.5 text-xs font-semibold text-uygun">Aktif</span>
                      )}
                    </td>
                  )}
                  {yonetici && (
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1.5">
                        {!p && (
                          <button onClick={() => setDuzenle(r)} className="flex h-8 items-center gap-1 rounded-md border border-tas-200 px-2.5 text-xs font-semibold text-tas-600 hover:border-unity hover:text-unity">
                            <Pencil className="h-3.5 w-3.5" /> Düzenle
                          </button>
                        )}
                        {!tur.aktifYok && (
                          <button
                            onClick={() => setPasif(r)}
                            className={cn(
                              "flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold",
                              p ? "border border-uygun/40 text-uygun hover:bg-uygun-acik" : "text-tas-500 hover:bg-unity-acik hover:text-unity",
                            )}
                          >
                            {p ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                            {p ? "Tekrar aktif et" : "Pasife al"}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {!liste.isLoading && !satirlar.length && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-tas-400">
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {duzenle && <TanimPenceresi tur={tur} satir={duzenle === "yeni" ? null : duzenle} kapat={() => setDuzenle(null)} urunler={urunler.data} malzemeler={malzemeler.data} />}
      {pasif && (
        <PasifPenceresi
          baslik={`${tur.alanlar.map((a) => goster(a, pasif)).slice(0, 2).join(" · ")}`}
          aktifEt={pasif.aktif === false}
          yol={`/tanimlar/${tur.id}/${pasif.id}`}
          kapat={() => setPasif(null)}
        />
      )}
    </div>
  );
}

function TanimPenceresi({ tur, satir, kapat, urunler, malzemeler }: {
  tur: Tur;
  satir: Satir | null;
  kapat: () => void;
  urunler?: Satir[];
  malzemeler?: Satir[];
}) {
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(tur.alanlar.map((a) => [a.ad, satir?.[a.ad] === null || satir?.[a.ad] === undefined ? "" : String(satir[a.ad])])),
  );
  const [gerekce, setGerekce] = useState("");
  const kaydet = useMutation({
    mutationFn: () => {
      const govde: Record<string, any> = {};
      for (const a of tur.alanlar) {
        if (satir && a.kilitli) continue;
        const x = v[a.ad].trim();
        if (satir && x === (satir[a.ad] === null || satir[a.ad] === undefined ? "" : String(satir[a.ad]))) continue;
        govde[a.ad] = x === "" ? null : a.tip === "kod" ? x.toUpperCase() : x;
      }
      if (satir) {
        if (!Object.keys(govde).length) throw new Error("Değişiklik yok");
        return api(`/tanimlar/${tur.id}/${satir.id}`, { yontem: "PATCH", govde: { ...govde, gerekce: gerekce.trim() || undefined } });
      }
      return api(`/tanimlar/${tur.id}`, { govde });
    },
    onSuccess: () => {
      toast.success(satir ? "Değişiklik kaydedildi." : "Eklendi.");
      qc.invalidateQueries({ queryKey: ["tanimlar"] });
      kapat();
    },
    onError: (e: any) => toast.error(e?.message === "Değişiklik yok" ? "Değişiklik yok." : hataMesaji(e, "Kaydedilemedi.")),
  });
  const eksik = tur.alanlar.some((a) => a.zorunlu && !v[a.ad].trim());

  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-w-xl p-0">
        <PencereBasligi
          ust={`Tanımlar · ${tur.ad}`}
          baslik={satir ? `${tur.tekil[0].toLocaleUpperCase("tr")}${tur.tekil.slice(1)} düzenle` : `Yeni ${tur.tekil}`}
          aciklama={satir ? "Kod alanları değiştirilemez; barkodlar ve eski kayıtlar bu koda bağlıdır." : undefined}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!eksik) kaydet.mutate();
          }}
          className="grid gap-4 px-6 pb-6 sm:grid-cols-2"
        >
          {tur.alanlar.map((a) => {
            const kilitli = !!satir && a.kilitli;
            const ortak = { value: v[a.ad], disabled: kilitli, onChange: (e: any) => setV({ ...v, [a.ad]: e.target.value }), className: girdi };
            return (
              <Alan key={a.ad} etiket={`${a.etiket}${a.zorunlu ? "" : " (isteğe bağlı)"}`} ipucu={a.tip === "kod" && !kilitli ? "Büyük harf, rakam ve tire; Türkçe karakter yok" : undefined}>
                {a.tip === "secim" ? (
                  <select {...ortak}>
                    <option value="">Seçiniz</option>
                    {a.secenekler!.map(([k, e]) => (
                      <option key={k} value={k}>
                        {e}
                      </option>
                    ))}
                  </select>
                ) : a.tip === "baglanti" ? (
                  <select {...ortak}>
                    <option value="">Seçiniz</option>
                    {(a.baglanti === "urunler" ? urunler : malzemeler)
                      ?.filter((x) => x.aktif !== false || x.id === v[a.ad])
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.kod} — {tr(x.ad)}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input {...ortak} inputMode={a.tip === "sayi" ? "decimal" : undefined} style={a.tip === "kod" ? { textTransform: "uppercase" } : undefined} />
                )}
              </Alan>
            );
          })}
          {satir && (
            <Alan etiket="Değişiklik gerekçesi (isteğe bağlı)" genis>
              <input className={girdi} value={gerekce} onChange={(e) => setGerekce(e.target.value)} />
            </Alan>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={kapat}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={eksik || kaydet.isPending} className="bg-unity hover:bg-unity-koyu">
              {kaydet.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Pasife al / tekrar aktif et. Gerekce zorunlu (pasife alirken), degisiklik izine yazilir.
function PasifPenceresi({ baslik, aktifEt, yol, kapat }: { baslik: string; aktifEt: boolean; yol: string; kapat: () => void }) {
  const qc = useQueryClient();
  const [gerekce, setGerekce] = useState("");
  const m = useMutation({
    mutationFn: () => api(yol, { yontem: "PATCH", govde: { aktif: aktifEt, gerekce: gerekce.trim() } }),
    onSuccess: () => {
      toast.success(aktifEt ? "Tekrar aktif edildi." : "Pasife alındı. Silinmedi; eski kayıtlarda görünmeye devam eder.");
      qc.invalidateQueries({ queryKey: ["tanimlar"] });
      qc.invalidateQueries({ queryKey: ["onaylar"] });
      kapat();
    },
    onError: (e) => toast.error(hataMesaji(e, "Yapılamadı.")),
  });
  const yeterli = aktifEt || gerekce.trim().length >= 5;
  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-w-lg p-0">
        <PencereBasligi
          ust="Tanımlar"
          baslik={aktifEt ? "Tekrar aktif edilsin mi?" : "Pasife alınsın mı?"}
          aciklama={
            aktifEt
              ? `${tr(baslik)} yeniden seçim listelerinde görünecek.`
              : `${tr(baslik)} silinmez. Yeni kayıtlarda seçilemez, eski kayıtlarda görünmeye devam eder. Adınız, saat ve gerekçe kayda geçer.`
          }
        />
        <div className="space-y-4 px-6 pb-6">
          <Textarea rows={3} autoFocus value={gerekce} onChange={(e) => setGerekce(e.target.value)} placeholder={aktifEt ? "Gerekçe (isteğe bağlı)" : "Gerekçe (zorunlu, en az 5 karakter)"} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={kapat}>
              Vazgeç
            </Button>
            <Button onClick={() => m.mutate()} disabled={!yeterli || m.isPending} className={aktifEt ? "bg-uygun hover:bg-uygun/90" : "bg-unity hover:bg-unity-koyu"}>
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : aktifEt ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              {aktifEt ? "Aktif et" : "Pasife al"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------
// Kullanicilar (yalnizca yonetici): ekle, rol degistir, sifre sifirla, pasife al
// ---------------------------------------------------------------------------------
type Kullanici = { id: string; kullaniciAdi: string | null; adSoyad: string; sicilNo: string | null; roller: Rol[]; aktif: boolean; sonGiris: string | null };
const ROLLER: Rol[] = ["ADMIN", "YONETIM", "KALITE", "SEF", "DEPO", "OPERATOR", "DENETCI"];

function Kullanicilar() {
  const oturum = useOturum();
  const liste = useQuery({ queryKey: ["tanimlar", "kullanicilar"], queryFn: () => api<Kullanici[]>("/tanimlar/kullanicilar") });
  const [duzenle, setDuzenle] = useState<Kullanici | "yeni" | null>(null);
  const [pasif, setPasif] = useState<Kullanici | null>(null);
  const satirlar = [...(liste.data || [])].sort((a, b) => Number(b.aktif) - Number(a.aktif));

  return (
    <div className="overflow-hidden rounded-xl border border-tas-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tas-200 p-4">
        <div>
          <h2 className="font-display text-2xl font-bold italic text-murekkep">Kullanıcılar</h2>
          <p className="text-xs text-tas-400">Herkes kullanıcı adı ve şifresiyle girer. İşten ayrılan kişi pasife alınır; geçmiş kayıtlarda adı kalır.</p>
        </div>
        <Button onClick={() => setDuzenle("yeni")} className="h-10 gap-2 bg-unity font-semibold hover:bg-unity-koyu">
          <Plus className="h-4 w-4" /> Yeni kullanıcı
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-tas-200 bg-tas-50 text-left text-[11px] font-bold uppercase tracking-wider text-tas-500">
            <th className="px-4 py-3">Ad soyad</th>
            <th className="px-4 py-3">Kullanıcı adı</th>
            <th className="px-4 py-3">Yetkiler</th>
            <th className="px-4 py-3">Son giriş</th>
            <th className="px-4 py-3">Durum</th>
            <th className="px-4 py-3 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-tas-100">
          {satirlar.map((k) => (
            <tr key={k.id} className={cn("hover:bg-tas-50", !k.aktif && "text-tas-400")}>
              <td className={cn("px-4 py-3 font-semibold", k.aktif ? "text-murekkep" : "line-through")}>{tr(k.adSoyad)}</td>
              <td className="px-4 py-3 font-mono text-xs">{k.kullaniciAdi || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {k.roller.map((r) => (
                    <span key={r} className="rounded bg-tas-100 px-1.5 py-0.5 text-[11px] font-semibold text-tas-600">
                      {ROL_ADLARI[r] || r}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-tas-500">{tarihSaat(k.sonGiris) || "—"}</td>
              <td className="px-4 py-3">
                {k.aktif ? (
                  <span className="rounded-full bg-uygun-acik px-2.5 py-0.5 text-xs font-semibold text-uygun">Aktif</span>
                ) : (
                  <span className="rounded-full bg-tas-200 px-2.5 py-0.5 text-xs font-semibold text-tas-600">Pasif</span>
                )}
              </td>
              <td className="px-4 py-2">
                <div className="flex justify-end gap-1.5">
                  {k.aktif && (
                    <button onClick={() => setDuzenle(k)} className="flex h-8 items-center gap-1 rounded-md border border-tas-200 px-2.5 text-xs font-semibold text-tas-600 hover:border-unity hover:text-unity">
                      <Pencil className="h-3.5 w-3.5" /> Düzenle
                    </button>
                  )}
                  {k.id !== oturum?.kullanici.id && (
                    <button
                      onClick={() => setPasif(k)}
                      className={cn(
                        "flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold",
                        !k.aktif ? "border border-uygun/40 text-uygun hover:bg-uygun-acik" : "text-tas-500 hover:bg-unity-acik hover:text-unity",
                      )}
                    >
                      {!k.aktif ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      {!k.aktif ? "Tekrar aktif et" : "Pasife al"}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {duzenle && <KullaniciPenceresi k={duzenle === "yeni" ? null : duzenle} kapat={() => setDuzenle(null)} />}
      {pasif && <PasifPenceresi baslik={pasif.adSoyad} aktifEt={!pasif.aktif} yol={`/tanimlar/kullanicilar/${pasif.id}`} kapat={() => setPasif(null)} />}
    </div>
  );
}

function KullaniciPenceresi({ k, kapat }: { k: Kullanici | null; kapat: () => void }) {
  const qc = useQueryClient();
  const [adSoyad, setAdSoyad] = useState(k?.adSoyad || "");
  const [kullaniciAdi, setKullaniciAdi] = useState(k?.kullaniciAdi || "");
  const [sifre, setSifre] = useState("");
  const [roller, setRoller] = useState<Rol[]>(k?.roller || []);
  const m = useMutation({
    mutationFn: () =>
      k
        ? api(`/tanimlar/kullanicilar/${k.id}`, { yontem: "PATCH", govde: { adSoyad: adSoyad.trim(), roller, ...(sifre ? { sifre } : {}) } })
        : api("/tanimlar/kullanicilar", { govde: { adSoyad: adSoyad.trim(), kullaniciAdi: kullaniciAdi.trim().toLowerCase(), sifre, roller } }),
    onSuccess: () => {
      toast.success(k ? "Kullanıcı güncellendi." : "Kullanıcı eklendi.");
      qc.invalidateQueries({ queryKey: ["tanimlar"] });
      qc.invalidateQueries({ queryKey: ["onaylar"] });
      kapat();
    },
    onError: (e) => toast.error(hataMesaji(e, "Kaydedilemedi.")),
  });
  const eksik = !adSoyad.trim() || !roller.length || (!k && (!kullaniciAdi.trim() || sifre.length < 8)) || (!!sifre && sifre.length < 8);
  return (
    <Dialog open onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-w-xl p-0">
        <PencereBasligi ust="Tanımlar · Kullanıcılar" baslik={k ? tr(k.adSoyad) : "Yeni kullanıcı"} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!eksik) m.mutate();
          }}
          className="grid gap-4 px-6 pb-6 sm:grid-cols-2"
        >
          <Alan etiket="Ad soyad">
            <input className={girdi} value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} />
          </Alan>
          <Alan etiket="Kullanıcı adı" ipucu={k ? "Değiştirilemez" : "Küçük harf, boşluksuz"}>
            <input className={girdi} value={kullaniciAdi} disabled={!!k} onChange={(e) => setKullaniciAdi(e.target.value)} autoComplete="off" />
          </Alan>
          <Alan etiket={k ? "Yeni şifre (değiştirmek için)" : "Şifre"} ipucu="En az 8 karakter" genis>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tas-400" />
              <input className={cn(girdi, "pl-9")} type="text" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="new-password" />
            </div>
          </Alan>
          <div className="sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-tas-500">Yetkiler</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLLER.map((r) => {
                const var_ = roller.includes(r);
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRoller(var_ ? roller.filter((x) => x !== r) : [...roller, r])}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition",
                      var_ ? "border-murekkep bg-murekkep font-semibold text-white" : "border-tas-200 text-tas-600 hover:border-unity",
                    )}
                  >
                    {ROL_ADLARI[r]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-tas-400">Yönetici her şeyi yapabilir. Denetçi yalnızca okur.</p>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={kapat}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={eksik || m.isPending} className="bg-unity hover:bg-unity-koyu">
              {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
