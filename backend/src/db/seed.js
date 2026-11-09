// Ornek veri (yalnizca yerel gelistirme ve demo icin).
//   npm run db:seed
// Isimler ve kodlar ORNEKTIR; gercek degerler Tanimlar ekranindan girilir.
const bcrypt = require("bcryptjs");
const { pool, tx } = require("../config/db");

const FIRMA_KOD = "ORNEK";

// Ornek kisiler. Herkes kullanici adi + sifre ile girer (frontend giris ekranindaki
// "Gelistirme hesaplari" dugmeleri bu listeyle aynidir).
// Sicil + PIN yalnizca ileride makine basi ekrani (kiosk) icin saklanir.
const KULLANICILAR = [
  { kullaniciAdi: "berra", adSoyad: "Berra Karaman", sifre: "Berra.1234", sicil: "1001", pin: "1111", roller: ["ADMIN", "YONETIM", "KALITE"] },
  { kullaniciAdi: "mehmet", adSoyad: "Mehmet Demir", sifre: "Mehmet.1234", sicil: "1002", pin: "2222", roller: ["SEF"] },
  { kullaniciAdi: "ayse", adSoyad: "Ayşe Kaya", sifre: "Ayse.1234", sicil: "1003", pin: "3333", roller: ["DEPO"] },
  { kullaniciAdi: "ahmet", adSoyad: "Ahmet Yılmaz", sifre: "Ahmet.1234", sicil: "1215", pin: "1234", roller: ["OPERATOR"] },
  { kullaniciAdi: "denetci", adSoyad: "Dış Denetçi", sifre: "Denetci.1234", roller: ["DENETCI"] },
];

async function main() {
  await tx(async (c) => {
    const var_ = await c.query("SELECT id FROM firma WHERE kod = $1", [FIRMA_KOD]);
    if (var_.rows.length) {
      console.log(`'${FIRMA_KOD}' firmasi zaten var, seed atlandi. Sifirlamak icin: npm run db:reset`);
      return;
    }

    const firma = (
      await c.query(
        `INSERT INTO firma (kod, unvan, ayarlar) VALUES ($1, $2, $3) RETURNING id`,
        [
          FIRMA_KOD,
          "UNELSİS Kablo ve Spiral Sistemleri",
          {
            dengeToleransiYuzde: 3, // is emri miktar dengesi (bolum 11)
            kesimToleransiYuzde: 1, // kesim toplam kontrolu (bolum 8.3)
            numuneSaklamaYil: 3, // sahit numune (bolum 9.2)
            ilkParcaOperatorOnaylayabilir: false, // bolum 7.2
            isEmriOnayZorunlu: true, // onaylanmamis is emri baslatilamaz
            sevkiyatOnayZorunlu: true, // onaylanmamis sevkiyat sevk edilemez
            numuneZorunlu: true, // sahit numune alinmadan top kesilemez
            prosesOlcumAraligiDk: 120, // periyodik proses olcumu en gec bu kadar dakikada bir
            olcumAletiZorunlu: false, // true: her olcumde kalibrasyonu gecerli alet secilmeli
            vardiyalar: [
              { ad: "1. vardiya", bas: "08:00", bit: "16:00" },
              { ad: "2. vardiya", bas: "16:00", bit: "24:00" },
              { ad: "3. vardiya", bas: "00:00", bit: "08:00" },
            ],
            kpiHedefleri: { ilkParcaIlkSeferde: 95, fireOrani: 2, karantinaOrani: 3, zamanindaTamamlama: 95, musteriIadePpm: 500, kullanilabilirlik: 85 },
          },
        ],
      )
    ).rows[0];
    const F = firma.id;

    for (const k of KULLANICILAR) {
      await c.query(
        `INSERT INTO kullanici (firma_id, kullanici_adi, ad_soyad, sicil_no, sifre_ozeti, pin_ozeti, roller)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [F, k.kullaniciAdi, k.adSoyad, k.sicil || null,
          k.sifre ? await bcrypt.hash(k.sifre, 10) : null,
          k.pin ? await bcrypt.hash(k.pin, 10) : null, k.roller],
      );
    }

    const ekle = async (sql, params) => (await c.query(sql, params)).rows[0];

    // Yerlesim plani: orgu salonu iki sira (OR01-OR08 ust, OR09-OR16 alt), ekstruder, masura ve metraj sagda
    const makineler = [];
    for (let i = 1; i <= 16; i++) {
      const kod = `OR${String(i).padStart(2, "0")}`;
      const sira = i <= 8 ? 0 : 1;
      const x = 6 + ((i - 1) % 8) * 9;
      makineler.push([kod, `Orgu makinesi ${i}`, "ORGU", x, sira ? 62 : 22]);
    }
    makineler.push(["MS01", "Masura sarim", "MASURA", 84, 22], ["EX01", "Ekstruder 1", "EKSTRUZYON", 84, 62], ["MT01", "Metraj ve kesim", "METRAJ", 94, 42]);
    for (const [kod, ad, tip, x, y] of makineler) {
      await c.query("INSERT INTO makine (firma_id, kod, ad, tip, plan_x, plan_y) VALUES ($1,$2,$3,$4,$5,$6)", [F, kod, ad, tip, x, y]);
    }

    const pet = await ekle("INSERT INTO malzeme (firma_id, kod, ad) VALUES ($1,'PET-025','PET monofilament 0,25 mm') RETURNING id", [F]);
    const pa6 = await ekle("INSERT INTO malzeme (firma_id, kod, ad) VALUES ($1,'PA6-GR','PA6 granul') RETURNING id", [F]);
    const mb = await ekle("INSERT INTO malzeme (firma_id, kod, ad) VALUES ($1,'MB-SYH','Siyah masterbatch') RETURNING id", [F]);

    for (const unvan of ["Teknofil Lif", "Anka Polimer", "Renkpol Kimya"]) {
      await c.query("INSERT INTO tedarikci (firma_id, unvan) VALUES ($1,$2)", [F, unvan]);
    }
    for (const unvan of ["Ege Beyaz Esya A.S.", "Siemens Sanayi ve Ticaret A.S.", "Ford Otosan", "Arcelik A.S."]) {
      await c.query("INSERT INTO musteri (firma_id, unvan) VALUES ($1,$2)", [F, unvan]);
    }

    const kts = await ekle(
      "INSERT INTO urun (firma_id, kod, ad, kesim_boyu, numune_boyu) VALUES ($1,'KTS-PET-010','Kablo toplama corabi 10 mm PET',100,1) RETURNING id",
      [F],
    );
    const ps = await ekle(
      "INSERT INTO urun (firma_id, kod, ad, kesim_boyu, numune_boyu) VALUES ($1,'PS-PA6-012','Polyamid spiral 12 mm',50,1) RETURNING id",
      [F],
    );

    await c.query("INSERT INTO recete (firma_id, urun_id, malzeme_id, gram_metre) VALUES ($1,$2,$3,80)", [F, kts.id, pet.id]);
    await c.query("INSERT INTO recete (firma_id, urun_id, malzeme_id, gram_metre) VALUES ($1,$2,$3,45)", [F, ps.id, pa6.id]);
    await c.query("INSERT INTO recete (firma_id, urun_id, malzeme_id, gram_metre) VALUES ($1,$2,$3,1)", [F, ps.id, mb.id]);

    const kar = (urun, asama, ad, nominal, alt, ust, birim, sira) =>
      c.query(
        `INSERT INTO karakteristik (firma_id, urun_id, asama, ad, nominal, alt_sinir, ust_sinir, olcu_birimi, sira)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [F, urun, asama, ad, nominal, alt, ust, birim, sira],
      );
    await kar(kts.id, "ILK_PARCA", "Dis cap", 10, 9.7, 10.3, "mm", 1);
    await kar(kts.id, "ILK_PARCA", "Orgu sikligi", 12, 11, 13, "tur/cm", 2);
    await kar(kts.id, "METRAJ", "Dis cap", 10, 9.7, 10.3, "mm", 1);
    await kar(ps.id, "ILK_PARCA", "Ic cap", 12, 11.8, 12.2, "mm", 1);
    await kar(ps.id, "ILK_PARCA", "Et kalinligi", 0.8, 0.7, 0.9, "mm", 2);
    await kar(ps.id, "METRAJ", "Ic cap", 12, 11.8, 12.2, "mm", 1);
    await kar(ps.id, "METRAJ", "Dis cap", 13.6, 13.3, 13.9, "mm", 2);
    // Periyodik proses kontrolu (uretim sirasinda, en gec prosesOlcumAraligiDk dakikada bir)
    await kar(kts.id, "PROSES", "Dis cap", 10, 9.7, 10.3, "mm", 1);
    await kar(kts.id, "PROSES", "Orgu sikligi", 12, 11, 13, "tur/cm", 2);
    await kar(ps.id, "PROSES", "Ic cap", 12, 11.8, 12.2, "mm", 1);

    for (const [kod, aciklama] of [
      ["H-01", "Olcu uygunsuz"],
      ["H-02", "Cap uygunsuz"],
      ["H-03", "Renk uygunsuz"],
      ["H-04", "Orgu sikligi uygunsuz"],
      ["H-05", "Tel kopmasi"],
      ["H-06", "Yuzey hatasi"],
      ["H-07", "Hammadde kaynakli"],
      ["H-08", "Makine kaynakli"],
    ]) {
      await c.query("INSERT INTO hata_kodu (firma_id, kod, aciklama) VALUES ($1,$2,$3)", [F, kod, aciklama]);
    }

    for (const [kod, ad, tip] of [
      ["YR-D1-R01", "Depo 1 Raf 1", "RAF"],
      ["YR-D1-R02", "Depo 1 Raf 2", "RAF"],
      ["YR-KAR", "Karantina alani", "KARANTINA"],
      ["YR-NUM-01", "Numune dolabi 1", "NUMUNE"],
    ]) {
      await c.query("INSERT INTO depo_yeri (firma_id, kod, ad, tip) VALUES ($1,$2,$3,$4)", [F, kod, ad, tip]);
    }

    // Olcum aletleri: kalibrasyonu gecerli iki alet, suresi gecmis bir alet (gostermek icin)
    const berra = (await c.query("SELECT id FROM kullanici WHERE firma_id = $1 AND kullanici_adi = 'berra'", [F])).rows[0].id;
    for (const [kod, ad, konum, periyot, ayOnce] of [
      ["KMP-01", "Dijital kumpas 0-150 mm", "Orgu salonu", 12, 2],
      ["MKR-01", "Mikrometre 0-25 mm", "Kalite laboratuvari", 12, 5],
      ["KMP-02", "Dijital kumpas 0-150 mm (yedek)", "Ekstruzyon", 6, 8],
    ]) {
      const a = await ekle(
        `INSERT INTO olcum_aleti (firma_id, kod, ad, konum, periyot_ay, son_kalibrasyon, sonraki_kalibrasyon)
         VALUES ($1,$2,$3,$4,$5, (current_date - make_interval(months => $6))::date,
                 (current_date - make_interval(months => $6) + make_interval(months => $5))::date) RETURNING id`,
        [F, kod, ad, konum, periyot, ayOnce],
      );
      await c.query(
        `INSERT INTO kalibrasyon (firma_id, alet_id, tarih, sonuc, sertifika_no, yapan, kaydeden)
         VALUES ($1,$2,(current_date - make_interval(months => $3))::date,'UYGUN',$4,'Akredite kalibrasyon lab.',$5)`,
        [F, a.id, ayOnce, `KAL-${kod}`, berra],
      );
    }

    console.log("Seed tamamlandi. Ornek hesaplar:");
    for (const k of KULLANICILAR) {
      console.log(
        `  ${(k.kullaniciAdi || "(kiosk)").padEnd(9)} ${k.sifre ? `sifre: ${k.sifre}`.padEnd(22) : "".padEnd(22)}` +
          `${k.sicil ? `sicil: ${k.sicil} PIN: ${k.pin}` : ""}   [${k.roller.join(", ")}]`,
      );
    }
    console.log(`  Firma kodu: ${FIRMA_KOD}`);
  });
  await pool.end();
}

main().catch((err) => {
  console.error("[SEED HATASI]", err.message);
  process.exit(1);
});
