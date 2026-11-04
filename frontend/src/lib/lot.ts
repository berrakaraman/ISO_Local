// Uretim lotu (F-03) ve uretim ozeti (YP) icin ortak tip ve hesaplar.

export type LotSatiri = {
  id: string; no: string; durum: string; olusturmaZamani: string;
  urunKod: string; urunAd: string; olcuBirimi: string; isEmriNo: string | null; makineKod: string | null;
  operatorAd: string | null; operatorSicil: string | null;
  topBarkod: string; topMetraji: number; topDurum: string; topBloke: boolean; baslangic: string | null; bitis: string;
  uygun: number; kaliteBekleyen: number; ret: number; parcaSayisi: number; blokeParca: number;
  karantina: number; karantinaBekleyen: number; karantinaHurda: number; kesimFiresi: number;
  hammaddeLotlari: string | null; numuneBarkod: string | null;
};

// Formdaki hesaplar (YP ile ayni)
export function lotHesap(l: LotSatiri) {
  const toplam = Number(l.topMetraji) + Number(l.karantina);
  const redHurda = Number(l.karantinaHurda) + Number(l.ret) + Number(l.kesimFiresi);
  const fire = toplam > 0 ? (Number(l.karantinaBekleyen) + redHurda) / toplam : 0;
  let durum = "Kapatıldı";
  let renk: "yesil" | "turuncu" | "kirmizi" | "gri" = "yesil";
  if (l.topDurum === "KESIM_BEKLIYOR") [durum, renk] = ["Kesim bekliyor", "gri"];
  else if (l.topDurum === "KARANTINA") [durum, renk] = ["Top karantinada", "kirmizi"];
  else if (l.kaliteBekleyen > 0) [durum, renk] = ["Son kontrol bekliyor", "turuncu"];
  else if (l.karantinaBekleyen > 0) [durum, renk] = ["Karantina kararı bekliyor", "turuncu"];
  else if (l.blokeParca > 0 || l.topBloke) [durum, renk] = ["Bloke var", "kirmizi"];
  return { toplam, redHurda, fire, durum, renk, acik: durum !== "Kapatıldı" };
}

export const vardiya = (s?: string | null) => {
  if (!s) return "—";
  const h = new Date(s).getHours();
  return h >= 8 && h < 16 ? "Gündüz" : h >= 16 ? "Akşam" : "Gece";
};

