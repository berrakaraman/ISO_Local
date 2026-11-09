// Uretim lotu (F-03) ve uretim ozeti (YP) icin ortak tip ve hesaplar.

export type LotSatiri = {
  id: string; no: string; durum: string; olusturmaZamani: string;
  urunKod: string; urunAd: string; olcuBirimi: string; isEmriNo: string | null; makineKod: string | null;
  operatorAd: string | null; operatorSicil: string | null;
  topBarkod: string; topMetraji: number; topDurum: string; topBloke: boolean; baslangic: string | null; bitis: string;
  kesilmemis: number; uygun: number; sevkEdilen: number; kaliteBekleyen: number; fgKarantina: number; ret: number; parcaSayisi: number; blokeParca: number;
  karantina: number; karantinaBekleyen: number; karantinaOlumlu: number; karantinaHurda: number; kesimFiresi: number; topHurda: number;
  olcumFazlasi: number; numune: number; hammaddeLotlari: string | null; numuneBarkod: string | null;
  // Backend'in hesapladigi miktar dengesi (services/denge.js)
  toplam: number; hurdaToplam: number; fireYuzde: number;
  denge: {
    toplam: number; olcumFazlasi: number; dagilimToplam: number; hurdaToplam: number; fireYuzde: number; fark: number; tutuyor: boolean;
    dagilim: { kesilmemis: number; numune: number; uygun: number; kaliteBekleyen: number; parcaKarantinada: number; karantinaBekleyen: number; hurda: number };
  };
};

// Formdaki hesaplar (YP ile ayni). Rakamlar backend'in lot dengesinden gelir:
// Toplam = top metraji + karantinaya ayrilan; Red/Hurda = tum hurda (kesim firesi, red, karantina hurdasi, top hurdasi);
// Fire = yalnizca hurda / toplam (karar bekleyen karantina fire sayilmaz).
export function lotHesap(l: LotSatiri) {
  const toplam = Number(l.toplam ?? Number(l.topMetraji) + Number(l.karantina));
  const redHurda = Number(l.hurdaToplam ?? Number(l.karantinaHurda) + Number(l.ret) + Number(l.kesimFiresi));
  const karantinada = Number(l.karantinaBekleyen) + Number(l.fgKarantina || 0);
  const fire = toplam > 0 ? redHurda / toplam : 0;
  let durum = "Kapatıldı";
  let renk: "yesil" | "turuncu" | "kirmizi" | "gri" = "yesil";
  if (l.denge && !l.denge.tutuyor) [durum, renk] = [`Miktar farkı ${l.denge.fark} ${l.olcuBirimi}`, "kirmizi"];
  else if (l.topDurum === "KESIM_BEKLIYOR" && !l.numuneBarkod) [durum, renk] = ["Numune bekliyor", "gri"];
  else if (l.topDurum === "KESIM_BEKLIYOR") [durum, renk] = ["Kesim bekliyor", "gri"];
  else if (l.topDurum === "KARANTINA") [durum, renk] = ["Top karantinada", "kirmizi"];
  else if (l.kaliteBekleyen > 0) [durum, renk] = ["Son kontrol bekliyor", "turuncu"];
  else if (Number(l.fgKarantina || 0) > 0) [durum, renk] = ["Parça karantinada", "turuncu"];
  else if (l.karantinaBekleyen > 0) [durum, renk] = ["Karantina kararı bekliyor", "turuncu"];
  else if (l.blokeParca > 0 || l.topBloke) [durum, renk] = ["Bloke var", "kirmizi"];
  else if (l.topDurum === "HURDA") return { toplam, redHurda, karantinada, fire, durum: "Top hurdaya ayrıldı", renk: "kirmizi" as const, acik: false };
  return { toplam, redHurda, karantinada, fire, durum, renk, acik: durum !== "Kapatıldı" };
}

export const vardiya = (s?: string | null) => {
  if (!s) return "—";
  const h = new Date(s).getHours();
  return h >= 8 && h < 16 ? "Gündüz" : h >= 16 ? "Akşam" : "Gece";
};

