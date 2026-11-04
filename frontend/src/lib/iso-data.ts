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
export const STATUSES: Status[] = [
  "Bekliyor",
  "Askıda",
  "Onaylandı",
  "Reddedildi",
];

export type Row = {
  id: string;
  data: Record<string, string | number>;
  assignee: string;
  status: Status;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
};
export type User = {
  id: string;
  name: string;
  username: string;
  password: string;
  role: string;
  admin?: boolean;
};

// Kisiler artik sistemden (backend kullanici tablosu) gelir; sahte kullanici listesi kaldirildi.
// Henuz backend'e baglanmamis formlarin ornek satirlarinda "Sorumlu" kisi adi olarak tutulur.
// Eski kayitlardaki kodlar (u1..u4) sistemdeki ayni kisilere karsilik gelir.
export const ESKI_KISI: Record<string, string> = {
  u1: "Berra Karaman",
  u2: "Ahmet Yılmaz",
  u3: "Mehmet Demir",
  u4: "Ayşe Kaya",
};
export const kisiAdi = (a?: string) => (a ? (ESKI_KISI[a] ?? a) : "—");

export const MACHINES = [
  "Ö01",
  "Ö02",
  "Ö03",
  "Ö04",
  "Ö05",
  "Ö06",
  "Ö07",
  "Ö08",
  "Ö09",
  "Ö10",
  "E01",
  "E02",
];
export const DEFECTS = [
  "H-01 Ölçü uygunsuz",
  "H-02 Çap uygunsuz",
  "H-03 Renk uygunsuz",
  "H-04 Örgü sıklığı uygunsuz",
  "H-05 Kopukluk",
  "H-06 Yüzey hatası",
  "H-07 Hammadde kaynaklı",
  "H-08 Makine kaynaklı",
  "H-09 İşçilik kaynaklı",
  "H-10 Diğer",
];
export const DECISIONS = [
  "Planlandı",
  "Üretimde",
  "Kapatıldı",
  "Karantina",
  "Kabul",
  "Yeniden işleme",
  "Red/Hurda",
];
export const UNITS = ["m", "kg", "adet", "rulo"];

const m: Column = { key: "Makine", type: "select", options: MACHINES };
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

let idCounter = Date.now();
const mk = (data: Row["data"], assignee: string, status: Status): Row => ({
  id: `r${idCounter++}`,
  data,
  assignee,
  status,
  createdBy: "u1",
  createdAt: new Date().toISOString(),
});

// EKSİK OLAN SEED VERİLERİ (Hata buradan kaynaklanıyordu)
export const SEED: Record<string, Row[]> = {
  "yonetim-paneli": [
    mk(
      {
        Tarih: "2026-09-25",
        Makine: "Ö01",
        "Lot No": "260925-Ö01-001",
        "Ürün Kodu": "KTS-PA-010",
        "Üretim Miktarı": 1100,
        Uygun: 1060,
        Karantina: 20,
        "Red/Hurda": 20,
        "Fire %": 0.036,
        Durum: "Açık",
      },
      "u1",
      "Bekliyor",
    ),
    mk(
      {
        Tarih: "2026-09-25",
        Makine: "Ö02",
        "Lot No": "260925-Ö02-001",
        "Ürün Kodu": "KTS-PA-010",
        "Üretim Miktarı": 1250,
        Uygun: 1220,
        Karantina: 20,
        "Red/Hurda": 10,
        "Fire %": 0.024,
        Durum: "Açık",
      },
      "u3",
      "Askıda",
    ),
    mk(
      {
        Tarih: "2026-09-25",
        Makine: "Ö03",
        "Lot No": "260925-Ö03-002",
        "Ürün Kodu": "KTS-PA-010",
        "Üretim Miktarı": 1250,
        Uygun: 1180,
        Karantina: 40,
        "Red/Hurda": 30,
        "Fire %": 0.056,
        Durum: "Kapatıldı",
      },
      "u1",
      "Onaylandı",
    ),
  ],
  hammadde: [
    mk(
      {
        "Giriş Tarihi": "2026-09-25",
        "Hammadde Kodu": "PA66-01",
        "Hammadde Adı": "PA66",
        "Giriş Miktarı": 500,
        "Depo Yeri": "H-03",
      },
      "u1",
      "Onaylandı",
    ),
  ],
  "uretim-emri": [
    mk(
      {
        "Üretim Emri No": "ÜE-260925-015",
        "Sipariş No": "S-4587",
        "Müşteri/Proje": "ABC Otomotiv",
        "Ürün Kodu": "KTS-PA-010",
        "Ürün Adı": "Kablo Toplama Çorabı",
        "Planlanan Miktar": 1250,
        Birim: "m",
        "Planlanan Makine": "Ö03",
        "Planlanan Tarih": "2026-09-25",
        Durum: "Planlandı",
      },
      "u3",
      "Onaylandı",
    ),
  ],
  "uretim-lot": [
    mk(
      {
        Tarih: "2026-09-25",
        "Üretim Emri No": "ÜE-260925-015",
        "Lot No": "260925-Ö03-002",
        "Ürün Kodu": "KTS-PA-010",
        Makine: "Ö03",
        Operatör: "Ahmet",
        Vardiya: "Gündüz",
        Başlangıç: "08:15",
        Bitiş: "16:40",
        "Hammadde Lot No": "PA66-260920-08",
        "Toplam Üretim": 1250,
        "Uygun Miktar": 1180,
        Karantina: 40,
        "Red/Hurda": 30,
        "Fire %": 0.056,
        "Lot Durumu": "Kapatıldı",
      },
      "u2",
      "Onaylandı",
    ),
  ],
  "karantina-red": [
    mk(
      {
        "Kayıt Tarihi": "2026-09-25",
        "Ürün Kodu": "KTS-PA-010",
        "Lot No": "260925-Ö03-002",
        Makine: "Ö03",
        "Sepet/Ayrım": "Sarı sepet",
        "Hata Kodu": "H-04",
        "Hata Açıklaması": "Örgü sıklığı uygunsuz",
        Miktar: 40,
        Birim: "m",
        Karar: "Yeniden işleme",
        "Karar Veren": "Kalite Sorumlusu",
        "Karar Tarihi": "",
        "Etiket No": "KAR-260925-001",
      },
      "u1",
      "Bekliyor",
    ),
  ],
  "kalite-kontrol": [
    mk(
      {
        "Tarih/Saat": "2026-09-25T08:30",
        "Ürün Kodu": "KTS-PA-010",
        "Lot No": "260925-Ö03-002",
        Makine: "Ö03",
        "Kontrol Türü": "İlk parça",
        "Kontrol Parametresi": "Örgü sıklığı",
        Spesifikasyon: "Onaylı ürün spesifikasyonu",
        "Ölçülen Değer/Sonuç": "Uygun",
        Karar: "Uygun",
        "Kontrol Eden": "Kalite Kontrol",
        Açıklama: "Örnek kayıt",
      },
      "u1",
      "Onaylandı",
    ),
  ],
  sevkiyat: [
    mk(
      {
        "Sevk Tarihi": "2026-09-26",
        "Sevk No": "SV-260926-024",
        Müşteri: "ABC Otomotiv",
        "Ürün Kodu": "KTS-PA-010",
        "Lot No": "260925-Ö03-002",
        "Sevk Miktarı": 1180,
        Birim: "m",
        "İrsaliye No": "İRS-00024",
        "Paket/Etiket Kontrolü": "Uygun",
        Hazırlayan: "Depo",
        Onaylayan: "Kalite",
      },
      "u4",
      "Bekliyor",
    ),
  ],
};
