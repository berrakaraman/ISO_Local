// Backend kodlarinin ekranda gorunen Turkce karsiliklari (durumlar, birim tipleri, olaylar)

export type Renk = "yesil" | "turuncu" | "kirmizi" | "gri";

export const BIRIM_TIPI: Record<string, { ad: string; cogul: string; kisa: string }> = {
  RM: { ad: "Hammadde ambalajı", cogul: "Hammadde", kisa: "Hammadde" },
  WIP: { ad: "Yarı mamul", cogul: "Yarı mamul", kisa: "Yarı mamul" },
  FG_LOT: { ad: "Üretim lotu (top)", cogul: "Üretim lotları", kisa: "Top" },
  FG: { ad: "Mamul (makara / paket)", cogul: "Makaralar", kisa: "Makara" },
  KR: { ad: "Karantina parçası", cogul: "Karantina", kisa: "Karantina" },
  NM: { ad: "Numune", cogul: "Numune", kisa: "Numune" },
  IS_EMRI: { ad: "İş emri", cogul: "İş emirleri", kisa: "İş emri" },
  SEVKIYAT: { ad: "Sevkiyat", cogul: "Sevkiyatlar", kisa: "Sevkiyat" },
};

export const DURUM: Record<string, string> = {
  KONTROL_BEKLIYOR: "Giriş kontrolü bekliyor",
  KABUL: "Kabul edildi",
  KARANTINA: "Karantinada",
  RET: "Reddedildi",
  TUKENDI: "Tamamı kullanıldı",
  KESIM_BEKLIYOR: "Kesim bekliyor",
  KESILDI: "Kesildi",
  KALITE_BEKLIYOR: "Kalite onayı bekliyor",
  SERBEST: "Serbest (kullanılabilir)",
  DEPODA: "Depoda",
  SIPARISE_AYRILDI: "Siparişe ayrıldı",
  SEVK_EDILDI: "Sevk edildi",
  BOLUNDU: "Bölündü",
  KARAR_BEKLIYOR: "Karar bekliyor",
  OLUMLU: "Olumlu (kullanılabilir)",
  YENIDEN_ISLEME: "Yeniden işlemede",
  HURDA: "Hurda",
  SARTLI_KABUL: "Şartlı kabul",
  ARSIVDE: "Numune arşivinde",
  IMHA_EDILDI: "İmha edildi",
  IPTAL: "İptal edildi",
  PLANLANDI: "Planlandı",
  ILK_PARCA_BEKLIYOR: "İlk parça onayı bekliyor",
  URETIMDE: "Üretimde",
  DURAKLATILDI: "Duraklatıldı",
  TAMAMLANDI: "Tamamlandı",
  TAMAMLANDI_FARK: "Tamamlandı (fark açıklaması bekliyor)",
  HAZIRLANIYOR: "Hazırlanıyor",
};
export const durumAdi = (d?: string | null) => (d ? DURUM[d] || d : "");

// Olay tipleri: ekranda gorunen ad + kategori (renk ve ikon icin)
export type OlayKategori = "giris" | "kalite" | "uretim" | "karantina" | "depo" | "sevk" | "uyari" | "diger";
export const OLAY: Record<string, { ad: string; kategori: OlayKategori }> = {
  KABUL: { ad: "Mal kabul", kategori: "giris" },
  KONTROL_KARARI: { ad: "Giriş kontrolü", kategori: "kalite" },
  YERLESTIRME: { ad: "Rafa yerleştirildi", kategori: "depo" },
  CEKIS: { ad: "Depodan hatta çekildi", kategori: "depo" },
  BOLME: { ad: "Ambalaj bölündü", kategori: "depo" },
  YUKLEME: { ad: "Makineye yüklendi", kategori: "uretim" },
  TUKETIM: { ad: "Üretimde tüketildi", kategori: "uretim" },
  IADE: { ad: "Artan depoya iade edildi", kategori: "depo" },
  IS_EMRI_ACILDI: { ad: "İş emri açıldı", kategori: "uretim" },
  IS_EMRI_BASLADI: { ad: "Üretim başladı", kategori: "uretim" },
  IS_EMRI_DURUM: { ad: "İş emri durumu değişti", kategori: "uretim" },
  ILK_PARCA: { ad: "İlk parça kontrolü", kategori: "kalite" },
  URETIM: { ad: "Üretildi", kategori: "uretim" },
  KARANTINAYA_AYIRMA: { ad: "Karantinaya ayrıldı", kategori: "karantina" },
  KARANTINA_KARARI: { ad: "Karantina kararı", kategori: "karantina" },
  KESIM: { ad: "Metraj / kesim", kategori: "uretim" },
  SON_KONTROL: { ad: "Son kontrol", kategori: "kalite" },
  NUMUNE: { ad: "Numune alındı", kategori: "kalite" },
  HURDA: { ad: "Hurda / fire", kategori: "uyari" },
  YENIDEN_ETIKET: { ad: "Yeni barkodla etiketlendi", kategori: "karantina" },
  ETIKET_BASKISI: { ad: "Etiket yeniden basıldı", kategori: "diger" },
  BLOKE: { ad: "Bloke edildi", kategori: "uyari" },
  BLOKE_KALDIRMA: { ad: "Bloke kaldırıldı", kategori: "kalite" },
  SIPARISE_AYIRMA: { ad: "Siparişe ayrıldı", kategori: "sevk" },
  SEVKIYAT: { ad: "Müşteriye sevk edildi", kategori: "sevk" },
  MUSTERI_IADESI: { ad: "Müşteri iadesi", kategori: "uyari" },
  DUZELTME: { ad: "Düzeltme kaydı", kategori: "diger" },
  IPTAL: { ad: "Kayıt iptal edildi", kategori: "uyari" },
};
export const olayAdi = (t: string) => OLAY[t]?.ad || t;

// Backend ASCII yazdigi icin sik gecen kelimeleri duzgun Turkceye cevirir (yalnizca gorunum)
const KELIMELER: [RegExp, string][] = [
  [/\bIlk parca\b/g, "İlk parça"],
  [/\buygun degil\b/g, "uygun değil"],
  [/\bonaylandi\b/g, "onaylandı"],
  [/\bparca\b/g, "parça"],
  [/\bKesim firesi\b/g, "Kesim firesi"],
  [/\bdepo\b/g, "depo"],
  [/\bOrgu\b/g, "Örgü"],
  [/\bsikligi\b/g, "sıklığı"],
  [/\bduzeltilemez\b/g, "düzeltilemez"],
  [/\bkopmasi\b/g, "kopması"],
  [/\bMusteri\b/g, "Müşteri"],
  [/\bsikayeti\b/g, "şikâyeti"],
  [/\bincelemesi\b/g, "incelemesi"],
  [/\bInceleme\b/g, "İnceleme"],
  [/\btamamlandi\b/g, "tamamlandı"],
  [/\bcorabi\b/g, "çorabı"],
  [/\bOrnek\b/g, "Örnek"],
  [/\bOperator\b/g, "Operatör"],
  [/\bUretim\b/g, "Üretim"],
  [/\bSefi\b/g, "Şefi"],
  [/\bYoneticisi\b/g, "Yöneticisi"],
  [/\bmakinesi\b/g, "makinesi"],
  [/\bkaynakli\b/g, "kaynaklı"],
  [/\bHammadde kaynakli\b/g, "Hammadde kaynaklı"],
  [/\bOlcu\b/g, "Ölçü"],
  [/\bdisi\b/g, "dışı"],
  [/\bLeke\b/g, "Leke"],
  [/\bcap\b/g, "çap"],
  [/\bDis\b/g, "Dış"],
  [/\bAmbalaj\b/g, "Ambalaj"],
  [/\bhasari\b/g, "hasarı"],
  [/\bSistem Yoneticisi\b/g, "Sistem Yöneticisi"],
  [/\bCap\b/g, "Çap"],
  [/\bYuzey hatasi\b/g, "Yüzey hatası"],
  [/\bOlcu uygunsuz\b/g, "Ölçü uygunsuz"],
  [/\bDis Denetci\b/g, "Dış Denetçi"],
  [/\bEsya\b/g, "Eşya"],
  [/\bA\.S\./g, "A.Ş."],
  [/\bMasura sarim\b/g, "Masura sarım"],
  [/\bEkstruder\b/g, "Ekstrüder"],
  [/ -> /g, " → "],
];
export function tr(s?: string | null): string {
  if (!s) return "";
  let x = s;
  for (const [r, y] of KELIMELER) x = x.replace(r, y);
  return x;
}

export function sayi(n?: number | null, ondalik = 2) {
  if (n === null || n === undefined) return "–";
  return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: ondalik });
}

export function tarihSaat(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function saat(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
export function gun(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
