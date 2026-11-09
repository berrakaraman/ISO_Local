// KYS destek modulleri (ISO 9001 7.1.5, 7.2, 8.4, 9.1.2, 10.2):
//   olcum aletleri + kalibrasyon, bakim / ariza kaydi, egitim, tedarikci degerlendirme, musteri sikayeti, DOF.
// Kurallar:
//  - Kalibrasyon UYGUN_DEGIL -> alet kullanim disi; o aletle son uygun kalibrasyondan beri yapilan olcumler raporlanir.
//  - Bakim / ariza: muhendisin formundaki gibi tek seferlik elle kayit (makine, tarih, yapilan, durus dk).
//  - Tedarikci puani = kalite x 0,5 + teslimat x 0,3 + belge x 0,2  (>=80 ONAYLI, >=60 SARTLI, <60 ASKIDA).
//    Kalite puani elle girilmez: donemdeki lotlardan hesaplanir (ilk seferde kabul edilen lot / karar verilen lot).
//  - DOF: kok neden + faaliyet yazilmadan uygulamaya gecmez; sorumlu tamamlar, BASKA biri (kalite) etkinligi dogrulayip kapatir.
//  - Sikayet: DOF acildiysa DOF kapanmadan kapanmaz; haksiz sikayet gerekceyle DOF'suz kapatilabilir.
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { izYaz } = require("../services/iz");
const { yeniNumara } = require("../services/numara");
const { firmaAyarlari } = require("../services/birim");
const { yuvarla } = require("../lib/miktar");

const router = express.Router();

const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const tarih = (v, ad, { zorunlu = true } = {}) => {
  const s = d.metin(v, ad, { zorunlu, max: 10 });
  if (s && (!TARIH.test(s) || Number.isNaN(Date.parse(s)))) throw hatalar.gecersiz(`${ad} YYYY-AA-GG olmali`);
  return s;
};
const bugun = async (c, F) => (await bir(c, "SELECT to_char((now() AT TIME ZONE saat_dilimi)::date, 'YYYY-MM-DD') AS g FROM firma WHERE id = $1", [F])).g;

// GET /api/kys/kullanicilar  -> sorumlu secimi icin aktif kisiler
router.get(
  "/kullanicilar",
  sar(async (req, res) => {
    const r = await pool.query("SELECT id, ad_soyad, roller FROM kullanici WHERE firma_id = $1 AND aktif ORDER BY ad_soyad", [req.ctx.firmaId]);
    res.json(r.rows);
  }),
);

// =====================================================================
// Olcum aletleri ve kalibrasyon
// =====================================================================
router.get(
  "/aletler",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT a.*, (now() AT TIME ZONE f.saat_dilimi)::date AS bugun,
              (a.sonraki_kalibrasyon - (now() AT TIME ZONE f.saat_dilimi)::date) AS kalan_gun,
              CASE WHEN a.durum <> 'KULLANIMDA' THEN 'KULLANIM_DISI'
                   WHEN a.sonraki_kalibrasyon IS NULL OR a.sonraki_kalibrasyon < (now() AT TIME ZONE f.saat_dilimi)::date THEN 'GECMIS'
                   WHEN a.sonraki_kalibrasyon <= (now() AT TIME ZONE f.saat_dilimi)::date + 30 THEN 'YAKLASIYOR'
                   ELSE 'GECERLI' END AS kalibrasyon_durumu,
              (SELECT count(*) FROM olcum o WHERE o.alet_id = a.id) AS olcum_sayisi
         FROM olcum_aleti a JOIN firma f ON f.id = a.firma_id
        WHERE a.firma_id = $1 AND a.aktif ORDER BY a.kod`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

router.post(
  "/aletler",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const b = req.body;
    const kod = d.kod(b.kod, "Alet kodu");
    const ad = d.metin(b.ad, "Alet adi", { max: 200 });
    const periyot = d.sayi(b.periyotAy, "Kalibrasyon periyodu (ay)", { min: 1, max: 120 });
    if (!Number.isInteger(periyot)) throw hatalar.gecersiz("Kalibrasyon periyodu tam sayi (ay) olmali");
    const sonuc = await tx(async (c) => {
      const varMi = await bir(c, "SELECT 1 FROM olcum_aleti WHERE firma_id = $1 AND kod = $2", [req.ctx.firmaId, kod]);
      if (varMi) throw hatalar.engel(`${kod} kodlu alet zaten var`, "ZATEN_VAR");
      const a = await bir(
        c,
        "INSERT INTO olcum_aleti (firma_id, kod, ad, konum, periyot_ay) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [req.ctx.firmaId, kod, ad, d.metin(b.konum, "Konum", { zorunlu: false, max: 100 }), periyot],
      );
      await izYaz(c, req.ctx, { tablo: "olcum_aleti", kayitId: a.id, islem: "EKLEME", degisiklikler: [{ alan: "alet", eski: null, yeni: `${kod} ${ad}` }] });
      return a;
    });
    res.status(201).json(sonuc);
  }),
);

router.get(
  "/aletler/:kod/kalibrasyonlar",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT k.*, u.ad_soyad AS kaydeden_ad FROM kalibrasyon k JOIN olcum_aleti a ON a.id = k.alet_id
         LEFT JOIN kullanici u ON u.id = k.kaydeden
        WHERE a.firma_id = $1 AND a.kod = $2 ORDER BY k.tarih DESC, k.zaman DESC`,
      [req.ctx.firmaId, String(req.params.kod).toUpperCase()],
    );
    res.json(r.rows);
  }),
);

// POST /api/kys/aletler/:kod/kalibrasyon  { tarih, sonuc, sertifikaNo?, yapan?, aciklama? }
// UYGUN   -> son = tarih, sonraki = tarih + periyot ay, alet KULLANIMDA
// UYGUN_DEGIL -> alet KULLANIM_DISI; son uygun kalibrasyondan bu yana o aletle yapilan olcumler suphelidir
router.post(
  "/aletler/:kod/kalibrasyon",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const b = req.body;
    const sonucKarar = d.secim(b.sonuc, "Sonuc", ["UYGUN", "UYGUN_DEGIL"]);
    const t = tarih(b.tarih, "Kalibrasyon tarihi");
    const aciklama = d.metin(b.aciklama, "Aciklama", { zorunlu: sonucKarar === "UYGUN_DEGIL", max: 1000 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const a = await bir(c, "SELECT * FROM olcum_aleti WHERE firma_id = $1 AND kod = $2 AND aktif FOR UPDATE", [F, String(req.params.kod).toUpperCase()]);
      if (!a) throw hatalar.bulunamadi("Olcum aleti bulunamadi");
      const g = await bugun(c, F);
      if (t > g) throw hatalar.gecersiz("Kalibrasyon tarihi ileri bir tarih olamaz");
      if (a.son_kalibrasyon && t < a.son_kalibrasyon) {
        throw hatalar.gecersiz("Kalibrasyon tarihi bir onceki kalibrasyondan once olamaz");
      }
      const k = await bir(
        c,
        `INSERT INTO kalibrasyon (firma_id, alet_id, tarih, sonuc, sertifika_no, yapan, aciklama, kaydeden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [F, a.id, t, sonucKarar, d.metin(b.sertifikaNo, "Sertifika no", { zorunlu: false, max: 80 }),
          d.metin(b.yapan, "Kalibrasyonu yapan", { zorunlu: false, max: 200 }), aciklama, req.ctx.kullaniciId],
      );
      let supheliOlcumler = [];
      let guncel;
      if (sonucKarar === "UYGUN") {
        guncel = await bir(
          c,
          `UPDATE olcum_aleti SET son_kalibrasyon = $2::date, sonraki_kalibrasyon = ($2::date + make_interval(months => periyot_ay))::date,
                  durum = 'KULLANIMDA' WHERE id = $1 RETURNING *`,
          [a.id, t],
        );
      } else {
        guncel = await bir(c, "UPDATE olcum_aleti SET durum = 'KULLANIM_DISI' WHERE id = $1 RETURNING *", [a.id]);
        supheliOlcumler = (await c.query(
          `SELECT o.asama, o.zaman, o.deger, k.ad AS karakteristik, ie.no AS is_emri_no
             FROM olcum o LEFT JOIN karakteristik k ON k.id = o.karakteristik_id LEFT JOIN is_emri ie ON ie.id = o.is_emri_id
            WHERE o.alet_id = $1 AND ($2::date IS NULL OR o.zaman >= $2::date) ORDER BY o.zaman`,
          [a.id, a.son_kalibrasyon],
        )).rows;
      }
      await izYaz(c, req.ctx, {
        tablo: "olcum_aleti", kayitId: a.id, islem: "GUNCELLEME",
        degisiklikler: [
          { alan: "durum", eski: a.durum, yeni: guncel.durum },
          { alan: "sonraki_kalibrasyon", eski: a.sonraki_kalibrasyon, yeni: guncel.sonraki_kalibrasyon },
        ],
        gerekce: `Kalibrasyon ${sonucKarar}`,
      });
      return {
        kalibrasyon: k,
        alet: guncel,
        supheliOlcumler,
        etkilenenIsEmirleri: [...new Set(supheliOlcumler.map((x) => x.is_emri_no).filter(Boolean))],
      };
    });
    res.status(201).json(sonuc);
  }),
);

// =====================================================================
// Bakim / ariza kayitlari (elle, tek seferde)
// =====================================================================
router.get(
  "/bakimlar",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT bk.*, m.kod AS makine_kod, m.ad AS makine_ad, k.ad_soyad AS kaydeden_ad
         FROM bakim bk JOIN makine m ON m.id = bk.makine_id LEFT JOIN kullanici k ON k.id = bk.kaydeden
        WHERE bk.firma_id = $1 AND ($2::text IS NULL OR m.kod = $2)
        ORDER BY bk.tarih DESC, bk.zaman DESC LIMIT 500`,
      [req.ctx.firmaId, req.query.makine ? String(req.query.makine).toUpperCase() : null],
    );
    res.json(r.rows);
  }),
);

// POST /api/kys/bakimlar  { makineId, tur: PLANLI|ARIZA, tarih, ariza?, yapilan, kullanilanParca?, durusDk }
router.post(
  "/bakimlar",
  rol(ROLLER.SEF, ROLLER.OPERATOR),
  sar(async (req, res) => {
    const b = req.body;
    const tur = d.secim(b.tur, "Tur", ["PLANLI", "ARIZA"]);
    const t = tarih(b.tarih, "Tarih");
    const ariza = d.metin(b.ariza, "Ariza tanimi", { zorunlu: tur === "ARIZA", max: 1000 });
    const yapilan = d.metin(b.yapilan, "Yapilan islem", { max: 2000 });
    if (yapilan.length < 5) throw hatalar.gecersiz("Yapilan islem en az 5 karakter olmali");
    const durusDk = d.sayi(b.durusDk, "Durus suresi (dk)", { min: 0, max: 10080 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      if (t > (await bugun(c, F))) throw hatalar.gecersiz("Tarih ileri bir gun olamaz (yapilmis bakim / ariza kaydedilir)");
      const m = await bir(c, "SELECT * FROM makine WHERE id = $1 AND firma_id = $2 AND aktif", [d.metin(b.makineId, "Makine", { max: 40 }), F]);
      if (!m) throw hatalar.gecersiz("Makine bulunamadi");
      const ayar = await firmaAyarlari(c, F);
      const no = await yeniNumara(c, F, "BK", ayar.saatDilimi);
      const bk = await bir(
        c,
        `INSERT INTO bakim (firma_id, no, makine_id, tur, tarih, ariza, yapilan, kullanilan_parca, durus_dk, kaydeden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [F, no, m.id, tur, t, ariza, yapilan, d.metin(b.kullanilanParca, "Kullanilan parca", { zorunlu: false, max: 500 }), durusDk, req.ctx.kullaniciId],
      );
      await izYaz(c, req.ctx, { tablo: "bakim", kayitId: bk.id, islem: "EKLEME", degisiklikler: [{ alan: "bakim", eski: null, yeni: `${no} ${tur} ${m.kod} ${durusDk} dk` }], gerekce: ariza || yapilan });
      return { ...bk, makine_kod: m.kod };
    });
    res.status(201).json(sonuc);
  }),
);

// =====================================================================
// Egitim kayitlari
// =====================================================================
router.get(
  "/egitimler",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT e.*, k.ad_soyad, k.roller, kk.ad_soyad AS kaydeden_ad,
              CASE WHEN e.sonuc <> 'BASARILI' THEN 'TEKRAR_GEREKLI'
                   WHEN e.gecerlilik_bitis IS NOT NULL AND e.gecerlilik_bitis < (now() AT TIME ZONE f.saat_dilimi)::date THEN 'SURESI_DOLDU'
                   ELSE 'GECERLI' END AS gecerlilik
         FROM egitim e JOIN kullanici k ON k.id = e.kullanici_id JOIN firma f ON f.id = e.firma_id
         LEFT JOIN kullanici kk ON kk.id = e.kaydeden
        WHERE e.firma_id = $1 ORDER BY e.tarih DESC, k.ad_soyad LIMIT 1000`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

router.post(
  "/egitimler",
  rol(ROLLER.KALITE, ROLLER.YONETIM, ROLLER.SEF),
  sar(async (req, res) => {
    const b = req.body;
    const t = tarih(b.tarih, "Egitim tarihi");
    const gecerlilik = tarih(b.gecerlilikBitis, "Gecerlilik bitisi", { zorunlu: false });
    if (gecerlilik && gecerlilik < t) throw hatalar.gecersiz("Gecerlilik bitisi egitim tarihinden once olamaz");
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      if (t > (await bugun(c, F))) throw hatalar.gecersiz("Egitim tarihi ileri bir tarih olamaz (yapilmis egitim kaydedilir)");
      const k = await bir(c, "SELECT id FROM kullanici WHERE id = $1 AND firma_id = $2 AND aktif", [d.metin(b.kullaniciId, "Kisi", { max: 40 }), F]);
      if (!k) throw hatalar.gecersiz("Kisi bulunamadi");
      const e = await bir(
        c,
        `INSERT INTO egitim (firma_id, kullanici_id, konu, tarih, egitmen, sure_saat, sonuc, gecerlilik_bitis, kaydeden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [F, k.id, d.metin(b.konu, "Konu", { max: 300 }), t, d.metin(b.egitmen, "Egitmen", { zorunlu: false, max: 200 }),
          d.sayi(b.sureSaat, "Sure (saat)", { zorunlu: false, pozitif: true }), d.secim(b.sonuc, "Sonuc", ["BASARILI", "TEKRAR_GEREKLI"]),
          gecerlilik, req.ctx.kullaniciId],
      );
      await izYaz(c, req.ctx, { tablo: "egitim", kayitId: e.id, islem: "EKLEME", degisiklikler: [{ alan: "egitim", eski: null, yeni: `${e.konu} ${t} ${e.sonuc}` }] });
      return e;
    });
    res.status(201).json(sonuc);
  }),
);

// =====================================================================
// Tedarikci degerlendirme
// =====================================================================
function donemAraligi(donem) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(donem || ""));
  if (!m) throw hatalar.gecersiz("Donem YYYY-Q1..Q4 bicminde olmali (ornek 2026-Q4)");
  const yil = Number(m[1]);
  const c = Number(m[2]);
  const ay = (c - 1) * 3 + 1;
  const bas = `${yil}-${String(ay).padStart(2, "0")}-01`;
  const sonAy = ay + 3;
  const bit = sonAy > 12 ? `${yil + 1}-01-01` : `${yil}-${String(sonAy).padStart(2, "0")}-01`;
  return { bas, bit };
}

// Donemdeki karar verilmis lotlar: kabul (hic karantina/ret gormemis) / toplam
async function tedarikciIstatistik(c, F, tedarikciId, donem) {
  const { bas, bit } = donemAraligi(donem);
  const r = await bir(
    c,
    `WITH lotlar AS (
       SELECT l.id, l.durum,
              EXISTS (SELECT 1 FROM birim b JOIN olay o ON o.birim_id = b.id
                       WHERE b.lot_id = l.id AND o.tip = 'KONTROL_KARARI' AND o.veri->>'yeni' IN ('KARANTINA','RET')) AS sorunlu
         FROM lot l JOIN firma f ON f.id = l.firma_id
        WHERE l.firma_id = $1 AND l.tip = 'RM' AND l.tedarikci_id = $2
          AND l.durum NOT IN ('IPTAL','KONTROL_BEKLIYOR')
          AND (l.olusturma_zamani AT TIME ZONE f.saat_dilimi)::date >= $3::date
          AND (l.olusturma_zamani AT TIME ZONE f.saat_dilimi)::date < $4::date)
     SELECT count(*)::int AS lot_sayisi, count(*) FILTER (WHERE NOT sorunlu AND durum <> 'RET')::int AS kabul_lot FROM lotlar`,
    [F, tedarikciId, bas, bit],
  );
  return {
    donem, baslangic: bas, bitis: bit, lotSayisi: r.lot_sayisi, kabulLot: r.kabul_lot,
    kalitePuani: r.lot_sayisi ? yuvarla((r.kabul_lot / r.lot_sayisi) * 100, 2) : null,
  };
}

const AGIRLIK = { kalite: 0.5, teslimat: 0.3, belge: 0.2 };
const sonucOf = (p) => (p >= 80 ? "ONAYLI" : p >= 60 ? "SARTLI" : "ASKIDA");

router.get(
  "/tedarikci-degerlendirme",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT td.*, t.unvan, t.onay_durumu, k.ad_soyad AS kaydeden_ad
         FROM tedarikci_degerlendirme td JOIN tedarikci t ON t.id = td.tedarikci_id LEFT JOIN kullanici k ON k.id = td.kaydeden
        WHERE td.firma_id = $1 ORDER BY td.donem DESC, t.unvan`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

// GET /api/kys/tedarikci-degerlendirme/onizleme?tedarikciId=..&donem=2026-Q4
router.get(
  "/tedarikci-degerlendirme/onizleme",
  sar(async (req, res) => {
    res.json(await tedarikciIstatistik(pool, req.ctx.firmaId, d.metin(req.query.tedarikciId, "Tedarikci", { max: 40 }), req.query.donem));
  }),
);

// POST /api/kys/tedarikci-degerlendirme  { tedarikciId, donem, teslimatPuani, belgePuani, aciklama? }
router.post(
  "/tedarikci-degerlendirme",
  rol(ROLLER.KALITE, ROLLER.YONETIM),
  sar(async (req, res) => {
    const b = req.body;
    const teslimat = d.sayi(b.teslimatPuani, "Teslimat puani", { min: 0, max: 100 });
    const belge = d.sayi(b.belgePuani, "Belge puani", { min: 0, max: 100 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const t = await bir(c, "SELECT * FROM tedarikci WHERE id = $1 AND firma_id = $2 FOR UPDATE", [d.metin(b.tedarikciId, "Tedarikci", { max: 40 }), F]);
      if (!t) throw hatalar.gecersiz("Tedarikci bulunamadi");
      const ist = await tedarikciIstatistik(c, F, t.id, b.donem);
      if (!ist.lotSayisi) throw hatalar.engel(`${t.unvan} icin ${ist.donem} doneminde karar verilmis lot yok, kalite puani hesaplanamaz`, "VERI_YOK");
      const varMi = await bir(c, "SELECT 1 FROM tedarikci_degerlendirme WHERE tedarikci_id = $1 AND donem = $2", [t.id, ist.donem]);
      if (varMi) throw hatalar.engel(`${t.unvan} ${ist.donem} donemi zaten degerlendirilmis`, "ZATEN_VAR");
      const toplam = yuvarla(ist.kalitePuani * AGIRLIK.kalite + teslimat * AGIRLIK.teslimat + belge * AGIRLIK.belge, 2);
      const karar = sonucOf(toplam);
      const r = await bir(
        c,
        `INSERT INTO tedarikci_degerlendirme (firma_id, tedarikci_id, donem, lot_sayisi, kabul_lot, kalite_puani, teslimat_puani, belge_puani,
                                              toplam_puan, sonuc, aciklama, kaydeden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [F, t.id, ist.donem, ist.lotSayisi, ist.kabulLot, ist.kalitePuani, teslimat, belge, toplam, karar,
          d.metin(b.aciklama, "Aciklama", { zorunlu: karar !== "ONAYLI", max: 1000 }), req.ctx.kullaniciId],
      );
      if (t.onay_durumu !== karar) {
        await c.query("UPDATE tedarikci SET onay_durumu = $1 WHERE id = $2", [karar, t.id]);
        await izYaz(c, req.ctx, { tablo: "tedarikci", kayitId: t.id, islem: "GUNCELLEME", degisiklikler: [{ alan: "onay_durumu", eski: t.onay_durumu, yeni: karar }], gerekce: `${ist.donem} degerlendirmesi: ${toplam} puan` });
      }
      return { degerlendirme: r, hesap: { ...ist, teslimat, belge, agirlik: AGIRLIK, toplam, sonuc: karar }, oncekiDurum: t.onay_durumu };
    });
    res.status(201).json(sonuc);
  }),
);

// =====================================================================
// DOF (duzeltici faaliyet)
// =====================================================================
const DOF_SECIM = `
  SELECT df.*, ks.ad_soyad AS sorumlu_ad, ko.ad_soyad AS olusturan_ad, kk.ad_soyad AS kapatan_ad,
         (df.durum <> 'KAPANDI' AND df.termin < (now() AT TIME ZONE f.saat_dilimi)::date) AS gecikti
    FROM dof df JOIN firma f ON f.id = df.firma_id
    LEFT JOIN kullanici ks ON ks.id = df.sorumlu LEFT JOIN kullanici ko ON ko.id = df.olusturan
    LEFT JOIN kullanici kk ON kk.id = df.kapatan`;

async function dofAc(c, ctx, { kaynak, kaynakNo, problem, sorumluId, termin }) {
  const F = ctx.firmaId;
  const k = await bir(c, "SELECT id FROM kullanici WHERE id = $1 AND firma_id = $2 AND aktif", [sorumluId, F]);
  if (!k) throw hatalar.gecersiz("Sorumlu kisi bulunamadi");
  if (termin < (await bugun(c, F))) throw hatalar.gecersiz("Termin bugunden once olamaz");
  const ayar = await firmaAyarlari(c, F);
  const no = await yeniNumara(c, F, "DF", ayar.saatDilimi);
  const df = await bir(
    c,
    `INSERT INTO dof (firma_id, no, kaynak, kaynak_no, problem, sorumlu, termin, olusturan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [F, no, kaynak, kaynakNo || null, problem, k.id, termin, ctx.kullaniciId],
  );
  await izYaz(c, ctx, { tablo: "dof", kayitId: df.id, islem: "EKLEME", degisiklikler: [{ alan: "dof", eski: null, yeni: `${no} ${kaynak} ${kaynakNo || ""}`.trim() }], gerekce: problem });
  return df;
}

async function dofBul(c, F, no) {
  const df = await bir(c, "SELECT * FROM dof WHERE firma_id = $1 AND no = $2 FOR UPDATE", [F, String(no).toUpperCase()]);
  if (!df) throw hatalar.bulunamadi("DOF bulunamadi");
  return df;
}

async function dofDurum(c, ctx, df, yeni, alanlar, gerekce) {
  const kolonlar = Object.keys(alanlar);
  const set = [`durum = $2`, ...kolonlar.map((k, i) => `${k} = $${i + 3}`)].join(", ");
  const r = await bir(c, `UPDATE dof SET ${set} WHERE id = $1 RETURNING *`, [df.id, yeni, ...kolonlar.map((k) => alanlar[k])]);
  await izYaz(c, ctx, { tablo: "dof", kayitId: df.id, islem: "DURUM", degisiklikler: [{ alan: "durum", eski: df.durum, yeni }], gerekce });
  return r;
}

router.get(
  "/doflar",
  sar(async (req, res) => {
    const r = await pool.query(`${DOF_SECIM} WHERE df.firma_id = $1 ORDER BY (df.durum = 'KAPANDI'), df.termin, df.no`, [req.ctx.firmaId]);
    res.json(r.rows);
  }),
);

// POST /api/kys/doflar  { kaynak, kaynakNo?, problem, sorumluId, termin }
router.post(
  "/doflar",
  rol(ROLLER.KALITE, ROLLER.YONETIM),
  sar(async (req, res) => {
    const b = req.body;
    const kaynak = d.secim(b.kaynak, "Kaynak", ["IC_DENETIM", "PROSES", "TEDARIKCI", "DIGER"]);
    const sonuc = await tx(async (c) =>
      dofAc(c, req.ctx, {
        kaynak, kaynakNo: d.metin(b.kaynakNo, "Kaynak no", { zorunlu: false, max: 60 }),
        problem: d.metin(b.problem, "Problem tanimi", { max: 2000 }),
        sorumluId: d.metin(b.sorumluId, "Sorumlu", { max: 40 }), termin: tarih(b.termin, "Termin"),
      }),
    );
    res.status(201).json(sonuc);
  }),
);

// POST /api/kys/doflar/:no/kok-neden  { kokNeden, faaliyet }  -> ACIK -> UYGULAMADA (sorumlu ya da kalite)
router.post(
  "/doflar/:no/kok-neden",
  sar(async (req, res) => {
    const kokNeden = d.metin(req.body.kokNeden, "Kok neden", { max: 2000 });
    const faaliyet = d.metin(req.body.faaliyet, "Duzeltici faaliyet", { max: 2000 });
    if (kokNeden.length < 10 || faaliyet.length < 10) throw hatalar.gecersiz("Kok neden ve faaliyet en az 10 karakter olmali");
    const sonuc = await tx(async (c) => {
      const df = await dofBul(c, req.ctx.firmaId, req.params.no);
      const kalite = req.kullanici.roller.some((r) => [ROLLER.KALITE, ROLLER.ADMIN].includes(r));
      if (df.sorumlu !== req.ctx.kullaniciId && !kalite) throw hatalar.yasak("Kok neden analizini DOF sorumlusu ya da kalite girer");
      if (!["ACIK", "UYGULAMADA"].includes(df.durum)) throw hatalar.engel(`DOF bu asamada degistirilemez (durum: ${df.durum})`, "YANLIS_DURUM");
      return dofDurum(c, req.ctx, df, "UYGULAMADA", { kok_neden: kokNeden, faaliyet }, "Kok neden ve faaliyet girildi");
    });
    res.json(sonuc);
  }),
);

// POST /api/kys/doflar/:no/tamamla  { not? }  -> UYGULAMADA -> DOGRULAMA_BEKLIYOR (yalnizca sorumlu)
router.post(
  "/doflar/:no/tamamla",
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const df = await dofBul(c, req.ctx.firmaId, req.params.no);
      if (df.sorumlu !== req.ctx.kullaniciId) throw hatalar.yasak("Faaliyetin tamamlandigini DOF sorumlusu bildirir");
      if (df.durum !== "UYGULAMADA") {
        throw hatalar.engel(df.durum === "ACIK" ? "Once kok neden ve faaliyet girilmeli" : `DOF bu asamada tamamlanamaz (durum: ${df.durum})`, df.durum === "ACIK" ? "KOK_NEDEN_YOK" : "YANLIS_DURUM");
      }
      return dofDurum(c, req.ctx, df, "DOGRULAMA_BEKLIYOR", { tamamlama_zamani: new Date() }, d.metin(req.body.not, "Not", { zorunlu: false, max: 1000 }) || "Faaliyet tamamlandi");
    });
    res.json(sonuc);
  }),
);

// POST /api/kys/doflar/:no/dogrula  { etkili: true|false, etkinlikNotu }
// Dort goz: sorumlu kendi faaliyetini kapatamaz. Etkili degilse UYGULAMADA'ya geri doner.
router.post(
  "/doflar/:no/dogrula",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const etkili = d.bool(req.body.etkili);
    const not = d.metin(req.body.etkinlikNotu, "Etkinlik degerlendirmesi", { max: 2000 });
    const sonuc = await tx(async (c) => {
      const df = await dofBul(c, req.ctx.firmaId, req.params.no);
      if (df.durum !== "DOGRULAMA_BEKLIYOR") throw hatalar.engel(`DOF dogrulamaya hazir degil (durum: ${df.durum})`, "YANLIS_DURUM");
      if (df.sorumlu === req.ctx.kullaniciId) throw hatalar.yasak("Faaliyetin sorumlusu kendi DOF'unu kapatamaz (dort goz kurali)");
      return etkili
        ? dofDurum(c, req.ctx, df, "KAPANDI", { etkinlik_notu: not, kapatan: req.ctx.kullaniciId, kapanma_zamani: new Date() }, not)
        : dofDurum(c, req.ctx, df, "UYGULAMADA", { etkinlik_notu: not, tamamlama_zamani: null }, `Etkin degil: ${not}`);
    });
    res.json(sonuc);
  }),
);

// =====================================================================
// Musteri sikayetleri
// =====================================================================
router.get(
  "/sikayetler",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT s.*, m.unvan AS musteri, sv.no AS sevkiyat_no, l.no AS lot_no, df.no AS dof_no, df.durum AS dof_durum,
              ko.ad_soyad AS olusturan_ad, kk.ad_soyad AS kapatan_ad,
              (SELECT COALESCE(sum(o.miktar), 0) FROM olay o WHERE o.firma_id = s.firma_id AND o.tip = 'MUSTERI_IADESI' AND o.veri->>'sikayetNo' = s.no) AS iade_miktari
         FROM sikayet s JOIN musteri m ON m.id = s.musteri_id
         LEFT JOIN sevkiyat sv ON sv.id = s.sevkiyat_id LEFT JOIN lot l ON l.id = s.lot_id LEFT JOIN dof df ON df.id = s.dof_id
         LEFT JOIN kullanici ko ON ko.id = s.olusturan LEFT JOIN kullanici kk ON kk.id = s.kapatan
        WHERE s.firma_id = $1 ORDER BY (s.durum = 'KAPANDI'), s.olusturma_zamani DESC`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

// POST /api/kys/sikayetler  { musteriId, sevkiyatNo?, lotNo?, konu, aciklama? }
// Sevkiyat verildiyse o musteriye sevk edilmis olmali; lot verildiyse o lottan o musteriye parca gitmis olmali.
router.post(
  "/sikayetler",
  rol(ROLLER.KALITE, ROLLER.YONETIM),
  sar(async (req, res) => {
    const b = req.body;
    const konu = d.metin(b.konu, "Sikayet konusu", { max: 300 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const mu = await bir(c, "SELECT * FROM musteri WHERE id = $1 AND firma_id = $2", [d.metin(b.musteriId, "Musteri", { max: 40 }), F]);
      if (!mu) throw hatalar.gecersiz("Musteri bulunamadi");
      let sv = null;
      if (b.sevkiyatNo) {
        sv = await bir(c, "SELECT * FROM sevkiyat WHERE firma_id = $1 AND no = $2", [F, String(b.sevkiyatNo).toUpperCase()]);
        if (!sv) throw hatalar.gecersiz("Sevkiyat bulunamadi");
        if (sv.musteri_id !== mu.id) throw hatalar.engel(`${sv.no} bu musteriye ait degil`, "BASKA_MUSTERI");
        if (sv.durum !== "SEVK_EDILDI") throw hatalar.engel(`${sv.no} sevk edilmemis`, "YANLIS_DURUM");
      }
      let lot = null;
      if (b.lotNo) {
        lot = await bir(c, "SELECT * FROM lot WHERE firma_id = $1 AND no = $2 AND tip = 'FG'", [F, String(b.lotNo).toUpperCase()]);
        if (!lot) throw hatalar.gecersiz("Uretim lotu bulunamadi");
        const gitti = await bir(
          c,
          `SELECT 1 FROM sevkiyat_satiri ss JOIN sevkiyat s ON s.id = ss.sevkiyat_id JOIN birim x ON x.id = ss.birim_id
            WHERE x.lot_id = $1 AND s.musteri_id = $2 AND s.durum = 'SEVK_EDILDI' AND ($3::uuid IS NULL OR s.id = $3) LIMIT 1`,
          [lot.id, mu.id, sv?.id || null],
        );
        if (!gitti) throw hatalar.engel(`${lot.no} lotundan ${sv ? sv.no + " sevkiyatiyla " : ""}bu musteriye parca sevk edilmemis`, "BASKA_MUSTERI");
      }
      const ayar = await firmaAyarlari(c, F);
      const no = await yeniNumara(c, F, "SK", ayar.saatDilimi);
      const s = await bir(
        c,
        `INSERT INTO sikayet (firma_id, no, musteri_id, sevkiyat_id, lot_id, konu, aciklama, olusturan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [F, no, mu.id, sv?.id || null, lot?.id || null, konu, d.metin(b.aciklama, "Aciklama", { zorunlu: false, max: 2000 }), req.ctx.kullaniciId],
      );
      await izYaz(c, req.ctx, { tablo: "sikayet", kayitId: s.id, islem: "EKLEME", degisiklikler: [{ alan: "sikayet", eski: null, yeni: `${no} ${mu.unvan}: ${konu}` }] });
      return s;
    });
    res.status(201).json(sonuc);
  }),
);

async function sikayetBul(c, F, no) {
  const s = await bir(c, "SELECT * FROM sikayet WHERE firma_id = $1 AND no = $2 FOR UPDATE", [F, String(no).toUpperCase()]);
  if (!s) throw hatalar.bulunamadi("Sikayet bulunamadi");
  return s;
}

// POST /api/kys/sikayetler/:no/dof  { sorumluId, termin, problem? }  -> sikayetten DOF acar, sikayet INCELEMEDE
router.post(
  "/sikayetler/:no/dof",
  rol(ROLLER.KALITE, ROLLER.YONETIM),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const s = await sikayetBul(c, req.ctx.firmaId, req.params.no);
      if (s.durum === "KAPANDI") throw hatalar.engel("Sikayet kapanmis", "YANLIS_DURUM");
      if (s.dof_id) throw hatalar.engel("Bu sikayet icin DOF zaten acilmis", "ZATEN_VAR");
      const df = await dofAc(c, req.ctx, {
        kaynak: "SIKAYET", kaynakNo: s.no,
        problem: d.metin(req.body.problem, "Problem", { zorunlu: false, max: 2000 }) || s.konu,
        sorumluId: d.metin(req.body.sorumluId, "Sorumlu", { max: 40 }), termin: tarih(req.body.termin, "Termin"),
      });
      await c.query("UPDATE sikayet SET dof_id = $1, durum = 'INCELEMEDE' WHERE id = $2", [df.id, s.id]);
      await izYaz(c, req.ctx, { tablo: "sikayet", kayitId: s.id, islem: "DURUM", degisiklikler: [{ alan: "durum", eski: s.durum, yeni: "INCELEMEDE" }], gerekce: `${df.no} acildi` });
      return { sikayetNo: s.no, dof: df };
    });
    res.status(201).json(sonuc);
  }),
);

// POST /api/kys/sikayetler/:no/kapat  { kapanisNotu, hakli? }
// Hakli sikayet (varsayilan): bagli DOF KAPANDI olmali. Haksiz (hakli=false): DOF gerekmez, gerekce zorunlu.
router.post(
  "/sikayetler/:no/kapat",
  rol(ROLLER.KALITE, ROLLER.YONETIM),
  sar(async (req, res) => {
    const not = d.metin(req.body.kapanisNotu, "Kapanis notu", { max: 2000 });
    const hakli = req.body.hakli === undefined ? true : d.bool(req.body.hakli);
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const s = await sikayetBul(c, F, req.params.no);
      if (s.durum === "KAPANDI") throw hatalar.engel("Sikayet zaten kapanmis", "YANLIS_DURUM");
      if (hakli) {
        if (!s.dof_id) throw hatalar.engel("Hakli sikayet DOF acilmadan kapatilamaz", "DOF_YOK");
        const df = await bir(c, "SELECT no, durum FROM dof WHERE id = $1", [s.dof_id]);
        if (df.durum !== "KAPANDI") throw hatalar.engel(`${df.no} henuz kapanmadi (durum: ${df.durum}). Sikayet DOF'tan once kapanamaz.`, "DOF_ACIK");
      } else if (not.length < 10) {
        throw hatalar.gecersiz("Haksiz sikayet icin gerekce en az 10 karakter olmali");
      }
      // Iade edilen parcalarin karari verilmeden sikayet kapanmaz
      const bekleyen = await bir(
        c,
        `SELECT string_agg(b.barkod, ', ') AS b FROM olay o JOIN birim b ON b.id = o.birim_id
          WHERE o.firma_id = $1 AND o.tip = 'MUSTERI_IADESI' AND o.veri->>'sikayetNo' = $2 AND b.durum = 'KARANTINA'`,
        [F, s.no],
      );
      if (bekleyen.b) throw hatalar.engel(`Iade edilen parcalarin karari verilmedi: ${bekleyen.b}`, "IADE_KARARI_YOK");
      const g = await bir(
        c,
        "UPDATE sikayet SET durum = 'KAPANDI', kapanis_notu = $2, kapatan = $3, kapanma_zamani = now() WHERE id = $1 RETURNING *",
        [s.id, hakli ? not : `[Haksiz] ${not}`, req.ctx.kullaniciId],
      );
      await izYaz(c, req.ctx, { tablo: "sikayet", kayitId: s.id, islem: "DURUM", degisiklikler: [{ alan: "durum", eski: s.durum, yeni: "KAPANDI" }], gerekce: not });
      return g;
    });
    res.json(sonuc);
  }),
);

module.exports = { router, tedarikciIstatistik };
