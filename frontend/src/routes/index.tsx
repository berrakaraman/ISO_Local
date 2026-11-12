// Giris ekrani: herkes kullanici adi + sifre ile girer.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { forwardRef, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  Loader2,
  ScanBarcode,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { api, ApiHatasi, hataMesaji } from "@/lib/api";
import { oturumAc, useOturum, type Kullanici } from "@/lib/oturum";
import { cn } from "@/lib/utils";
import { Seritler, UnityLogo } from "@/components/marka/Marka";

export const Route = createFileRoute("/")({ component: GirisSayfasi });

type GirisCevabi = { token: string; kullanici: Kullanici };

const SON_KULLANICI = "unity.sonKullanici";
const oku = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const yaz = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* yok say */
  }
};

function GirisSayfasi() {
  const oturum = useOturum();
  const nav = useNavigate();

  useEffect(() => {
    if (!oturum) return;
    let donus: string | null = null;
    try {
      donus = sessionStorage.getItem("unity.donus");
      sessionStorage.removeItem("unity.donus");
    } catch {
      /* yok say */
    }
    nav({ to: (donus && donus !== "/" ? donus : "/panel") as any, replace: true });
  }, [oturum, nav]);

  return (
    <div className="flex min-h-dvh w-full bg-kagit">
      <MarkaPaneli />

      <main className="relative flex flex-1 flex-col">
        {/* Mobilde ust bant */}
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <UnityLogo className="h-9" />
          <SunucuDurumu />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[420px] animate-belir">
            <div className="mb-8">
              <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-unity">
                Üretim izlenebilirlik sistemi
              </p>
              <h1 className="mt-2 font-display text-[2.6rem] font-bold leading-none tracking-tight text-murekkep">
                Hoş geldiniz
              </h1>
              <p className="mt-3 text-[15px] text-tas-500">
                Devam etmek için kullanıcı adınız ve şifrenizle giriş yapın.
              </p>
            </div>

            <KullaniciGirisi />

            {import.meta.env.DEV && <GelistirmeHesaplari />}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 px-6 pb-6 text-xs text-tas-400 sm:px-10">
          <span>© {new Date().getFullYear()} Unity Automation Technology</span>
          <span className="hidden sm:inline">ISO 9001 · Kayıtlar değiştirilemez şekilde saklanır</span>
        </footer>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Sol: marka paneli (yalnizca genis ekranda)
---------------------------------------------------------------------------- */
function MarkaPaneli() {
  const ozellikler = [
    {
      ikon: ScanBarcode,
      baslik: "Barkodla takip",
      metin: "Her çuval, bobin ve makara tek bir numarayla izlenir.",
    },
    {
      ikon: GitBranch,
      baslik: "Soy ağacı",
      metin: "Bir sorunun kaynağına, hammaddeden müşteriye saniyeler içinde ulaşın.",
    },
    {
      ikon: ShieldCheck,
      baslik: "ISO 9001 kanıtı",
      metin: "Her kayıt kim, ne zaman ve neden bilgisiyle saklanır.",
    },
  ];

  return (
    <aside className="relative hidden w-[46%] max-w-[720px] flex-col justify-between overflow-hidden bg-gece p-12 text-white lg:flex xl:p-16">
      <div className="doku-cizgi absolute inset-0" />

      {/* Logodaki gibi egik seritler: sag ust ve sol alt */}
      <Seritler className="absolute -right-10 top-14 w-[58%]" kalinliklar={[18, 8]} bosluk={7} />
      <Seritler className="absolute -left-16 bottom-28 w-[46%]" kalinliklar={[8, 18]} bosluk={7} />

      <div className="relative">
        <UnityLogo koyuZemin className="h-14 xl:h-16" />
      </div>

      <div className="relative max-w-[30rem]">
        <h2 className="font-display text-[3.4rem] font-extrabold italic uppercase leading-[0.98] tracking-tight xl:text-[4.1rem]">
          Hammaddeden
          <br />
          müşteriye,
          <br />
          <span className="text-unity">her parçanın izi.</span>
        </h2>

        <ul className="mt-10 space-y-5">
          {ozellikler.map(({ ikon: Ikon, baslik, metin }) => (
            <li key={baslik} className="flex gap-4">
              <span className="egik flex h-10 w-10 shrink-0 items-center justify-center bg-white/[0.06] ring-1 ring-white/10">
                <Ikon className="egik-duz h-[18px] w-[18px] text-unity" strokeWidth={2.2} />
              </span>
              <div>
                <div className="font-display text-lg font-semibold tracking-wide">{baslik}</div>
                <div className="text-sm leading-relaxed text-white/55">{metin}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex items-center justify-between text-xs text-white/40">
        <span lang="en" className="font-display text-sm uppercase tracking-[0.2em]">Automation Technology</span>
        <SunucuDurumu koyu />
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------------------
   Sunucu durumu: backend calismiyorsa kullanici bunu hemen gorsun
---------------------------------------------------------------------------- */
function SunucuDurumu({ koyu = false }: { koyu?: boolean }) {
  const [durum, setDurum] = useState<"kontrol" | "bagli" | "kopuk">("kontrol");

  useEffect(() => {
    let iptal = false;
    const kontrol = async () => {
      try {
        await api("/saglik", { token: null });
        if (!iptal) setDurum("bagli");
      } catch {
        if (!iptal) setDurum("kopuk");
      }
    };
    kontrol();
    const t = setInterval(kontrol, 15000);
    return () => {
      iptal = true;
      clearInterval(t);
    };
  }, []);

  const metin = { kontrol: "Bağlantı kontrol ediliyor", bagli: "Sunucu bağlı", kopuk: "Sunucuya ulaşılamıyor" }[durum];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        koyu ? "bg-white/[0.06] text-white/70" : "bg-white text-tas-600 ring-1 ring-tas-200",
        durum === "kopuk" && (koyu ? "text-red-300" : "text-unity ring-unity/30"),
      )}
      role="status"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          durum === "bagli" && "bg-emerald-400",
          durum === "kopuk" && "bg-unity",
          durum === "kontrol" && "animate-pulse bg-tas-400",
        )}
      />
      {metin}
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Ortak parcalar
---------------------------------------------------------------------------- */
function HataKutusu({ mesaj, sallan }: { mesaj: string; sallan: number }) {
  return (
    <div
      key={sallan}
      role="alert"
      className="flex animate-sallan items-start gap-3 rounded-lg border border-unity/25 bg-unity-acik px-4 py-3 text-sm text-unity-koyu"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{mesaj}</span>
    </div>
  );
}

function GirisButonu({ yukleniyor, disabled, children }: { yukleniyor: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={yukleniyor || disabled}
      className="group relative flex h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-unity font-display text-lg font-bold italic uppercase tracking-wider text-white shadow-[0_10px_30px_-12px_rgba(237,28,36,0.8)] transition-all hover:bg-unity-koyu active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="egik absolute -left-6 top-0 h-full w-10 bg-white/10 transition-transform duration-500 group-hover:translate-x-[460px]" />
      {yukleniyor ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

type AlanProps = React.InputHTMLAttributes<HTMLInputElement> & {
  etiket: string;
  ikon: typeof UserRound;
  sag?: React.ReactNode;
};
const Alan = forwardRef<HTMLInputElement, AlanProps>(function Alan({ etiket, ikon: Ikon, sag, ...props }, ref) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-tas-600">{etiket}</span>
      <span className="relative block">
        <Ikon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-tas-400" />
        <input
          ref={ref}
          {...props}
          className="h-13 w-full rounded-xl border border-tas-200 bg-white pl-11 pr-12 text-[15px] text-murekkep shadow-[0_1px_0_rgba(0,0,0,0.02)] outline-none transition placeholder:text-tas-300 focus:border-unity focus:ring-4 focus:ring-unity/10"
        />
        {sag && <span className="absolute right-2 top-1/2 -translate-y-1/2">{sag}</span>}
      </span>
    </label>
  );
});

// Basarili giristen sonra oturumu acar
function girisiTamamla(c: GirisCevabi, kiosk: boolean) {
  oturumAc(c.token, c.kullanici, kiosk);
}

/* ----------------------------------------------------------------------------
   Kullanici adi + sifre
---------------------------------------------------------------------------- */
function KullaniciGirisi() {
  const [kullaniciAdi, setKullaniciAdi] = useState(() => oku(SON_KULLANICI) || "");
  const [sifre, setSifre] = useState("");
  const [firmaKodu, setFirmaKodu] = useState("");
  const [firmaGerekli, setFirmaGerekli] = useState(false);
  const [hatirla, setHatirla] = useState(() => !!oku(SON_KULLANICI));
  const [sifreGoster, setSifreGoster] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sallan, setSallan] = useState(0);
  const sifreRef = useRef<HTMLInputElement>(null);

  // Gelistirme hesaplari butonlari bu olayi gonderir
  useEffect(() => {
    const doldur = (e: Event) => {
      const { kullaniciAdi: k, sifre: s } = (e as CustomEvent).detail;
      setKullaniciAdi(k);
      setSifre(s);
      setHata(null);
    };
    window.addEventListener("unity:doldur", doldur);
    return () => window.removeEventListener("unity:doldur", doldur);
  }, []);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kullaniciAdi.trim() || !sifre) {
      setHata("Kullanıcı adı ve şifre gerekli.");
      setSallan((x) => x + 1);
      return;
    }
    setYukleniyor(true);
    setHata(null);
    try {
      const c = await api<GirisCevabi>("/auth/giris", {
        token: null,
        govde: { kullaniciAdi: kullaniciAdi.trim(), sifre, firmaKodu: firmaKodu.trim() || undefined },
      });
      yaz(SON_KULLANICI, hatirla ? kullaniciAdi.trim() : null);
      girisiTamamla(c, false);
    } catch (err) {
      if (err instanceof ApiHatasi && err.kod === "GECERSIZ_ISTEK" && /firma/i.test(err.message)) {
        setFirmaGerekli(true);
        setHata("Bu kullanıcı adı birden fazla firmada var. Lütfen firma kodunu da girin.");
      } else if (err instanceof ApiHatasi && err.kod === "OTURUM_YOK") {
        setHata("Kullanıcı adı veya şifre hatalı.");
        setSifre("");
        sifreRef.current?.focus();
      } else {
        setHata(hataMesaji(err, "Giriş yapılamadı."));
      }
      setSallan((x) => x + 1);
    } finally {
      setYukleniyor(false);
    }
  };

  const capsKontrol = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <form onSubmit={gonder} className="space-y-5" noValidate>
      {firmaGerekli && (
        <Alan
          etiket="Firma kodu"
          ikon={Building2}
          value={firmaKodu}
          onChange={(e) => setFirmaKodu(e.target.value.toUpperCase())}
          placeholder="Örn: ORNEK"
          autoComplete="organization"
        />
      )}
      <Alan
        etiket="Kullanıcı adı"
        ikon={UserRound}
        value={kullaniciAdi}
        onChange={(e) => setKullaniciAdi(e.target.value)}
        placeholder="kullanıcı adınız"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={!kullaniciAdi}
      />
      <div>
        <Alan
          ref={sifreRef}
          etiket="Şifre"
          ikon={KeyRound}
          type={sifreGoster ? "text" : "password"}
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          onKeyUp={capsKontrol}
          onKeyDown={capsKontrol}
          placeholder="••••••••"
          autoComplete="current-password"
          autoFocus={!!kullaniciAdi}
          sag={
            <button
              type="button"
              onClick={() => setSifreGoster((x) => !x)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-tas-400 transition hover:bg-tas-100 hover:text-murekkep"
              aria-label={sifreGoster ? "Şifreyi gizle" : "Şifreyi göster"}
            >
              {sifreGoster ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          }
        />
        {capsLock && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-dikkat">
            <TriangleAlert className="h-3.5 w-3.5" /> Büyük harf kilidi (Caps Lock) açık
          </p>
        )}
      </div>

      <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-tas-600">
        <input
          type="checkbox"
          checked={hatirla}
          onChange={(e) => setHatirla(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-tas-300 accent-unity"
        />
        Kullanıcı adımı bu cihazda hatırla
      </label>

      {hata && <HataKutusu mesaj={hata} sallan={sallan} />}

      <GirisButonu yukleniyor={yukleniyor}>
        Giriş yap <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </GirisButonu>

      <p className="text-center text-xs text-tas-400">Şifrenizi unuttuysanız sistem yöneticinize başvurun.</p>
    </form>
  );
}

/* ----------------------------------------------------------------------------
   Yalnizca gelistirme ortaminda: ornek hesaplarla tek tikla doldur
---------------------------------------------------------------------------- */
function GelistirmeHesaplari() {
  // backend/src/db/seed.js'teki kisilerle ayni
  const hesaplar = [
    { ad: "berra", sifre: "Berra.1234", rol: "Yönetici · Kalite" },
    { ad: "mehmet", sifre: "Mehmet.1234", rol: "Üretim şefi" },
    { ad: "ayse", sifre: "Ayse.1234", rol: "Depo" },
    { ad: "ahmet", sifre: "Ahmet.1234", rol: "Operatör" },
    { ad: "said", sifre: "Said.1234", rol: "Kalite" },
    { ad: "denetci", sifre: "Denetci.1234", rol: "Denetçi" },
  ];
  return (
    <div className="mt-8 rounded-xl border border-dashed border-tas-300 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-tas-400">
        Geliştirme hesapları · yalnızca yerelde görünür
      </div>
      <div className="flex flex-wrap gap-1.5">
        {hesaplar.map((h) => (
          <button
            key={h.ad}
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("unity:doldur", {
                  detail: { kullaniciAdi: h.ad, sifre: h.sifre },
                }),
              )
            }
            className="rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-tas-200 transition hover:ring-unity"
          >
            <span className="font-semibold text-murekkep">{h.ad}</span>
            <span className="ml-1.5 text-tas-400">{h.rol}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
