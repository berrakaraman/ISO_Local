// Form onay akisi: durum adlari, kayit turleri ve ortak sorgular.
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type OnayDurum = "BEKLIYOR" | "ASKIDA" | "ONAYLANDI" | "REDDEDILDI";
export type OnayTuru = "HAMMADDE" | "IS_EMRI" | "URETIM_LOT" | "KARANTINA" | "KALITE" | "SEVKIYAT" | "URETIM_OZETI";

// Satirda gosterilen onay ozeti
export type OnayOzet = {
  id: string;
  durum: OnayDurum;
  atananId: string;
  atananAd: string | null;
  kararVerenAd?: string | null;
  kararZamani?: string | null;
  kararNotu?: string | null;
};

// /api/onaylar cevabi
export type Onay = {
  id: string;
  kayitTuru: OnayTuru;
  kayitNo: string;
  atanan: string;
  atananAd: string | null;
  durum: OnayDurum;
  kararVerenAd: string | null;
  kararZamani: string | null;
  kararNotu: string | null;
  olusturanAd: string | null;
  olusturmaZamani: string;
};

export type Kisi = { id: string; adSoyad: string; roller: string[] };

// Kullanicinin formlarindaki adlarla ayni
export const ONAY_ADI: Record<OnayDurum, string> = {
  BEKLIYOR: "Bekliyor",
  ASKIDA: "Askıda",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
};

// Kayit turu -> form (menudeki kod ve sayfa)
export const ONAY_FORMU: Record<OnayTuru, { kod: string; ad: string; slug: string }> = {
  HAMMADDE: { kod: "F-01", ad: "Hammadde Giriş", slug: "hammadde" },
  IS_EMRI: { kod: "F-02", ad: "Üretim Emri", slug: "uretim-emri" },
  URETIM_LOT: { kod: "F-03", ad: "Üretim Lot", slug: "uretim-lot" },
  KARANTINA: { kod: "F-04", ad: "Karantina / Red", slug: "karantina-red" },
  KALITE: { kod: "F-05", ad: "Kalite Kontrol", slug: "kalite-kontrol" },
  SEVKIYAT: { kod: "F-06", ad: "Sevkiyat", slug: "sevkiyat" },
  URETIM_OZETI: { kod: "YP", ad: "Üretim Özeti", slug: "yonetim-paneli" },
};

// Hammaddede onay karari giris kontrolunu de uygular; dugmelerde bunu da yaziyoruz
export const KARAR_ACIKLAMASI: Partial<Record<OnayTuru, Partial<Record<OnayDurum, string>>>> = {
  HAMMADDE: { ONAYLANDI: "Kabul: üretimde kullanılabilir", ASKIDA: "Karantinaya alınır, kullanılamaz", REDDEDILDI: "Ret: tedarikçiye iade" },
};

// Bu tur kaydi kimler onaylayabilir (backend'deki ONAYLAYABILIR ile ayni)
export const ONAYLAYAN_ROL: Partial<Record<OnayTuru, string>> = {
  HAMMADDE: "KALITE",
  KARANTINA: "KALITE",
  KALITE: "KALITE",
};

export function useKisiler(rol?: string) {
  return useQuery({
    queryKey: ["onaylar", "kisiler", rol || "hepsi"],
    queryFn: () => api<Kisi[]>(`/onaylar/kisiler${rol ? `?rol=${rol}` : ""}`),
    staleTime: 60_000,
  });
}
