// Oturum bilgisi (token + kullanici). Tarayicida saklanir, tum sayfalar buradan okur.
import { useSyncExternalStore } from "react";

export type Rol = "ADMIN" | "YONETIM" | "KALITE" | "SEF" | "DEPO" | "OPERATOR" | "DENETCI";

export type Kullanici = {
  id: string;
  adSoyad: string;
  kullaniciAdi: string | null;
  sicilNo: string | null;
  roller: Rol[];
  firma: { kod: string; unvan: string };
};

export type Oturum = {
  token: string;
  kullanici: Kullanici;
  kiosk: boolean;
  bitis: number; // token'in bitis zamani (ms)
};

const ANAHTAR = "unity.oturum";
const dinleyiciler = new Set<() => void>();
let onbellek: Oturum | null | undefined;

// JWT'nin icindeki "exp" alanini okur (dogrulama backend'de yapilir)
function bitisZamani(token: string): number {
  try {
    const govde = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (govde.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

export function oturumOku(): Oturum | null {
  if (onbellek !== undefined) return onbellek;
  try {
    const ham = localStorage.getItem(ANAHTAR);
    const o: Oturum | null = ham ? JSON.parse(ham) : null;
    onbellek = o && o.bitis > Date.now() ? o : null;
  } catch {
    onbellek = null;
  }
  return onbellek;
}

function yay() {
  dinleyiciler.forEach((d) => d());
}

export function oturumAc(token: string, kullanici: Kullanici, kiosk: boolean) {
  const o: Oturum = { token, kullanici, kiosk, bitis: bitisZamani(token) };
  onbellek = o;
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(o));
  } catch {
    /* gizli sekmede saklanamayabilir; oturum yine bellekte calisir */
  }
  yay();
}

export function oturumKapat() {
  onbellek = null;
  try {
    localStorage.removeItem(ANAHTAR);
  } catch {
    /* yok say */
  }
  yay();
}

// Baska bir sekmede giris/cikis yapilirsa bu sekme de guncellensin
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === ANAHTAR) {
      onbellek = undefined;
      yay();
    }
  });
}

export function useOturum(): Oturum | null {
  return useSyncExternalStore(
    (d) => {
      dinleyiciler.add(d);
      return () => dinleyiciler.delete(d);
    },
    oturumOku,
    () => null,
  );
}

export const ROL_ADLARI: Record<Rol, string> = {
  ADMIN: "Yönetici",
  YONETIM: "Yönetim",
  KALITE: "Kalite",
  SEF: "Üretim şefi",
  DEPO: "Depo",
  OPERATOR: "Operatör",
  DENETCI: "Denetçi",
};

export const rolVar = (o: Oturum | null, ...roller: Rol[]) =>
  !!o && (o.kullanici.roller.includes("ADMIN") || o.kullanici.roller.some((r) => roller.includes(r)));
