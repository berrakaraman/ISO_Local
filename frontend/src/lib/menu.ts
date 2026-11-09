// Rol bazli menu: herkes yalnizca kendi isini gorur. Yonetim ve denetci her sayfayi gorur (denetci salt okunur),
// ADMIN her seyi gorur. Sayfadaki dugmeler ayrica rol kontrolludur; backend de her istegi rolle denetler.
import type { Rol } from "./oturum";

const HEPSI: Rol[] = ["ADMIN", "YONETIM", "KALITE", "SEF", "DEPO", "OPERATOR", "DENETCI"];
const yonetici: Rol[] = ["YONETIM", "DENETCI"];

// yol -> bu sayfayi menude gorecek roller
export const SAYFA_ROLLERI: Record<string, Rol[]> = {
  "/panel": HEPSI,
  "/izle": HEPSI,
  "/makineler": [...yonetici, "SEF", "KALITE"],
  "/kpi": [...yonetici, "SEF", "KALITE"],
  "/tablo/yonetim-paneli": [...yonetici, "SEF", "KALITE"],
  "/tablo/hammadde": [...yonetici, "DEPO", "KALITE", "SEF"],
  "/tablo/uretim-emri": [...yonetici, "SEF", "OPERATOR", "KALITE"],
  "/tablo/uretim-lot": [...yonetici, "SEF", "OPERATOR", "KALITE"],
  "/tablo/karantina-red": [...yonetici, "SEF", "OPERATOR", "KALITE"],
  "/tablo/kalite-kontrol": [...yonetici, "KALITE"],
  "/tablo/sevkiyat": [...yonetici, "DEPO", "SEF", "KALITE"],
  "/depo": [...yonetici, "DEPO", "OPERATOR", "SEF", "KALITE"],
  "/geri-cagirma": [...yonetici, "KALITE"],
  "/kys": [...yonetici, "KALITE", "SEF"],
  "/surec": HEPSI,
  "/tablo/tanimlar": [...yonetici, "KALITE", "SEF"],
};

export function sayfaGorur(roller: Rol[], yol: string) {
  if (roller.includes("ADMIN")) return true;
  // en uzun eslesen yol (ornek: /izle/FG-... -> /izle)
  const anahtar = Object.keys(SAYFA_ROLLERI)
    .filter((k) => yol === k || yol.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!anahtar) return true;
  return SAYFA_ROLLERI[anahtar].some((r) => roller.includes(r));
}
