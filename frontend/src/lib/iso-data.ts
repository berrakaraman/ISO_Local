// ISO form tanimlari (menu basliklari, form kodlari, liste sutunlari). Veriler backend'den gelir.
export type ColType =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "time"
  | "percent"
  | "select";
export type Column = {
  key: string;
  type?: ColType;
  options?: string[];
  mono?: boolean;
};
export type TableDef = {
  slug: string;
  code: string;
  title: string;
  description: string;
  columns: Column[];
};
export type Status = "Bekliyor" | "Askıda" | "Onaylandı" | "Reddedildi";
const lot: Column = { key: "Lot No", mono: true };
const urun: Column = { key: "Ürün Kodu", mono: true };

export const TABLES: TableDef[] = [
  {
    slug: "yonetim-paneli",
    code: "YP",
    title: "Üretim Özeti",
    description: "Üretim ve lot izlenebilirlik yönetim paneli: her üretim lotunun miktar dökümü.",
    columns: [
      { key: "Tarih", type: "date" },
      { key: "Makine", mono: true },
      lot,
      urun,
      { key: "Üretim Miktarı", type: "number" },
      { key: "Uygun", type: "number" },
      { key: "Karantina", type: "number" },
      { key: "Red/Hurda", type: "number" },
      { key: "Fire %", type: "percent" },
      { key: "Durum" },
    ],
  },
  {
    slug: "hammadde",
    code: "F-01",
    title: "Hammadde Giriş",
    description: "Mal kabul ve giriş kontrolü. Her ambalaja barkodlu etiket basılır.",
    columns: [
      { key: "Giriş Tarihi", type: "date" },
      { key: "Lot No", mono: true },
      { key: "Hammadde Kodu", mono: true },
      { key: "Hammadde Adı" },
      { key: "Tedarikçi" },
      { key: "Tedarikçi Lot No", mono: true },
      { key: "Ambalaj", type: "number" },
      { key: "Giriş Miktarı", type: "number" },
      { key: "Kalan Miktar", type: "number" },
      { key: "Birim" },
      { key: "Depo Yeri", mono: true },
      { key: "Giriş Kontrolü" },
    ],
  },
  {
    slug: "uretim-emri",
    code: "F-02",
    title: "Üretim Emri",
    description: "Şefin açtığı iş emirleri. Onaylanan iş emri üretime alınır; hammadde okutma, ilk parça, karantina ve top bitirme buradan yapılır.",
    columns: [
      { key: "Üretim Emri No", mono: true },
      { key: "Sipariş No", mono: true },
      { key: "Müşteri/Proje" },
      { key: "Ürün Kodu", mono: true },
      { key: "Ürün Adı" },
      { key: "Planlanan Miktar", type: "number" },
      { key: "Üretilen", type: "number" },
      { key: "Karantina", type: "number" },
      { key: "Birim" },
      { key: "Planlanan Makine", mono: true },
      { key: "Planlanan Tarih", type: "date" },
      { key: "Durum" },
    ],
  },
  {
    slug: "uretim-lot",
    code: "F-03",
    title: "Üretim Lot",
    description: "Her top bir üretim lotudur. Kesim (metraj), şahit numune ve son kontrol buradan yapılır.",
    columns: [
      { key: "Tarih", type: "date" },
      { key: "Üretim Emri No", mono: true },
      lot,
      urun,
      { key: "Makine", mono: true },
      { key: "Operatör" },
      { key: "Vardiya" },
      { key: "Başlangıç", type: "time" },
      { key: "Bitiş", type: "time" },
      { key: "Hammadde Lot No", mono: true },
      { key: "Toplam Üretim", type: "number" },
      { key: "Uygun Miktar", type: "number" },
      { key: "Karantina", type: "number" },
      { key: "Red/Hurda", type: "number" },
      { key: "Fire %", type: "percent" },
      { key: "Lot Durumu" },
    ],
  },
  {
    slug: "karantina-red",
    code: "F-04",
    title: "Karantina / Red",
    description: "Üretimde ayrılan, karantina etiketi basılan parçalar ve kalitenin kararları.",
    columns: [
      { key: "Kayıt Tarihi", type: "date" },
      urun,
      lot,
      { key: "Makine", mono: true },
      { key: "Sepet/Ayrım" },
      { key: "Hata Kodu", mono: true },
      { key: "Hata Açıklaması" },
      { key: "Miktar", type: "number" },
      { key: "Birim" },
      { key: "Karar" },
      { key: "Karar Veren" },
      { key: "Karar Tarihi", type: "date" },
      { key: "Etiket No", mono: true },
      { key: "Yeni Etiket No", mono: true },
    ],
  },
  {
    slug: "kalite-kontrol",
    code: "F-05",
    title: "Kalite Kontrol",
    description: "İlk parça, metraj (proses) ölçümleri ve son kontrol kararları. Bloke işlemleri de buradan yapılır.",
    columns: [
      { key: "Tarih/Saat", type: "datetime" },
      urun,
      lot,
      { key: "Makine", mono: true },
      { key: "Kontrol Türü" },
      { key: "Kontrol Parametresi" },
      { key: "Spesifikasyon" },
      { key: "Ölçülen Değer/Sonuç" },
      { key: "Karar" },
      { key: "Kontrol Eden" },
      { key: "Açıklama" },
    ],
  },
  {
    slug: "sevkiyat",
    code: "F-06",
    title: "Sevkiyat",
    description: "Sevkiyata her parça barkoduyla okutularak eklenir. Onaylanan sevkiyat irsaliyeyle sevk edilir.",
    columns: [
      { key: "Sevk Tarihi", type: "date" },
      { key: "Sevk No", mono: true },
      { key: "Müşteri" },
      urun,
      lot,
      { key: "Sevk Miktarı", type: "number" },
      { key: "Birim" },
      { key: "İrsaliye No", mono: true },
      { key: "Paket/Etiket Kontrolü" },
      { key: "Hazırlayan" },
      { key: "Onaylayan" },
      { key: "Durum" },
    ],
  },
];
export const getTable = (slug: string) => TABLES.find((t) => t.slug === slug);
