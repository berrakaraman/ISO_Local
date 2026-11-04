// Kalite: karantina karari, son kontrol, bloke, etkilenenleri bulma (bolum 7.4, 9.1, 13.3)
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { barkodCoz } = require("../lib/barkod");
const { ROLLER, BIRIM_DURUM: D, OLAY } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { altNumara } = require("../services/numara");
const { olayYaz, birimDurumu, izYaz } = require("../services/iz");
const { etiketBas } = require("../services/etiket");
const { birimBul, birimOlustur, bagla, birimGuncelle } = require("../services/birim");

const router = express.Router();

// GET /api/kalite/bekleyenler  -> kalite ekranindaki "bekleyen isler" sayilari ve listeleri
router.get(
  "/bekleyenler",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const [ilkParca, karantina, sonKontrol, hammadde] = await Promise.all([
      pool.query(
        `SELECT ie.no, ie.baslangic, u.kod AS urun_kod, u.ad AS urun_ad, m.kod AS makine_kod
           FROM is_emri ie JOIN urun u ON u.id = ie.urun_id JOIN makine m ON m.id = ie.makine_id
          WHERE ie.firma_id = $1 AND ie.durum = 'ILK_PARCA_BEKLIYOR' ORDER BY ie.baslangic`,
        [F],
      ),
      pool.query(
        `SELECT b.barkod, b.ilk_miktar, b.olcu_birimi, b.durum, b.ek, b.olusturma_zamani, ie.no AS is_emri_no, m.kod AS makine_kod, l.no AS lot_no
           FROM birim b LEFT JOIN is_emri ie ON ie.id = b.is_emri_id LEFT JOIN makine m ON m.id = b.makine_id LEFT JOIN lot l ON l.id = b.lot_id
          WHERE b.firma_id = $1 AND b.tip = 'KR' AND b.durum IN ('KARAR_BEKLIYOR','YENIDEN_ISLEME') ORDER BY b.olusturma_zamani`,
        [F],
      ),
      pool.query(
        `SELECT l.no AS lot_no, u.kod AS urun_kod, count(*) AS parca, sum(b.miktar) AS toplam, min(b.olusturma_zamani) AS en_eski
           FROM birim b JOIN lot l ON l.id = b.lot_id JOIN urun u ON u.id = b.urun_id
          WHERE b.firma_id = $1 AND b.tip = 'FG' AND b.durum = 'KALITE_BEKLIYOR'
          GROUP BY l.no, u.kod ORDER BY en_eski`,
        [F],
      ),
      pool.query(
        `SELECT l.no AS lot_no, m.kod AS malzeme_kod, m.ad AS malzeme_ad, t.unvan AS tedarikci, l.tedarikci_lot, l.olusturma_zamani
           FROM lot l JOIN malzeme m ON m.id = l.malzeme_id LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
          WHERE l.firma_id = $1 AND l.tip = 'RM' AND l.durum = 'KONTROL_BEKLIYOR' ORDER BY l.olusturma_zamani`,
        [F],
      ),
    ]);
    res.json({
      ilkParca: ilkParca.rows,
      karantina: karantina.rows,
      sonKontrol: sonKontrol.rows,
      hammaddeKontrol: hammadde.rows,
    });
  }),
);

// POST /api/kalite/karantina/:barkod/karar  { karar: OLUMLU|YENIDEN_ISLEME|HURDA|SARTLI_KABUL, not? }
router.post(
  "/karantina/:barkod/karar",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const karar = d.secim(req.body.karar, "Karar", [D.OLUMLU, D.YENIDEN_ISLEME, D.HURDA, D.SARTLI_KABUL]);
    const not = d.metin(req.body.not, "Not", { zorunlu: karar === D.SARTLI_KABUL || karar === D.HURDA, max: 1000 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const kr = await birimBul(c, F, req.params.barkod, { tipler: ["KR"] });
      if (![D.KARAR_BEKLIYOR, D.YENIDEN_ISLEME].includes(kr.durum)) throw hatalar.engel(`${kr.barkod} icin zaten karar verilmis (${kr.durum})`, "YANLIS_DURUM");
      if (karar === D.YENIDEN_ISLEME && kr.durum === D.YENIDEN_ISLEME) throw hatalar.engel("Parca zaten yeniden islemede", "YANLIS_DURUM");

      let yeniBirim = null;
      let etiket = null;
      if (karar === D.OLUMLU || karar === D.SARTLI_KABUL) {
        if (!kr.lot_id) throw hatalar.engel("Bu karantina parcasinin topu henuz bitirilmemis. Once kioskta 'Topu Bitir' yapilmali.", "LOT_YOK");
        // Parca satilabilir hale gelir: ayni lot altinda yeni FG numarasi, KR ile baglanir (bolum 10.1 kural 5)
        const { barkod, sira } = await altNumara(c, F, kr.lot_no);
        yeniBirim = await birimOlustur(c, req.ctx, {
          barkod, sira, tip: "FG", lotId: kr.lot_id, urunId: kr.urun_id, isEmriId: kr.is_emri_id, makineId: kr.makine_id,
          miktar: kr.miktar, olcuBirimi: kr.olcu_birimi, durum: D.SERBEST, yer: "KARANTINA", kaynakBirimId: kr.id,
          ek: karar === D.SARTLI_KABUL ? { sartliKabul: true, not } : {},
        });
        await bagla(c, req.ctx, kr.id, yeniBirim.id, "YENIDEN_ETIKET", kr.miktar);
        await olayYaz(c, req.ctx, { tip: OLAY.YENIDEN_ETIKET, birimId: kr.id, karsiBirimId: yeniBirim.id, miktar: kr.miktar, olcuBirimi: kr.olcu_birimi });
        etiket = await etiketBas(c, req.ctx, yeniBirim.id);
        await birimGuncelle(c, req.ctx, kr.id, { miktar: 0 });
      }
      if (karar === D.HURDA) {
        await olayYaz(c, req.ctx, { tip: OLAY.HURDA, birimId: kr.id, miktar: kr.miktar, olcuBirimi: kr.olcu_birimi, aciklama: not });
        await birimGuncelle(c, req.ctx, kr.id, { miktar: 0 });
      }
      await birimDurumu(c, req.ctx, kr, karar, { olayTipi: OLAY.KARANTINA_KARARI, aciklama: not, gerekce: not, veri: { yeniBarkod: yeniBirim?.barkod } });
      return { barkod: kr.barkod, karar, yeniBirim, etiket };
    });
    res.json(sonuc);
  }),
);

// POST /api/kalite/son-kontrol  { barkodlar: [...] | lotNo, karar: SERBEST|KARANTINA|RET, not? }  (bolum 9.1)
router.post(
  "/son-kontrol",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const karar = d.secim(req.body.karar, "Karar", [D.SERBEST, D.KARANTINA, D.RET]);
    const not = d.metin(req.body.not, "Not", { zorunlu: karar !== D.SERBEST, max: 1000 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      let birimler;
      if (req.body.lotNo) {
        const r = await c.query(
          `SELECT b.* FROM birim b JOIN lot l ON l.id = b.lot_id WHERE b.firma_id = $1 AND l.no = $2 AND b.tip = 'FG' AND b.durum = 'KALITE_BEKLIYOR' FOR UPDATE OF b`,
          [F, String(req.body.lotNo).toUpperCase()],
        );
        birimler = r.rows;
        if (!birimler.length) throw hatalar.bulunamadi("Bu lotta kalite bekleyen parca yok");
      } else {
        birimler = [];
        for (const bk of d.dizi(req.body.barkodlar, "Barkodlar")) birimler.push(await birimBul(c, F, bk, { tipler: ["FG"] }));
      }
      const izinli = karar === D.SERBEST ? [D.KALITE_BEKLIYOR, D.KARANTINA] : [D.KALITE_BEKLIYOR, D.SERBEST, D.DEPODA];
      for (const b of birimler) {
        if (!izinli.includes(b.durum)) throw hatalar.engel(`${b.barkod} icin bu karar verilemez (durum: ${b.durum})`, "YANLIS_DURUM");
      }
      for (const b of birimler) {
        await birimDurumu(c, req.ctx, b, karar, { olayTipi: OLAY.SON_KONTROL, aciklama: not, gerekce: not });
        if (karar === D.RET) await olayYaz(c, req.ctx, { tip: OLAY.HURDA, birimId: b.id, miktar: b.miktar, olcuBirimi: b.olcu_birimi, aciklama: `Son kontrol reddi: ${not}` });
      }
      return { karar, sayi: birimler.length, barkodlar: birimler.map((b) => b.barkod) };
    });
    res.json(sonuc);
  }),
);

// GET /api/kalite/etkilenenler?makine=OR03&baslangic=2026-10-03T15:20&bitis=2026-10-03T15:55
// Belirli makinede belirli zaman araliginda uretilen toplar ve onlardan cikan parcalar (sunum sayfa 12)
router.get(
  "/etkilenenler",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const makine = d.kod(req.query.makine, "Makine");
    const baslangic = d.metin(req.query.baslangic, "Baslangic");
    const bitis = d.metin(req.query.bitis, "Bitis");
    const r = await pool.query(
      `WITH toplar AS (
         SELECT b.* FROM birim b JOIN makine m ON m.id = b.makine_id
          WHERE b.firma_id = $1 AND m.kod = $2 AND b.tip = 'FG_LOT'
            AND COALESCE((b.ek->>'baslangic')::timestamptz, b.olusturma_zamani) <= $4::timestamptz
            AND b.olusturma_zamani >= $3::timestamptz)
       SELECT x.id, x.barkod, x.tip, x.miktar, x.ilk_miktar, x.olcu_birimi, x.durum, x.bloke, l.no AS lot_no,
              s.no AS sevkiyat_no, mu.unvan AS musteri, s.onay_zamani AS sevk_zamani
         FROM birim x
         JOIN lot l ON l.id = x.lot_id
         LEFT JOIN sevkiyat_satiri ss ON ss.birim_id = x.id
         LEFT JOIN sevkiyat s ON s.id = ss.sevkiyat_id
         LEFT JOIN musteri mu ON mu.id = s.musteri_id
        WHERE x.lot_id IN (SELECT lot_id FROM toplar) AND x.tip IN ('FG_LOT','FG','KR','NM') AND x.durum <> 'BOLUNDU'
        ORDER BY l.no, x.sira NULLS FIRST`,
      [F, makine, baslangic, bitis],
    );
    const sevkEdilen = r.rows.filter((x) => x.durum === D.SEVK_EDILDI);
    res.json({
      birimler: r.rows,
      ozet: {
        lotSayisi: new Set(r.rows.map((x) => x.lotNo || x.lot_no)).size,
        birimSayisi: r.rows.length,
        sevkEdilen: sevkEdilen.length,
        musteriler: [...new Set(sevkEdilen.map((x) => x.musteri))],
      },
    });
  }),
);

// POST /api/kalite/bloke  { barkodlar: [...], neden }
router.post(
  "/bloke",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const neden = d.metin(req.body.neden, "Neden", { max: 1000 });
    const barkodlar = d.dizi(req.body.barkodlar, "Barkodlar", { min: 1, max: 2000 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const bloke = await bir(c, "INSERT INTO bloke (firma_id, neden, acan) VALUES ($1,$2,$3) RETURNING *", [F, neden, req.ctx.kullaniciId]);
      const sevkEdilen = [];
      let sayi = 0;
      for (const bk of barkodlar) {
        const b = await birimBul(c, F, bk);
        await c.query("INSERT INTO bloke_birim (bloke_id, birim_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [bloke.id, b.id]);
        if (b.durum === D.SEVK_EDILDI) sevkEdilen.push(b.barkod);
        if (!b.bloke) {
          await birimGuncelle(c, req.ctx, b.id, { bloke: true });
          await izYaz(c, req.ctx, { tablo: "birim", kayitId: b.id, islem: "DURUM", degisiklikler: [{ alan: "bloke", eski: "false", yeni: "true" }], gerekce: neden });
          await olayYaz(c, req.ctx, { tip: OLAY.BLOKE, birimId: b.id, aciklama: neden, veri: { blokeId: bloke.id } });
          sayi++;
        }
      }
      return { bloke, blokeEdilen: sayi, sevkEdilmisOlanlar: sevkEdilen };
    });
    res.status(201).json(sonuc);
  }),
);

// POST /api/kalite/bloke/:id/kaldir  { gerekce }
router.post(
  "/bloke/:id/kaldir",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const gerekce = d.metin(req.body.gerekce, "Gerekce", { max: 1000 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const bloke = await bir(c, "SELECT * FROM bloke WHERE id = $1 AND firma_id = $2 FOR UPDATE", [req.params.id, F]);
      if (!bloke) throw hatalar.bulunamadi("Bloke kaydi bulunamadi");
      if (bloke.kapanma_zamani) throw hatalar.engel("Bu bloke zaten kaldirilmis", "YANLIS_DURUM");
      await c.query("UPDATE bloke SET kapatan = $1, kapanma_zamani = now() WHERE id = $2", [req.ctx.kullaniciId, bloke.id]);
      // Baska acik bir blokesi olmayan birimlerin blokesi kalkar
      const r = await c.query(
        `SELECT b.* FROM bloke_birim bb JOIN birim b ON b.id = bb.birim_id
          WHERE bb.bloke_id = $1 AND NOT EXISTS (
            SELECT 1 FROM bloke_birim x JOIN bloke y ON y.id = x.bloke_id
             WHERE x.birim_id = b.id AND y.id <> $1 AND y.kapanma_zamani IS NULL)`,
        [bloke.id],
      );
      for (const b of r.rows) {
        await birimGuncelle(c, req.ctx, b.id, { bloke: false });
        await izYaz(c, req.ctx, { tablo: "birim", kayitId: b.id, islem: "DURUM", degisiklikler: [{ alan: "bloke", eski: "true", yeni: "false" }], gerekce });
        await olayYaz(c, req.ctx, { tip: OLAY.BLOKE_KALDIRMA, birimId: b.id, aciklama: gerekce });
      }
      return { blokeId: bloke.id, kaldirilan: r.rows.length };
    });
    res.json(sonuc);
  }),
);

// GET /api/kalite/blokeler?acik=1
router.get(
  "/blokeler",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT bl.*, a.ad_soyad AS acan_ad, k.ad_soyad AS kapatan_ad, count(bb.*) AS birim_sayisi
         FROM bloke bl LEFT JOIN kullanici a ON a.id = bl.acan LEFT JOIN kullanici k ON k.id = bl.kapatan
         LEFT JOIN bloke_birim bb ON bb.bloke_id = bl.id
        WHERE bl.firma_id = $1 AND ($2::boolean IS NOT TRUE OR bl.kapanma_zamani IS NULL)
        GROUP BY bl.id, a.ad_soyad, k.ad_soyad ORDER BY bl.acilma_zamani DESC`,
      [req.ctx.firmaId, req.query.acik === "1"],
    );
    res.json(r.rows);
  }),
);

// POST /api/kalite/hurda  { barkod, miktar?, neden }  -> hammadde ya da parcanin dogrudan hurdasi
router.post(
  "/hurda",
  rol(ROLLER.KALITE, ROLLER.SEF),
  sar(async (req, res) => {
    const neden = d.metin(req.body.neden, "Neden", { max: 1000 });
    const sonuc = await tx(async (c) => {
      const b = await birimBul(c, req.ctx.firmaId, barkodCoz(req.body.barkod), { tipler: ["RM", "WIP", "FG"] });
      const miktar = req.body.miktar === undefined ? b.miktar : d.sayi(req.body.miktar, "Miktar", { pozitif: true });
      if (miktar > b.miktar) throw hatalar.gecersiz(`Mevcut miktar ${b.miktar} ${b.olcu_birimi}`);
      await olayYaz(c, req.ctx, { tip: OLAY.HURDA, birimId: b.id, miktar, olcuBirimi: b.olcu_birimi, aciklama: neden });
      const kalan = b.miktar - miktar;
      await birimGuncelle(c, req.ctx, b.id, { miktar: kalan });
      if (kalan === 0) await birimDurumu(c, req.ctx, b, D.HURDA, { gerekce: neden });
      return { barkod: b.barkod, hurda: miktar, kalan };
    });
    res.json(sonuc);
  }),
);

// GET /api/kalite/karantinalar  -> F-04: tum karantina parcalari, kim ayirdi, kim karar verdi
router.get(
  "/karantinalar",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT b.barkod, b.ilk_miktar, b.olcu_birimi, b.durum, b.ek, b.olusturma_zamani,
              u.kod AS urun_kod, l.no AS lot_no, ie.no AS is_emri_no, m.kod AS makine_kod,
              ko.ad_soyad AS kaydeden_ad, ko.sicil_no AS kaydeden_sicil,
              kr.zaman AS karar_zamani, kr.aciklama AS karar_notu, kk.ad_soyad AS karar_veren_ad,
              kr.veri->>'yeniBarkod' AS yeni_barkod
         FROM birim b
         LEFT JOIN urun u ON u.id = b.urun_id
         LEFT JOIN lot l ON l.id = b.lot_id
         LEFT JOIN is_emri ie ON ie.id = b.is_emri_id
         LEFT JOIN makine m ON m.id = b.makine_id
         LEFT JOIN kullanici ko ON ko.id = b.olusturan
         LEFT JOIN LATERAL (
           SELECT o.* FROM olay o WHERE o.birim_id = b.id AND o.tip = 'KARANTINA_KARARI' ORDER BY o.zaman DESC LIMIT 1) kr ON true
         LEFT JOIN kullanici kk ON kk.id = kr.kullanici_id
        WHERE b.firma_id = $1 AND b.tip = 'KR'
        ORDER BY b.olusturma_zamani DESC LIMIT 1000`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

// GET /api/kalite/kontroller  -> F-05: olcumler (ilk parca, metraj) + son kontrol kararlari, kim yapti
router.get(
  "/kontroller",
  sar(async (req, res) => {
    const r = await pool.query(
      `SELECT * FROM (
         SELECT 'O' || o.id AS anahtar, o.zaman, o.asama AS tur, k.ad AS parametre,
                k.alt_sinir, k.ust_sinir, k.nominal, k.olcu_birimi, o.deger::text AS deger, o.sonuc, o.deneme_no,
                ie.no AS is_emri_no, mk.kod AS makine_kod, u.kod AS urun_kod, COALESCE(l.no, lf.no) AS lot_no,
                b.barkod AS barkod, kul.ad_soyad AS kontrol_eden, NULL::text AS aciklama
           FROM olcum o
           LEFT JOIN karakteristik k ON k.id = o.karakteristik_id
           LEFT JOIN is_emri ie ON ie.id = o.is_emri_id
           LEFT JOIN makine mk ON mk.id = ie.makine_id
           LEFT JOIN urun u ON u.id = COALESCE(k.urun_id, ie.urun_id)
           LEFT JOIN birim b ON b.id = o.birim_id
           LEFT JOIN lot l ON l.id = b.lot_id
           LEFT JOIN LATERAL (SELECT no FROM lot WHERE is_emri_id = ie.id AND tip = 'FG' AND o.birim_id IS NULL ORDER BY olusturma_zamani LIMIT 1) lf ON true
           LEFT JOIN kullanici kul ON kul.id = o.kullanici_id
          WHERE o.firma_id = $1
         UNION ALL
         SELECT 'S' || min(o.id), min(o.zaman), 'SON_KONTROL', 'Lot serbest bırakma (' || count(*) || ' parça)',
                NULL, NULL, NULL, NULL, o.veri->>'yeni',
                CASE WHEN o.veri->>'yeni' = 'SERBEST' THEN 'UYGUN' WHEN o.veri->>'yeni' = 'RET' THEN 'UYGUN_DEGIL' ELSE 'SARTLI' END,
                NULL, ie.no, mk.kod, u.kod, l.no, NULL, kul.ad_soyad, max(o.aciklama)
           FROM olay o
           JOIN birim b ON b.id = o.birim_id
           JOIN lot l ON l.id = b.lot_id
           LEFT JOIN is_emri ie ON ie.id = l.is_emri_id
           LEFT JOIN makine mk ON mk.id = ie.makine_id
           LEFT JOIN urun u ON u.id = b.urun_id
           LEFT JOIN kullanici kul ON kul.id = o.kullanici_id
          WHERE o.firma_id = $1 AND o.tip = 'SON_KONTROL'
          GROUP BY l.no, ie.no, mk.kod, u.kod, kul.ad_soyad, o.veri->>'yeni', date_trunc('minute', o.zaman)
       ) x ORDER BY zaman DESC LIMIT 1000`,
      [req.ctx.firmaId],
    );
    res.json(r.rows);
  }),
);

module.exports = router;
