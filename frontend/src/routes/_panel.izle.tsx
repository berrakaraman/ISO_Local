// Urun hikayesi giris sayfasi: barkodu okut, hikayesini gor.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowRight, GitBranch, QrCode, ScanBarcode, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { BIRIM_TIPI, olayAdi, tarihSaat, tr } from "@/lib/sozluk";
import { BarkodArama } from "@/components/izle/BarkodArama";
import { Seritler } from "@/components/marka/Marka";

export const Route = createFileRoute("/_panel/izle")({ component: IzleGiris });

type SonOlay = { id: number; zaman: string; tip: string; barkod: string | null; birimTipi: string | null; kullanici: string | null };

function IzleGiris() {
  const son = useQuery({ queryKey: ["panel", "olaylar", 200], queryFn: () => api<SonOlay[]>("/panel/olaylar?limit=200") });

  // Son hareket goren barkodlar (tipine gore gruplu)
  const gruplar = useMemo(() => {
    const gorulen = new Set<string>();
    const g: Record<string, SonOlay[]> = {};
    for (const o of son.data || []) {
      if (!o.barkod || gorulen.has(o.barkod)) continue;
      gorulen.add(o.barkod);
      const t = o.birimTipi || "?";
      (g[t] ||= []).push(o);
    }
    return g;
  }, [son.data]);

  const adimlar = [
    { ikon: ScanBarcode, baslik: "Okutun", metin: "Hammadde, top, makara, karantina ya da sevkiyat: herhangi bir barkod ya da lot numarası." },
    { ikon: GitBranch, baslik: "Akışı görün", metin: "Nereden geldi, hangi makinede kim üretti, neye dönüştü, kime gitti." },
    { ikon: Scale, baslik: "Hesabı görün", metin: "Ne kadarı kullanıldı, ne kadarı hurda, ne kadarı karantinada, ne karar verildi." },
    { ikon: QrCode, baslik: "Telefondan", metin: "Etiketteki QR telefon kamerasıyla okutulunca bu sayfa doğrudan açılır." },
  ];

  return (
    <div className="animate-belir">
      <header className="relative overflow-hidden bg-gece px-8 pb-12 pt-10 text-white">
        <div className="doku-cizgi absolute inset-0" />
        <Seritler className="absolute -right-8 top-10 w-72" kalinliklar={[14, 6]} bosluk={6} />
        <div className="relative max-w-3xl">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-unity">İzlenebilirlik</p>
          <h1 className="mt-1 font-display text-5xl font-extrabold uppercase italic leading-[0.95] tracking-tight">Ürün hikâyesi</h1>
          <p className="mt-3 max-w-xl text-white/60">
            Bir ürünün ilk satın alındığı hâlinden müşteriye gidene kadar başına gelen her şey: ne zaman, kim, ne kadar.
          </p>
          <BarkodArama buyuk otomatikOdak className="mt-7 [&_input]:border-transparent" />
        </div>
      </header>

      <div className="space-y-8 p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {adimlar.map(({ ikon: Ikon, baslik, metin }, i) => (
            <div key={baslik} className="rounded-xl border border-tas-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="egik flex h-9 w-9 items-center justify-center bg-unity">
                  <Ikon className="egik-duz h-4 w-4 text-white" />
                </span>
                <span className="font-display text-lg font-bold text-murekkep">
                  {i + 1}. {baslik}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-tas-500">{metin}</p>
            </div>
          ))}
        </div>

        <section>
          <h2 className="mb-3 font-display text-xl font-bold text-murekkep">Son hareket gören barkodlar</h2>
          {son.isLoading && <div className="h-32 animate-pulse rounded-xl bg-tas-100" />}
          {!son.isLoading && !Object.keys(gruplar).length && (
            <p className="rounded-xl border border-dashed border-tas-300 p-6 text-sm text-tas-500">
              Henüz kayıt yok. Örnek veri için backend klasöründe <code className="font-mono">npm run test:akis</code> çalıştırın.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {["FG", "FG_LOT", "KR", "RM", "NM"]
              .filter((t) => gruplar[t])
              .map((t) => (
                <div key={t} className="rounded-xl border border-tas-200 bg-white">
                  <div className="border-b border-tas-100 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tas-400">
                    {BIRIM_TIPI[t]?.cogul} ({gruplar[t].length})
                  </div>
                  <ul className="max-h-72 divide-y divide-tas-100 overflow-y-auto">
                    {gruplar[t].map((o) => (
                      <li key={o.barkod}>
                        <Link
                          to="/izle/$barkod"
                          params={{ barkod: o.barkod! }}
                          className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-tas-50"
                        >
                          <span className="font-mono text-[13px] font-semibold text-murekkep">{o.barkod}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-tas-400">
                            {olayAdi(o.tip)} · {tr(o.kullanici)} · {tarihSaat(o.zaman)}
                          </span>
                          <ArrowRight className="h-4 w-4 text-tas-300 transition group-hover:translate-x-0.5 group-hover:text-unity" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
