// Genel Bakis paneli, olay akisi, degisiklik izi (bolum 16.1, 19.3)
const express = require("express");
const crypto = require("crypto");
const { pool } = require("../config/db");
const { sar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { yuvarla } = require("../lib/miktar");

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
              (SELECT COALESCE(sum(ilk_miktar),0) FROM birim WHERE is_emri_id = ie.id AND tip = 'FG_LOT' AND durum <> 'IPTAL') AS uretilen,
              (SELECT COALESCE(sum(ilk_miktar), 0) FROM birim WHERE makine_id = m.id AND tip = 'KR'
                 AND olusturma_zamani >= date_trunc('day', now() AT TIME ZONE f.saat_dilimi) AT TIME ZONE f.saat_dilimi) AS bugun_karantina,
              (SELECT k.sicil_no FROM is_emri_baglama g JOIN kullanici k ON k.id = g.kullanici_id
                WHERE g.is_emri_id = ie.id ORDER BY g.baglama_zamani DESC LIMIT 1) AS son_operator,
              u.ad AS urun_ad,
              CASE WHEN ie.durum = 'URETIMDE' THEN 'CALISIYOR'
                   WHEN ie.durum = 'ILK_PARCA_BEKLIYOR' THEN 'ILK_PARCA'
                   WHEN ie.durum = 'DURAKLATILDI' THEN 'DURUYOR'
                   ELSE 'BOS' END AS durum
         FROM makine m
         JOIN firma f ON f.id = m.firma_id
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

// Gunluk planli calisma dakikasi: vardiya saatlerinden (gece vardiyasi ertesi gune tasar)
function gunlukPlanliDk(ayar) {
  const v = Array.isArray(ayar.vardiyalar) && ayar.vardiyalar.length ? ayar.vardiyalar : [{ bas: "00:00", bit: "24:00" }];
  const dk = (x) => {
    const [h, m] = String(x).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return v.reduce((t, x) => {
    const fark = dk(x.bit) - dk(x.bas);
    return t + (fark > 0 ? fark : fark + 1440);
  }, 0);
}

// Makine kullanilabilirligi (muhendisin KPI panosu: calisilabilir sure / planli sure x 100).
// Duruslar bakim / ariza kayitlarina elle yazilan dakikalardir (kayit tarihi donemin icindeyse sayilir).
//   planli      = gunluk vardiya dk x gun sayisi x makine sayisi
//   planliDurus = PLANLI bakim dakikalari (planli surenin disinda tutulur)
//   kullanilabilirlik % = (planli - planliDurus - ariza dk) / (planli - planliDurus) x 100
async function kullanilabilirlik(c, F, bas, bit, makineKod = null) {
  const ayar = (await c.query("SELECT ayarlar FROM firma WHERE id = $1", [F])).rows[0].ayarlar;
  const r = (await c.query(
    `SELECT (SELECT count(*) FROM makine WHERE firma_id = $1 AND aktif AND ($4::text IS NULL OR kod = $4))::int AS makine_sayisi,
            ($3::date - $2::date + 1) AS gun,
            COALESCE(sum(b.durus_dk) FILTER (WHERE b.tur = 'PLANLI'), 0) AS planli_durus,
            COALESCE(sum(b.durus_dk) FILTER (WHERE b.tur = 'ARIZA'), 0) AS plansiz_durus
       FROM bakim b JOIN makine m ON m.id = b.makine_id
      WHERE b.firma_id = $1 AND b.tarih BETWEEN $2::date AND $3::date AND m.aktif AND ($4::text IS NULL OR m.kod = $4)`,
    [F, bas, bit, makineKod],
  )).rows[0];
  const gun = Number(r.gun);
  const planli = gunlukPlanliDk(ayar) * gun * r.makine_sayisi;
  const planliDurus = yuvarla(r.planli_durus, 2);
  const plansizDurus = yuvarla(r.plansiz_durus, 2);
  const net = planli - planliDurus;
  return {
    gun, makineSayisi: r.makine_sayisi, gunlukPlanliDk: gunlukPlanliDk(ayar), planliDk: planli, planliDurusDk: planliDurus, plansizDurusDk: plansizDurus,
    deger: net > 0 ? yuvarla(((net - plansizDurus) / net) * 100, 2) : null,
  };
}

const oran = (pay, payda, carpan = 100) => (payda > 0 ? yuvarla((pay / payda) * carpan, 2) : null);

// GET /api/panel/kpi?baslangic=2026-10-01&bitis=2026-10-31  (varsayilan: son 30 gun)
router.get(
  "/kpi",
  rol(ROLLER.YONETIM, ROLLER.KALITE, ROLLER.SEF, ROLLER.DENETCI),
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const gunAl = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
    const v = (await pool.query(
      `SELECT to_char((now() AT TIME ZONE saat_dilimi)::date, 'YYYY-MM-DD') AS bugun,
              to_char((now() AT TIME ZONE saat_dilimi)::date - 29, 'YYYY-MM-DD') AS once, ayarlar FROM firma WHERE id = $1`,
      [F],
    )).rows[0];
    const bas = gunAl(req.query.baslangic) || v.once;
    const bit = gunAl(req.query.bitis) || v.bugun;
    if (bas > bit) return res.status(400).json({ hata: { kod: "GECERSIZ_ISTEK", mesaj: "Baslangic bitisten sonra olamaz" } });
    const P = [F, bas, bit];
    const ARALIK = (k) => `(${k} AT TIME ZONE (SELECT saat_dilimi FROM firma WHERE id = $1))::date BETWEEN $2::date AND $3::date`;
    const [ilk, uretim, hurda, teslim, sevk, iade, sayilar] = await Promise.all([
      pool.query(
        `SELECT count(*) AS toplam, count(*) FILTER (WHERE ilk_seferde) AS ilk_seferde FROM (
           SELECT o.is_emri_id, bool_and(o.sonuc = 'UYGUN') AS ilk_seferde
             FROM olcum o WHERE o.firma_id = $1 AND o.asama = 'ILK_PARCA' AND o.deneme_no = 1 AND ${ARALIK("o.zaman")}
            GROUP BY o.is_emri_id) x`, P),
      pool.query(
        `SELECT COALESCE(sum(ilk_miktar) FILTER (WHERE tip = 'FG_LOT'), 0) AS top, COALESCE(sum(ilk_miktar) FILTER (WHERE tip = 'KR'), 0) AS kr
           FROM birim WHERE firma_id = $1 AND tip IN ('FG_LOT','KR') AND durum <> 'IPTAL' AND ${ARALIK("olusturma_zamani")}`, P),
      pool.query(
        `SELECT COALESCE(sum(o.miktar), 0) AS hurda FROM olay o JOIN birim b ON b.id = o.birim_id
          WHERE o.firma_id = $1 AND o.tip = 'HURDA' AND b.tip IN ('FG_LOT','FG','KR') AND ${ARALIK("o.zaman")}`, P),
      pool.query(
        `SELECT count(*) AS toplam,
                count(*) FILTER (WHERE (bitis AT TIME ZONE (SELECT saat_dilimi FROM firma WHERE id = $1))::date <= planlanan_tarih) AS zamaninda
           FROM is_emri WHERE firma_id = $1 AND durum IN ('TAMAMLANDI','TAMAMLANDI_FARK') AND planlanan_tarih IS NOT NULL AND ${ARALIK("bitis")}`, P),
      pool.query(
        `SELECT COALESCE(sum(o.miktar), 0) AS sevk FROM olay o WHERE o.firma_id = $1 AND o.tip = 'SEVKIYAT' AND ${ARALIK("o.zaman")}`, P),
      pool.query(
        `SELECT COALESCE(sum(o.miktar), 0) AS iade FROM olay o WHERE o.firma_id = $1 AND o.tip = 'MUSTERI_IADESI' AND ${ARALIK("o.zaman")}`, P),
      pool.query(
        `SELECT (SELECT count(*) FROM sikayet WHERE firma_id = $1 AND durum <> 'KAPANDI') AS acik_sikayet,
                (SELECT count(*) FROM dof WHERE firma_id = $1 AND durum <> 'KAPANDI') AS acik_dof,
                (SELECT count(*) FROM dof d JOIN firma f ON f.id = d.firma_id WHERE d.firma_id = $1 AND d.durum <> 'KAPANDI'
                    AND d.termin < (now() AT TIME ZONE f.saat_dilimi)::date) AS geciken_dof,
                (SELECT count(*) FROM olcum_aleti a JOIN firma f ON f.id = a.firma_id WHERE a.firma_id = $1 AND a.aktif
                    AND (a.durum <> 'KULLANIMDA' OR a.sonraki_kalibrasyon IS NULL OR a.sonraki_kalibrasyon < (now() AT TIME ZONE f.saat_dilimi)::date)) AS gecmis_kalibrasyon,
                (SELECT count(*) FROM egitim e JOIN firma f ON f.id = e.firma_id WHERE e.firma_id = $1
                    AND e.gecerlilik_bitis < (now() AT TIME ZONE f.saat_dilimi)::date
                    AND NOT EXISTS (SELECT 1 FROM egitim y WHERE y.kullanici_id = e.kullanici_id AND y.konu = e.konu AND y.tarih > e.tarih)) AS suresi_dolan_egitim`,
        [F]),
    ]);
    const u = uretim.rows[0];
    const uretilen = yuvarla(u.top + u.kr, 2);
    const kul = await kullanilabilirlik(pool, F, bas, bit);
    const H = { ilkParcaIlkSeferde: 95, fireOrani: 2, karantinaOrani: 3, zamanindaTamamlama: 95, musteriIadePpm: 500, kullanilabilirlik: 85, ...(v.ayarlar.kpiHedefleri || {}) };
    const g = (ad, baslik, deger, hedef, yon, formul, pay, payda, birim = "%") => ({
      ad, baslik, deger, hedef, yon, birim, formul, pay, payda,
      hedefte: deger === null ? null : yon === "yuksek" ? deger >= hedef : deger <= hedef,
    });
    const i = ilk.rows[0];
    const t = teslim.rows[0];
    const sevkM = yuvarla(sevk.rows[0].sevk, 2);
    const iadeM = yuvarla(iade.rows[0].iade, 2);
    const hurdaM = yuvarla(hurda.rows[0].hurda, 2);
    res.json({
      baslangic: bas,
      bitis: bit,
      gostergeler: [
        g("ilkParcaIlkSeferde", "İlk parça ilk seferde onay", oran(i.ilk_seferde, i.toplam), H.ilkParcaIlkSeferde, "yuksek",
          "ilk denemede tüm ölçümleri uygun iş emri / ilk parça ölçümü yapılan iş emri × 100", i.ilk_seferde, i.toplam),
        g("fireOrani", "Fire (hurda) oranı", oran(hurdaM, uretilen), H.fireOrani, "dusuk",
          "dönemde hurdaya yazılan metre / dönemde üretilen metre (top + karantina) × 100", hurdaM, uretilen),
        g("karantinaOrani", "Karantina oranı", oran(u.kr, uretilen), H.karantinaOrani, "dusuk",
          "üretimde karantinaya ayrılan metre / üretilen metre × 100", yuvarla(u.kr, 2), uretilen),
        g("zamanindaTamamlama", "Zamanında tamamlanan iş emri", oran(t.zamaninda, t.toplam), H.zamanindaTamamlama, "yuksek",
          "planlanan tarihte ya da önce biten iş emri / dönemde biten planlı iş emri × 100", t.zamaninda, t.toplam),
        g("musteriIadePpm", "Müşteri iadesi (ppm)", oran(iadeM, sevkM, 1e6), H.musteriIadePpm, "dusuk",
          "müşteriden iade gelen metre / sevk edilen metre × 1.000.000", iadeM, sevkM, "ppm"),
        g("kullanilabilirlik", "Makine kullanılabilirliği", kul.deger, H.kullanilabilirlik, "yuksek",
          "(planlı süre − planlı bakım − arıza duruşu) / (planlı süre − planlı bakım) × 100; duruşlar bakım/arıza kayıtlarındaki dakikalar", yuvarla(kul.planliDk - kul.planliDurusDk - kul.plansizDurusDk, 2), yuvarla(kul.planliDk - kul.planliDurusDk, 2)),
      ],
      kullanilabilirlik: kul,
      uyarilar: sayilar.rows[0],
    });
  }),
);

// GET /api/panel/makineler/:kod  -> makine karti: su anki is, bakim / ariza kayitlari, son is emirleri, son 7 gun
router.get(
  "/makineler/:kod",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const kod = String(req.params.kod).toUpperCase();
    const m = (await pool.query("SELECT * FROM makine WHERE firma_id = $1 AND kod = $2", [F, kod])).rows[0];
    if (!m) return res.status(404).json({ hata: { kod: "BULUNAMADI", mesaj: "Makine bulunamadi" } });
    const [ie, bakimlar, isEmirleri, gunler] = await Promise.all([
      pool.query(
        `SELECT ie.no, ie.durum, ie.hedef_miktar, ie.baslangic, u.kod AS urun_kod, u.ad AS urun_ad,
                (SELECT COALESCE(sum(ilk_miktar), 0) FROM birim WHERE is_emri_id = ie.id AND tip = 'FG_LOT' AND durum <> 'IPTAL') AS uretilen,
                (SELECT COALESCE(sum(ilk_miktar), 0) FROM birim WHERE is_emri_id = ie.id AND tip = 'KR' AND durum <> 'IPTAL') AS karantina
           FROM is_emri ie JOIN urun u ON u.id = ie.urun_id
          WHERE ie.makine_id = $1 AND ie.durum IN ('URETIMDE','ILK_PARCA_BEKLIYOR','DURAKLATILDI') ORDER BY ie.baslangic DESC NULLS LAST LIMIT 1`,
        [m.id]),
      pool.query(
        `SELECT bk.*, k.ad_soyad AS kaydeden_ad FROM bakim bk LEFT JOIN kullanici k ON k.id = bk.kaydeden
          WHERE bk.makine_id = $1 ORDER BY bk.tarih DESC, bk.zaman DESC LIMIT 20`,
        [m.id]),
      pool.query(
        `SELECT ie.no, ie.durum, ie.hedef_miktar, ie.baslangic, ie.bitis, u.kod AS urun_kod
           FROM is_emri ie JOIN urun u ON u.id = ie.urun_id WHERE ie.makine_id = $1 ORDER BY ie.olusturma_zamani DESC LIMIT 10`,
        [m.id]),
      pool.query(
        `SELECT to_char((now() AT TIME ZONE saat_dilimi)::date, 'YYYY-MM-DD') AS bugun,
                to_char((now() AT TIME ZONE saat_dilimi)::date - 6, 'YYYY-MM-DD') AS once FROM firma WHERE id = $1`, [F]),
    ]);
    const g = gunler.rows[0];
    res.json({
      makine: m,
      isEmri: ie.rows[0] || null,
      bakimlar: bakimlar.rows,
      isEmirleri: isEmirleri.rows,
      son7Gun: await kullanilabilirlik(pool, F, g.once, g.bugun, kod),
    });
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
