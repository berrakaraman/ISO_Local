// Genel Bakis paneli, olay akisi, degisiklik izi (bolum 16.1, 19.3)
const express = require("express");
const crypto = require("crypto");
const { pool } = require("../config/db");
const { sar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");

const router = express.Router();

// GET /api/panel/ozet  -> ust kartlar
router.get(
  "/ozet",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const r = await pool.query(
      `SELECT
         (SELECT COALESCE(sum(ilk_miktar), 0) FROM birim
           WHERE firma_id = $1 AND tip = 'FG_LOT' AND olusturma_zamani >= date_trunc('day', now() AT TIME ZONE f.saat_dilimi) AT TIME ZONE f.saat_dilimi) AS bugun_uretilen,
         (SELECT COALESCE(sum(ilk_miktar), 0) FROM birim
           WHERE firma_id = $1 AND tip = 'KR' AND olusturma_zamani >= date_trunc('day', now() AT TIME ZONE f.saat_dilimi) AT TIME ZONE f.saat_dilimi) AS bugun_karantina,
         (SELECT count(*) FROM birim WHERE firma_id = $1 AND tip = 'KR' AND durum IN ('KARAR_BEKLIYOR','YENIDEN_ISLEME')) AS karar_bekleyen,
         (SELECT count(*) FROM birim WHERE firma_id = $1 AND bloke) AS bloke_birim,
         (SELECT count(DISTINCT lot_id) FROM birim WHERE firma_id = $1 AND bloke) AS bloke_lot,
         (SELECT count(*) FROM birim WHERE firma_id = $1 AND tip = 'FG' AND durum = 'KALITE_BEKLIYOR') AS kalite_bekleyen,
         (SELECT count(*) FROM lot WHERE firma_id = $1 AND tip = 'RM' AND durum = 'KONTROL_BEKLIYOR') AS hammadde_kontrol_bekleyen,
         (SELECT count(*) FROM is_emri WHERE firma_id = $1 AND durum IN ('URETIMDE','ILK_PARCA_BEKLIYOR')) AS aktif_is_emri,
         (SELECT count(*) FROM is_emri WHERE firma_id = $1 AND durum = 'PLANLANDI') AS planlanan_is_emri,
         (SELECT count(*) FROM is_emri WHERE firma_id = $1 AND durum = 'TAMAMLANDI_FARK') AS fark_aciklamasi_bekleyen
       FROM firma f WHERE f.id = $1`,
      [F],
    );
    res.json(r.rows[0]);
  }),
);

// GET /api/panel/makineler  -> makine kartlari (yerlesim plani ve genel bakis)
router.get(
  "/makineler",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT m.id, m.kod, m.ad, m.tip, m.plan_x, m.plan_y,
              ie.no AS is_emri_no, ie.durum AS is_emri_durumu, ie.hedef_miktar, u.kod AS urun_kod,
              (SELECT COALESCE(sum(ilk_miktar),0) FROM birim WHERE is_emri_id = ie.id AND tip = 'FG_LOT') AS uretilen,
              (SELECT count(*) FROM birim WHERE makine_id = m.id AND tip = 'KR'
                 AND olusturma_zamani >= date_trunc('day', now())) AS bugun_karantina,
              (SELECT k.sicil_no FROM is_emri_baglama g JOIN kullanici k ON k.id = g.kullanici_id
                WHERE g.is_emri_id = ie.id ORDER BY g.baglama_zamani DESC LIMIT 1) AS son_operator,
              CASE WHEN ie.durum = 'URETIMDE' THEN 'CALISIYOR'
                   WHEN ie.durum = 'ILK_PARCA_BEKLIYOR' THEN 'AYAR'
                   WHEN ie.durum = 'DURAKLATILDI' THEN 'DURUYOR'
                   ELSE 'BOS' END AS durum
         FROM makine m
         LEFT JOIN LATERAL (
           SELECT * FROM is_emri WHERE makine_id = m.id AND durum IN ('URETIMDE','ILK_PARCA_BEKLIYOR','DURAKLATILDI')
           ORDER BY baslangic DESC NULLS LAST LIMIT 1) ie ON true
         LEFT JOIN urun u ON u.id = ie.urun_id
        WHERE m.firma_id = $1 AND m.aktif ORDER BY m.kod`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

// GET /api/panel/olaylar?limit=50&tip=KARANTINAYA_AYIRMA  -> son olaylar akisi
router.get(
  "/olaylar",
  sar(async (req, res) => {
    const limit = d.sayi(req.query.limit, "Limit", { zorunlu: false, min: 1, max: 500 }) || 50;
    const tipler = req.query.tip ? String(req.query.tip).split(",") : null;
    const r = await pool.query(
      `SELECT o.id, o.zaman, o.tip, o.miktar, o.olcu_birimi, o.aciklama, o.cihaz,
              b.barkod, b.tip AS birim_tipi, ie.no AS is_emri_no, k.ad_soyad AS kullanici, k.sicil_no
         FROM olay o LEFT JOIN birim b ON b.id = o.birim_id LEFT JOIN is_emri ie ON ie.id = o.is_emri_id
         LEFT JOIN kullanici k ON k.id = o.kullanici_id
        WHERE o.firma_id = $1 AND ($2::text[] IS NULL OR o.tip = ANY($2))
        ORDER BY o.zaman DESC, o.id DESC LIMIT $3`,
      [req.ctx.firmaId, tipler, limit],
    );
    res.json(r.rows);
  }),
);

// GET /api/panel/saatlik?gun=2026-10-26  -> saatlik uretim, karantina ve hurda (metre)
router.get(
  "/saatlik",
  sar(async (req, res) => {
    const gun = req.query.gun ? d.metin(req.query.gun, "Gun", { max: 10 }) : null;
    const r = await pool.query(
      `WITH f AS (SELECT saat_dilimi FROM firma WHERE id = $1),
            g AS (SELECT COALESCE($2::date, (now() AT TIME ZONE (SELECT saat_dilimi FROM f))::date) AS gun)
       SELECT s.saat,
              COALESCE(sum(b.ilk_miktar) FILTER (WHERE b.tip = 'FG_LOT'), 0) AS uretim,
              COALESCE(sum(b.ilk_miktar) FILTER (WHERE b.tip = 'KR'), 0) AS karantina
         FROM generate_series(0, 23) s(saat)
         LEFT JOIN birim b ON b.firma_id = $1 AND b.tip IN ('FG_LOT','KR')
              AND (b.olusturma_zamani AT TIME ZONE (SELECT saat_dilimi FROM f))::date = (SELECT gun FROM g)
              AND extract(hour FROM b.olusturma_zamani AT TIME ZONE (SELECT saat_dilimi FROM f)) = s.saat
        GROUP BY s.saat ORDER BY s.saat`,
      [req.ctx.firmaId, gun],
    );
    const hurda = await pool.query(
      `SELECT extract(hour FROM o.zaman AT TIME ZONE f.saat_dilimi)::int AS saat, sum(o.miktar) AS hurda
         FROM olay o JOIN firma f ON f.id = o.firma_id JOIN birim b ON b.id = o.birim_id
        WHERE o.firma_id = $1 AND o.tip = 'HURDA' AND b.tip IN ('FG_LOT','FG','KR')
          AND (o.zaman AT TIME ZONE f.saat_dilimi)::date = COALESCE($2::date, (now() AT TIME ZONE f.saat_dilimi)::date)
        GROUP BY 1`,
      [req.ctx.firmaId, gun],
    );
    const hm = Object.fromEntries(hurda.rows.map((x) => [x.saat, x.hurda]));
    res.json(r.rows.map((x) => ({ ...x, hurda: hm[x.saat] || 0 })));
  }),
);

// GET /api/panel/degisiklik-izi?tablo=birim&kayitId=...&limit=100
router.get(
  "/degisiklik-izi",
  rol(ROLLER.KALITE, ROLLER.DENETCI, ROLLER.YONETIM),
  sar(async (req, res) => {
    const limit = d.sayi(req.query.limit, "Limit", { zorunlu: false, min: 1, max: 1000 }) || 100;
    const r = await pool.query(
      `SELECT i.id, i.zaman, i.tablo, i.kayit_id, i.alan, i.eski_deger, i.yeni_deger, i.islem, i.gerekce, i.cihaz,
              k.ad_soyad AS kullanici, k.sicil_no
         FROM degisiklik_izi i LEFT JOIN kullanici k ON k.id = i.kullanici_id
        WHERE i.firma_id = $1 AND ($2::text IS NULL OR i.tablo = $2) AND ($3::text IS NULL OR i.kayit_id = $3)
          AND ($4::uuid IS NULL OR i.kullanici_id = $4)
        ORDER BY i.id DESC LIMIT $5`,
      [req.ctx.firmaId, req.query.tablo || null, req.query.kayitId || null, req.query.kullaniciId || null, limit],
    );
    res.json(r.rows);
  }),
);

// GET /api/panel/iz-dogrula  -> degisiklik izi zincirini bastan sona kontrol eder (denetci icin)
router.get(
  "/iz-dogrula",
  rol(ROLLER.KALITE, ROLLER.DENETCI, ROLLER.YONETIM),
  sar(async (req, res) => {
    const r = await pool.query("SELECT * FROM degisiklik_izi WHERE firma_id = $1 ORDER BY id", [req.ctx.firmaId]);
    let onceki = "BASLANGIC";
    for (const x of r.rows) {
      const beklenen = crypto
        .createHash("sha256")
        .update([onceki, x.firma_id, x.tablo, x.kayit_id, x.alan, x.eski_deger, x.yeni_deger, x.islem, x.kullanici_id, x.zaman.toISOString(), x.gerekce].join("|"))
        .digest("hex");
      if (x.onceki_ozet !== onceki || x.ozet !== beklenen) {
        return res.json({ saglam: false, kontrolEdilen: r.rows.length, bozukSatir: x.id, zaman: x.zaman });
      }
      onceki = x.ozet;
    }
    res.json({ saglam: true, kontrolEdilen: r.rows.length });
  }),
);

// GET /api/panel/entegrasyon-kuyrugu?durum=BEKLIYOR
router.get(
  "/entegrasyon-kuyrugu",
  rol(ROLLER.ADMIN),
  sar(async (req, res) => {
    const r = await pool.query(
      "SELECT * FROM entegrasyon_kuyrugu WHERE firma_id = $1 AND ($2::text IS NULL OR durum = $2) ORDER BY id DESC LIMIT 200",
      [req.ctx.firmaId, req.query.durum || null],
    );
    res.json(r.rows);
  }),
);

module.exports = router;
