// KYS modulleri (kalibrasyon, bakim, egitim, tedarikci, sikayet, DOF) ve KPI icin tipler + sorgular.
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Alet = {
  id: string; kod: string; ad: string; konum: string | null; periyotAy: number;
  sonKalibrasyon: string | null; sonrakiKalibrasyon: string | null; durum: "KULLANIMDA" | "KULLANIM_DISI";
  kalanGun: number | null; kalibrasyonDurumu: "GECERLI" | "YAKLASIYOR" | "GECMIS" | "KULLANIM_DISI"; olcumSayisi: number;
};
export type Kisi = { id: string; adSoyad: string; roller: string[] };

export type Bakim = {
  id: string; no: string; makineKod: string; makineAd: string; tur: "PLANLI" | "ARIZA"; tarih: string; ariza: string | null;
  yapilan: string; kullanilanParca: string | null; durusDk: number; kaydedenAd: string | null; zaman: string;
};
export type Egitim = {
  id: string; adSoyad: string; konu: string; tarih: string; egitmen: string | null; sureSaat: number | null; sonuc: string;
  gecerlilikBitis: string | null; gecerlilik: "GECERLI" | "SURESI_DOLDU" | "TEKRAR_GEREKLI"; kaydedenAd: string | null;
};
export type TedarikciDegerlendirme = {
  id: string; unvan: string; donem: string; lotSayisi: number; kabulLot: number; kalitePuani: number; teslimatPuani: number;
  belgePuani: number; toplamPuan: number; sonuc: string; aciklama: string | null; kaydedenAd: string | null; zaman: string;
};
export type Dof = {
  id: string; no: string; kaynak: string; kaynakNo: string | null; problem: string; kokNeden: string | null; faaliyet: string | null;
  sorumlu: string; sorumluAd: string; termin: string; durum: "ACIK" | "UYGULAMADA" | "DOGRULAMA_BEKLIYOR" | "KAPANDI";
  etkinlikNotu: string | null; olusturanAd: string | null; kapatanAd: string | null; kapanmaZamani: string | null; gecikti: boolean; olusturmaZamani: string;
};
export type Sikayet = {
  id: string; no: string; musteri: string; sevkiyatNo: string | null; lotNo: string | null; konu: string; aciklama: string | null;
  durum: "ACIK" | "INCELEMEDE" | "KAPANDI"; dofNo: string | null; dofDurum: string | null; iadeMiktari: number;
  kapanisNotu: string | null; olusturanAd: string | null; kapatanAd: string | null; olusturmaZamani: string; kapanmaZamani: string | null;
};
export type Gosterge = {
  ad: string; baslik: string; deger: number | null; hedef: number; yon: "yuksek" | "dusuk"; birim: string;
  formul: string; pay: number; payda: number; hedefte: boolean | null;
};
export type Kpi = {
  baslangic: string; bitis: string; gostergeler: Gosterge[];
  kullanilabilirlik: { gun: number; makineSayisi: number; gunlukPlanliDk: number; planliDk: number; planliDurusDk: number; plansizDurusDk: number; deger: number | null };
  uyarilar: Record<string, number>;
};

export const useAletler = () => useQuery({ queryKey: ["kys", "aletler"], queryFn: () => api<Alet[]>("/kys/aletler") });
export const useKysKisiler = () => useQuery({ queryKey: ["kys", "kullanicilar"], queryFn: () => api<Kisi[]>("/kys/kullanicilar") });

// Bugunun tarihi (YYYY-AA-GG, tarayicinin yerel saatine gore)
export function bugunStr(gunEkle = 0) {
  const t = new Date();
  t.setDate(t.getDate() + gunEkle);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
