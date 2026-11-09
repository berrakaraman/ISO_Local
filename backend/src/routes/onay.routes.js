// Form onay akisi (F-01 ... F-06 "Sorumlu / Onay" sutunlari).
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER, ONAY_TURU, ONAY_DURUM: O } = require("../lib/sabitler");
const { onayKarari, ONAYLAYABILIR } = require("../services/onay");
const { hammaddeKarari, ONAY_KARAR } = require("../services/hammadde");

const router = express.Router();

const SECIM = `o.*, ka.ad_soyad AS atanan_ad, kk.ad_soyad AS karar_veren_ad, ko.ad_soyad AS olusturan_ad`;
const JOIN = `FROM onay o
  LEFT JOIN kullanici ka ON ka.id = o.atanan
  LEFT JOIN kullanici kk ON kk.id = o.karar_veren
  LEFT JOIN kullanici ko ON ko.id = o.olusturan`;

// GET /api/onaylar/kisiler?tur=IS_EMRI | ?rol=KALITE  -> onaya atanabilecek aktif kisiler
// Kisinin kendisi listede yer almaz (kendi kaydini onaylayamaz). tur verilirse yalnizca o turu onaylayabilenler.
router.get(
  "/kisiler",
  sar(async (req, res) => {
    const rol = req.query.rol ? d.secim(String(req.query.rol), "Rol", Object.values(ROLLER)) : null;
    const tur = req.query.tur ? d.secim(String(req.query.tur), "Tur", ONAY_TURU) : null;
    const roller = tur ? ONAYLAYABILIR[tur] || null : rol ? [rol] : null;
    const r = await pool.query(
      `SELECT id, ad_soyad, roller FROM kullanici
        WHERE firma_id = $1 AND aktif AND kullanici_adi IS NOT NULL AND id <> $3
          AND ($2::text[] IS NULL OR roller && $2 OR 'ADMIN' = ANY(roller))
          AND NOT (roller = ARRAY['DENETCI']::text[])
        ORDER BY ad_soyad`,
      [req.ctx.firmaId, roller, req.ctx.kullaniciId],
    );
    res.json(r.rows);
  }),
);

// GET /api/onaylar?benim=1&durum=BEKLIYOR,ASKIDA&tur=HAMMADDE  -> onay gorevleri
router.get(
  "/",
  sar(async (req, res) => {
    const durum = req.query.durum ? String(req.query.durum).split(",") : null;
    const tur = req.query.tur ? d.secim(String(req.query.tur), "Tur", ONAY_TURU) : null;
    const benim = d.bool(req.query.benim);
    const r = await pool.query(
      `SELECT ${SECIM} ${JOIN}
        WHERE o.firma_id = $1
          AND ($2::text[] IS NULL OR o.durum = ANY($2))
          AND ($3::text IS NULL OR o.kayit_turu = $3)
          AND ($4::uuid IS NULL OR o.atanan = $4)
        ORDER BY o.olusturma_zamani DESC LIMIT 300`,
      [req.ctx.firmaId, durum, tur, benim ? req.ctx.kullaniciId : null],
    );
    res.json(r.rows);
  }),
);

// POST /api/onaylar/:id/karar  { durum: ONAYLANDI | ASKIDA | REDDEDILDI, not }
// Hammaddede karar giris kontrolunu de uygular: Onayla = Kabul, Askiya al = Karantina, Reddet = Ret.
router.post(
  "/:id/karar",
  sar(async (req, res) => {
    const durum = d.secim(req.body.durum, "Karar", [O.ONAYLANDI, O.ASKIDA, O.REDDEDILDI]);
    const not = d.metin(req.body.not, "Aciklama", { zorunlu: durum !== O.ONAYLANDI, max: 1000 });
    const sonuc = await tx(async (c) => {
      const o = await bir(c, "SELECT * FROM onay WHERE id = $1 AND firma_id = $2 FOR UPDATE", [d.metin(req.params.id, "Onay", { max: 40 }), req.ctx.firmaId]);
      if (!o) throw hatalar.bulunamadi("Onay kaydi bulunamadi");
      if (o.kayit_turu === "SEVKIYAT" && durum === O.ONAYLANDI) {
        // Bos ya da icerigi belli olmayan sevkiyat onaylanamaz: onay, okutulan parcalarin listesine verilir
        const sv = await bir(
          c,
          `SELECT s.durum, (SELECT count(*) FROM sevkiyat_satiri ss WHERE ss.sevkiyat_id = s.id) AS n
             FROM sevkiyat s WHERE s.firma_id = $1 AND s.no = $2`,
          [req.ctx.firmaId, o.kayit_no],
        );
        if (!sv || sv.durum !== "HAZIRLANIYOR") throw hatalar.engel("Sevkiyat hazirlanmiyor, onaylanamaz", "YANLIS_DURUM");
        if (!sv.n) throw hatalar.engel("Sevkiyatta henuz parca yok. Once parcalar okutulmali, sonra onaylanir.", "BOS_SEVKIYAT");
      }
      if (o.kayit_turu === "IS_EMRI" && durum === O.ONAYLANDI) {
        const ie = await bir(c, "SELECT durum FROM is_emri WHERE firma_id = $1 AND no = $2", [req.ctx.firmaId, o.kayit_no]);
        if (!ie || ie.durum === "IPTAL") throw hatalar.engel("Iptal edilmis is emri onaylanamaz", "YANLIS_DURUM");
      }
      const g = await onayKarari(c, req.ctx, o, durum, not, req.kullanici.roller);
      if (o.kayit_turu === "HAMMADDE") {
        await hammaddeKarari(c, req.ctx, o.kayit_no, ONAY_KARAR[durum], not, { onayiEsitle: false });
      }
      return bir(c, `SELECT ${SECIM} ${JOIN} WHERE o.id = $1`, [g.id]);
    });
    res.json(sonuc);
  }),
);

module.exports = router;
