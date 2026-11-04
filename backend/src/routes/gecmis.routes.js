// "Kim ne yapti": bir form kaydinin tum gecmisi, isim isim.
// GET /api/gecmis/:tur/:no   tur: IS_EMRI | URETIM_LOT | KARANTINA | SEVKIYAT
// (Hammadde icin /api/hammadde/lotlar/:no/gecmis kullanilir.)
const express = require("express");
const { pool, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");

const router = express.Router();

// izler: [[tablo, kayitId], ...]  olay: { lotId, isEmriId, birimIds, haric }
async function gecmisGetir(F, izler, olay) {
  const r = await pool.query(
    `SELECT * FROM (
       SELECT i.zaman, 'IZ' AS kaynak, i.tablo, i.islem, i.alan, i.eski_deger, i.yeni_deger, i.gerekce,
              NULL::text AS tip, NULL::text AS barkod, NULL::numeric AS miktar, NULL::text AS olcu_birimi, NULL::text AS aciklama,
              k.ad_soyad AS kim, k.sicil_no, i.cihaz, i.id AS sira
         FROM degisiklik_izi i LEFT JOIN kullanici k ON k.id = i.kullanici_id
        WHERE i.firma_id = $1 AND (i.tablo, i.kayit_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))
       UNION ALL
       SELECT o.zaman, 'OLAY', NULL, NULL, NULL, NULL, NULL, NULL,
              o.tip, b.barkod, o.miktar, o.olcu_birimi, o.aciklama,
              k.ad_soyad, k.sicil_no, o.cihaz, o.id
         FROM olay o LEFT JOIN birim b ON b.id = o.birim_id LEFT JOIN kullanici k ON k.id = o.kullanici_id
        WHERE o.firma_id = $1
          AND (($4::uuid IS NOT NULL AND b.lot_id = $4) OR ($5::uuid IS NOT NULL AND o.is_emri_id = $5) OR o.birim_id = ANY($6::uuid[]))
          AND NOT (o.tip = ANY($7::text[]))
     ) x ORDER BY zaman, kaynak DESC, sira
     LIMIT 1000`,
    [F, izler.map((x) => x[0]), izler.map((x) => String(x[1])), olay.lotId || null, olay.isEmriId || null, olay.birimIds || [], olay.haric || []],
  );
  return r.rows;
}

async function onayId(F, tur, no) {
  const o = await bir(pool, "SELECT id FROM onay WHERE firma_id = $1 AND kayit_turu = $2 AND kayit_no = $3", [F, tur, no]);
  return o ? [["onay", o.id]] : [];
}

router.get(
  "/:tur/:no",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const no = String(req.params.no).toUpperCase();
    switch (req.params.tur) {
      case "IS_EMRI": {
        const ie = await bir(pool, "SELECT id FROM is_emri WHERE firma_id = $1 AND no = $2", [F, no]);
        if (!ie) throw hatalar.bulunamadi("Is emri bulunamadi");
        // Durum degisiklikleri izde var; olaydaki ayni kaydi tekrar gosterme
        return res.json(await gecmisGetir(F, [["is_emri", ie.id], ...(await onayId(F, "IS_EMRI", no))], { isEmriId: ie.id, haric: ["IS_EMRI_DURUM"] }));
      }
      case "URETIM_LOT": {
        const l = await bir(pool, "SELECT id FROM lot WHERE firma_id = $1 AND no = $2 AND tip = 'FG'", [F, no]);
        if (!l) throw hatalar.bulunamadi("Uretim lotu bulunamadi");
        return res.json(await gecmisGetir(F, [["lot", l.id]], { lotId: l.id }));
      }
      case "KARANTINA": {
        const b = await bir(pool, "SELECT id FROM birim WHERE firma_id = $1 AND barkod = $2 AND tip = 'KR'", [F, no]);
        if (!b) throw hatalar.bulunamadi("Karantina kaydi bulunamadi");
        return res.json(await gecmisGetir(F, [], { birimIds: [b.id] }));
      }
      case "SEVKIYAT": {
        const s = await bir(pool, "SELECT id FROM sevkiyat WHERE firma_id = $1 AND no = $2", [F, no]);
        if (!s) throw hatalar.bulunamadi("Sevkiyat bulunamadi");
        const birimler = await pool.query("SELECT DISTINCT birim_id FROM sevkiyat_satiri_kayit WHERE sevkiyat_id = $1", [s.id]);
        const satirlar = await gecmisGetir(F, [["sevkiyat", s.id], ...(await onayId(F, "SEVKIYAT", no))], {
          birimIds: birimler.rows.map((x) => x.birim_id),
        });
        // Parcalarin bu sevkiyatla ilgisiz eski olaylari (kesim, uretim...) karismasin
        return res.json(
          satirlar.filter(
            (x) =>
              x.kaynak === "IZ" ||
              (["SIPARISE_AYIRMA", "SEVKIYAT"].includes(x.tip) && String(x.aciklama || "").startsWith(no)) ||
              ["BLOKE", "BLOKE_KALDIRMA"].includes(x.tip),
          ),
        );
      }
      default:
        throw hatalar.bulunamadi("Bilinmeyen kayit turu");
    }
  }),
);

module.exports = router;
