// Giris yapmis kullanicinin gordugu kabuk: sol menu + sayfa icerigi
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  GitBranch,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  ShieldAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { oturumKapat, ROL_ADLARI, useOturum } from "@/lib/oturum";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/sozluk";
import { TABLES } from "@/lib/iso-data";
import { UnityLogo } from "@/components/marka/Marka";

export const Route = createFileRoute("/_panel")({ component: PanelKabugu });

const ACIK_ANAHTAR = "unity.menuAcik";

// ISO formlarinin menu ikonlari (kodlar ve basliklar lib/iso-data.ts TABLES'tan gelir)
const FORM_IKON: Record<string, LucideIcon> = {
  "yonetim-paneli": BarChart3,
  hammadde: PackagePlus,
  "uretim-emri": ClipboardList,
  "uretim-lot": Layers,
  "karantina-red": ShieldAlert,
  "kalite-kontrol": ClipboardCheck,
  sevkiyat: Truck,
};

function PanelKabugu() {
  const oturum = useOturum();
  const nav = useNavigate();
  const [acik, setAcik] = useState(() => {
    try {
      return localStorage.getItem(ACIK_ANAHTAR) !== "0";
    } catch {
      return true;
    }
  });

  // Oturum yoksa ya da suresi dolduysa giris ekranina
  // Giristen sonra kaldigi sayfaya donebilsin (ornek: QR ile acilan urun sayfasi)
  useEffect(() => {
    if (oturum) return;
    try {
      sessionStorage.setItem("unity.donus", location.pathname);
    } catch {
      /* yok say */
    }
    nav({ to: "/", replace: true });
  }, [oturum, nav]);

  // Token suresi dolunca otomatik cikis
  useEffect(() => {
    if (!oturum) return;
    const kalan = oturum.bitis - Date.now();
    const t = setTimeout(oturumKapat, Math.max(0, Math.min(kalan, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [oturum]);

  if (!oturum) return null;
  const k = oturum.kullanici;

  const degistir = () => {
    setAcik((x) => {
      try {
        localStorage.setItem(ACIK_ANAHTAR, x ? "0" : "1");
      } catch {
        /* yok say */
      }
      return !x;
    });
  };

  const baglanti = (yol: string, Ikon: LucideIcon, etiket: string, tam = true, kod?: string) => (
    <Link
      key={yol}
      to={yol as any}
      title={kod ? `${kod} · ${etiket}` : etiket}
      className={cn(
        "group relative flex items-center rounded-lg py-2.5 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white",
        acik ? "gap-3 px-3" : "justify-center px-0",
      )}
      activeProps={{ className: "!bg-white/[0.08] !text-white font-semibold [&>.isaret]:opacity-100" }}
      activeOptions={{ exact: tam }}
    >
      <span className="isaret egik absolute -left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 bg-unity opacity-0 transition" />
      <Ikon className="h-[18px] w-[18px] shrink-0" />
      {acik && kod && (
        <span className="w-9 shrink-0 font-mono text-[11px] font-semibold text-unity">{kod}</span>
      )}
      {acik && <span className="truncate">{etiket}</span>}
    </Link>
  );

  const Baslik = ({ children }: { children: string }) =>
    acik ? (
      <div className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">{children}</div>
    ) : (
      <div className="mx-3 my-4 border-t border-white/10" />
    );

  return (
    <div className="flex min-h-dvh bg-kagit">
      <aside
        className={cn(
          "sticky top-0 flex h-dvh shrink-0 flex-col overflow-hidden bg-gece text-white transition-[width] duration-300",
          acik ? "w-64" : "w-[72px]",
        )}
      >
        <div className="doku-cizgi pointer-events-none absolute inset-0" />

        <div className={cn("relative flex items-center pb-4 pt-6", acik ? "justify-between px-5" : "flex-col gap-4 px-2")}>
          {acik ? (
            <UnityLogo koyuZemin className="h-9" />
          ) : (
            <span className="font-display text-2xl font-extrabold italic text-unity">U</span>
          )}
          <button
            onClick={degistir}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
            aria-label={acik ? "Menüyü daralt" : "Menüyü genişlet"}
          >
            {acik ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
          {baglanti("/panel", LayoutDashboard, "Genel Bakış")}
          {baglanti("/izle", GitBranch, "Ürün Hikâyesi", false)}

          <Baslik>Formlar</Baslik>
          {TABLES.map((t) =>
            baglanti(`/tablo/${t.slug}`, FORM_IKON[t.slug] ?? ClipboardList, t.title, true, t.code),
          )}

          <Baslik>Ayarlar</Baslik>
          {baglanti("/tablo/tanimlar", BookOpen, "Tanımlar")}
        </nav>

        <div className={cn("relative border-t border-white/10 p-3", !acik && "flex flex-col items-center gap-2")}>
          <div className={cn("flex items-center gap-3", acik && "px-2 py-1")}>
            <span className="egik flex h-9 w-9 shrink-0 items-center justify-center bg-unity">
              <span className="egik-duz font-display text-sm font-bold">{basHarfler(k.adSoyad)}</span>
            </span>
            {acik && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{tr(k.adSoyad)}</div>
                <div className="truncate text-[11px] text-white/40">
                  {k.roller.map((r) => ROL_ADLARI[r] || r).join(" · ")}
                </div>
              </div>
            )}
            {acik && (
              <button
                onClick={oturumKapat}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-unity"
                aria-label="Çıkış yap"
                title="Çıkış yap"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
          {!acik && (
            <button
              onClick={oturumKapat}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-unity"
              aria-label="Çıkış yap"
              title="Çıkış yap"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function basHarfler(ad: string) {
  return ad
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase("tr"))
    .join("");
}
