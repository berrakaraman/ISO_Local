// Genel bakis: giristen sonra gelinen ilk sayfa. Ozet kartlari, Gorevlerim (bana atanan onaylar), son olaylar.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, ArrowRight, ClipboardCheck, Factory, Inbox, PackageSearch, ShieldAlert, Timer } from "lucide-react";
import { api, hataMesaji } from "@/lib/api";
import { useOturum } from "@/lib/oturum";
import { Seritler } from "@/components/marka/Marka";
import { BarkodArama } from "@/components/izle/BarkodArama";
import { olayAdi, saat, tarihSaat, tr } from "@/lib/sozluk";
import { ONAY_FORMU, type Onay } from "@/lib/onay";
import { OnayRozeti } from "@/components/iso/StatusBadge";

type SonOlay = { id: number; zaman: string; tip: string; barkod: string | null; isEmriNo: string | null; kullanici: string | null; aciklama: string | null };

export const Route = createFileRoute("/_panel/panel")({ component: GenelBakis });

type Ozet = {
  bugunUretilen: number;
  bugunKarantina: number;
  kararBekleyen: number;
  blokeBirim: number;
  blokeLot: number;
  kaliteBekleyen: number;
  hammaddeKontrolBekleyen: number;
  aktifIsEmri: number;
  planlananIsEmri: number;
  farkAciklamasiBekleyen: number;
};

function selamla() {
  const s = new Date().getHours();
  if (s < 6) return "İyi geceler";
  if (s < 12) return "Günaydın";
  if (s < 18) return "İyi günler";
  return "İyi akşamlar";
}

function GenelBakis() {
  const oturum = useOturum()!;
  const ozet = useQuery({
    queryKey: ["panel", "ozet"],
    queryFn: () => api<Ozet>("/panel/ozet"),
    refetchInterval: 30_000,
  });
  const o = ozet.data;
  const sayi = (n?: number) => (n === undefined ? "–" : n.toLocaleString("tr-TR"));

  const kartlar = [
    { etiket: "Bugün üretilen", deger: sayi(o?.bugunUretilen), birim: "m", ikon: Factory },
    { etiket: "Aktif iş emri", deger: sayi(o?.aktifIsEmri), alt: `${sayi(o?.planlananIsEmri)} planlandı`, ikon: Timer },
    { etiket: "Kalite onayı bekleyen", deger: sayi(o?.kaliteBekleyen), ikon: ClipboardCheck, vurgu: !!o?.kaliteBekleyen },
    { etiket: "Karantina kararı bekleyen", deger: sayi(o?.kararBekleyen), ikon: ShieldAlert, vurgu: !!o?.kararBekleyen },
    { etiket: "Hammadde kontrolü bekleyen", deger: sayi(o?.hammaddeKontrolBekleyen), ikon: PackageSearch },
    { etiket: "Blokeli birim", deger: sayi(o?.blokeBirim), alt: `${sayi(o?.blokeLot)} lot`, ikon: AlertOctagon, vurgu: !!o?.blokeBirim },
  ];

  return (
    <div className="animate-belir">
      <header className="relative overflow-hidden border-b border-tas-200 bg-white px-8 pb-7 pt-9">
        <Seritler className="absolute -right-6 top-8 w-56" kalinliklar={[10, 5]} bosluk={5} />
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-unity">Genel bakış</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-murekkep">
          {selamla()}, {tr(oturum.kullanici.adSoyad).split(" ")[0]}
        </h1>
        <p className="mt-1.5 text-sm text-tas-500">
          {tr(oturum.kullanici.firma.unvan)} ·{" "}
          {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </header>

      <div className="space-y-6 p-8">
        {ozet.isError && (
          <div className="rounded-lg border border-unity/25 bg-unity-acik px-4 py-3 text-sm text-unity-koyu">
            {hataMesaji(ozet.error, "Özet yüklenemedi.")}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {kartlar.map(({ etiket, deger, birim, alt, ikon: Ikon, vurgu }) => (
            <div key={etiket} className="relative overflow-hidden rounded-xl border border-tas-200 bg-white p-5">
              {vurgu && <span className="absolute left-0 top-0 h-full w-1 bg-unity" />}
              <div className="flex items-center justify-between text-sm text-tas-500">
                <span>{etiket}</span>
                <Ikon className={vurgu ? "h-4 w-4 text-unity" : "h-4 w-4 text-tas-400"} />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="sayi font-display text-4xl font-bold text-murekkep">
                  {ozet.isLoading ? <span className="inline-block h-9 w-16 animate-pulse rounded bg-tas-100" /> : deger}
                </span>
                {birim && <span className="text-sm text-tas-400">{birim}</span>}
              </div>
              {alt && <div className="mt-1 text-xs text-tas-400">{alt}</div>}
            </div>
          ))}
        </div>
        <Gorevlerim />
        <SonOlaylar />
      </div>
    </div>
  );
}

function SonOlaylar() {
  const s = useQuery({ queryKey: ["panel", "olaylar", 12], queryFn: () => api<SonOlay[]>("/panel/olaylar?limit=12"), refetchInterval: 30_000 });
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1fr_1.4fr]">
      <section className="rounded-xl border border-tas-200 bg-white p-5">
        <h2 className="font-display text-xl font-bold text-murekkep">Bir ürünün hikâyesine bakın</h2>
        <p className="mb-4 mt-1 text-sm text-tas-500">Barkodu okutun ya da yazın: nereden geldi, kim üretti, nereye gitti.</p>
        <BarkodArama />
      </section>
      <section className="rounded-xl border border-tas-200 bg-white">
        <h2 className="border-b border-tas-100 px-5 py-3 font-display text-xl font-bold text-murekkep">Son olaylar</h2>
        <ul className="divide-y divide-tas-100">
          {(s.data || []).map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-5 py-2 text-sm">
              <span className="sayi w-16 shrink-0 font-mono text-[11px] text-tas-400">{saat(o.zaman)}</span>
              <span className="w-44 shrink-0 truncate font-semibold text-murekkep">{olayAdi(o.tip)}</span>
              {o.barkod ? (
                <Link to="/izle/$barkod" params={{ barkod: o.barkod }} className="font-mono text-xs font-semibold text-tas-600 hover:text-unity">
                  {o.barkod}
                </Link>
              ) : (
                <span className="font-mono text-xs text-tas-400">{o.isEmriNo}</span>
              )}
              <span className="ml-auto truncate text-xs text-tas-400">{tr(o.kullanici)}</span>
            </li>
          ))}
          {s.data && !s.data.length && <li className="px-5 py-6 text-sm text-tas-400">Henüz olay yok.</li>}
        </ul>
      </section>
    </div>
  );
}

// Bana atanmis, karar bekleyen onaylar (eski Genel Bakis'taki "Gorevlerim")
function Gorevlerim() {
  const g = useQuery({
    queryKey: ["onaylar", "benim"],
    queryFn: () => api<Onay[]>("/onaylar?benim=1&durum=BEKLIYOR,ASKIDA"),
    refetchInterval: 30_000,
  });
  const liste = g.data || [];
  const toplam = liste.length;
  return (
    <section className="overflow-hidden rounded-xl border border-tas-200 bg-white">
      <div className="flex items-center justify-between border-b border-tas-100 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-murekkep">
          Görevlerim
          {toplam > 0 && <span className="rounded-full bg-unity px-2 text-sm font-bold text-white">{toplam}</span>}
        </h2>
        <span className="text-xs text-tas-400">Onayınızı bekleyen kayıtlar</span>
      </div>
      {g.isError && <p className="px-5 py-4 text-sm text-unity">{hataMesaji(g.error, "Görevler yüklenemedi.")}</p>}
      {!g.isLoading && !g.isError && !toplam && (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-tas-400">
          <Inbox className="h-5 w-5" /> Onayınızı bekleyen kayıt yok.
        </div>
      )}
      <ul className="divide-y divide-tas-100">
        {liste.map((o) => {
          const form = ONAY_FORMU[o.kayitTuru];
          return (
            <li key={o.id}>
              <Link
                to={`/tablo/${form.slug}` as any}
                search={{ ac: o.kayitNo } as any}
                className="group flex items-center gap-4 px-5 py-3 text-sm transition hover:bg-tas-50"
              >
                <span className="w-12 shrink-0 font-mono text-xs font-bold text-unity">{form.kod}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs font-semibold text-murekkep">{o.kayitNo}</span>
                  <span className="ml-2 text-tas-500">{form.ad}</span>
                  <span className="block text-[11px] text-tas-400">
                    {tr(o.olusturanAd)} gönderdi · {tarihSaat(o.olusturmaZamani)}
                  </span>
                </span>
                <OnayRozeti durum={o.durum} />
                <ArrowRight className="h-4 w-4 text-tas-300 transition group-hover:translate-x-0.5 group-hover:text-unity" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
