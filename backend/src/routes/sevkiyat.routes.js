// Sevkiyat (bolum 9.3, 9.4, 17.1)
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER, BIRIM_DURUM: D, OLAY } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { yeniNumara } = require("../services/numara");
const { olayYaz, birimDurumu, izYaz } = require("../services/iz");
const { onayOlustur, onayKontrol, onaySifirla, onayEsitle } = require("../services/onay");
const { yuvarla } = require("../lib/miktar");
const { birimBul, birimGuncelle, blokeKontrol, firmaAyarlari } = require("../services/birim");

const router = express.Router();

async function sevkiyatBul(c, F, no, kilit = true) {
  const s = await bir(
    c,
    `SELECT s.*, mu.unvan AS musteri, mu.crm_ref, u.kod AS urun_kod
       FROM sevkiyat s JOIN musteri mu ON mu.id = s.musteri_id LEFT JOIN urun u ON u.id = s.urun_id
      WHERE s.firma_id = $1 AND s.no = $2 ${kilit ? "FOR UPDATE OF s" : ""}`,
    [F, String(no).toUpperCase()],
  );
  if (!s) throw hatalar.bulunamadi("Sevkiyat bulunamadi");
  return s;
}

async function satirlar(c, sevkiyatId) {
  const r = await c.query(
    `SELECT ss.id, ss.miktar, ss.zaman, b.barkod, b.olcu_birimi, b.durum, l.no AS lot_no, u.kod AS urun_kod
       FROM sevkiyat_satiri ss JOIN birim b ON b.id = ss.birim_id JOIN lot l ON l.id = b.lot_id JOIN urun u ON u.id = b.urun_id
      WHERE ss.sevkiyat_id = $1 ORDER BY ss.zaman`,
    [sevkiyatId],
  );
  return r.rows;
}

// POST /api/sevkiyat  { musteriId, urunId?, siparisNo?, irsaliyeNo? }
router.post(
  "/",
  rol(ROLLER.DEPO, ROLLER.SEF),
  sar(async (req, res) => {
    const b = req.body;
    const musteriId = d.metin(b.musteriId, "Musteri", { max: 40 });
    const s = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const mu = await bir(c, "SELECT 1 FROM musteri WHERE id = $1 AND firma_id = $2 AND aktif", [musteriId, F]);
      if (!mu) throw hatalar.gecersiz("Musteri bulunamadi");
      if (b.urunId) {
        const ur = await bir(c, "SELECT 1 FROM urun WHERE id = $1 AND firma_id = $2", [b.urunId, F]);
        if (!ur) throw hatalar.gecersiz("Urun bulunamadi");
      }
      const ayar = await firmaAyarlari(c, F);
      const atananId = d.metin(b.atananId, "Sevkiyati onaylayacak kisi", { zorunlu: ayar.sevkiyatOnayZorunlu !== false, max: 40 });
      const no = await yeniNumara(c, F, "SV", ayar.saatDilimi);
      const yeni = await bir(
        c,
        `INSERT INTO sevkiyat (firma_id, no, musteri_id, urun_id, siparis_no, irsaliye_no, olusturan)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [F, no, musteriId, b.urunId || null, d.metin(b.siparisNo, "Siparis no", { zorunlu: false, max: 60 }),
          d.metin(b.irsaliyeNo, "Irsaliye no", { zorunlu: false, max: 60 }), req.ctx.kullaniciId],
      );
      const musteri = await bir(c, "SELECT unvan FROM musteri WHERE id = $1", [musteriId]);
      await izYaz(c, req.ctx, {
        tablo: "sevkiyat", kayitId: yeni.id, islem: "EKLEME",
        degisiklikler: [{ alan: "sevkiyat", eski: null, yeni: `${no} - ${musteri.unvan}${yeni.siparis_no ? ` / siparis ${yeni.siparis_no}` : ""}` }],
      });
      yeni.onay = atananId ? await onayOlustur(c, req.ctx, { kayitTuru: "SEVKIYAT", kayitNo: no, atananId }) : null;
      return yeni;
    });
    res.status(201).json(s);
  }),
);

// GET /api/sevkiyat?durum=HAZIRLANIYOR
router.get(
  "/",
  sar(async (req, res) => {
    const durum = req.query.durum ? String(req.query.durum).split(",") : null;
    const r = await pool.query(
      `SELECT s.*, mu.unvan AS musteri, u.kod AS urun_kod,
              x.birim_sayisi, x.toplam_miktar, x.olcu_birimi, x.lotlar, x.urunler,
              ko.ad_soyad AS olusturan_ad, kn.ad_soyad AS onaylayan_ad, ki.ad_soyad AS iptal_eden_ad,
              o.id AS onay_id, o.durum AS onay_durum, o.atanan AS onay_atanan_id, ka.ad_soyad AS onay_atanan_ad,
              o.karar_zamani AS onay_karar_zamani, o.karar_notu AS onay_karar_notu, kk.ad_soyad AS onay_karar_veren_ad
         FROM sevkiyat s JOIN musteri mu ON mu.id = s.musteri_id LEFT JOIN urun u ON u.id = s.urun_id
         LEFT JOIN LATERAL (
           SELECT count(*) AS birim_sayisi, COALESCE(sum(ss.miktar), 0) AS toplam_miktar, min(b.olcu_birimi) AS olcu_birimi,
                  string_agg(DISTINCT l.no, ', ') AS lotlar, string_agg(DISTINCT ur.kod, ', ') AS urunler
             FROM sevkiyat_satiri ss JOIN birim b ON b.id = ss.birim_id LEFT JOIN lot l ON l.id = b.lot_id LEFT JOIN urun ur ON ur.id = b.urun_id
            WHERE ss.sevkiyat_id = s.id) x ON true
         LEFT JOIN kullanici ko ON ko.id = s.olusturan
         LEFT JOIN kullanici kn ON kn.id = s.onaylayan
         LEFT JOIN kullanici ki ON ki.id = s.iptal_eden
         LEFT JOIN onay o ON o.firma_id = s.firma_id AND o.kayit_turu = 'SEVKIYAT' AND o.kayit_no = s.no
         LEFT JOIN kullanici ka ON ka.id = o.atanan
         LEFT JOIN kullanici kk ON kk.id = o.karar_veren
        WHERE s.firma_id = $1 AND ($2::text[] IS NULL OR s.durum = ANY($2))
        ORDER BY s.olusturma_zamani DESC LIMIT 300`,
      [req.ctx.firmaId, durum],
    );
    res.json(r.rows);
  }),
);

router.get(
  "/:no",
  sar(async (req, res) => {
    const s = await sevkiyatBul(pool, req.ctx.firmaId, req.params.no, false);
    res.json({ sevkiyat: s, satirlar: await satirlar(pool, s.id) });
  }),
);

// POST /api/sevkiyat/:no/okut  { barkod }  -> yuklenen parcayi kontrol edip sevkiyata ekler (cift kontrol)
router.post(
  "/:no/okut",
  rol(ROLLER.DEPO, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const s = await sevkiyatBul(c, F, req.params.no);
      if (s.durum !== "HAZIRLANIYOR") throw hatalar.engel("Bu sevkiyat kapanmis", "YANLIS_DURUM");
      const b = await birimBul(c, F, req.body.barkod, { tipler: ["FG"] });
      blokeKontrol(b);
      if (![D.SERBEST, D.DEPODA, D.SIPARISE_AYRILDI].includes(b.durum)) {
        throw hatalar.engel(`${b.barkod} sevk edilemez (durum: ${b.durum}). Yalnizca kaliteden serbest birakilmis parcalar sevk edilir.`, "SERBEST_DEGIL");
      }
      if (s.urun_id && b.urun_id !== s.urun_id) throw hatalar.engel(`${b.barkod} bu sevkiyatin urunu (${s.urun_kod}) degil`, "YANLIS_URUN");
      const baska = await bir(
        c,
        `SELECT s.no FROM sevkiyat_satiri ss JOIN sevkiyat s ON s.id = ss.sevkiyat_id WHERE ss.birim_id = $1 AND s.durum = 'HAZIRLANIYOR'`,
        [b.id],
      );
      if (baska) throw hatalar.engel(`${b.barkod} zaten ${baska.no} sevkiyatinda`, "ZATEN_EKLI");
      await c.query("INSERT INTO sevkiyat_satiri (firma_id, sevkiyat_id, birim_id, miktar) VALUES ($1,$2,$3,$4)", [F, s.id, b.id, b.miktar]);
      await birimGuncelle(c, req.ctx, b.id, { yer: `SEVK:${s.no}`, ek: { ...b.ek, oncekiDurum: b.durum, oncekiYer: b.yer } });
      if (b.durum !== D.SIPARISE_AYRILDI) await birimDurumu(c, req.ctx, b, D.SIPARISE_AYRILDI, { olayTipi: OLAY.SIPARISE_AYIRMA, aciklama: s.no });
      // Onaylanmis yuke parca eklenirse onay gecersiz olur: onaylayan, yukun son halini gormeli
      const onaySifirlandi = await onaySifirla(c, req.ctx, "SEVKIYAT", s.no, `${b.barkod} eklendi, yuk degisti; yeniden onay gerekli`);
      const liste = await satirlar(c, s.id);
      return { eklenen: b.barkod, birimSayisi: liste.length, toplam: yuvarla(liste.reduce((a, x) => a + x.miktar, 0)), satirlar: liste, onaySifirlandi };
    });
    res.json(sonuc);
  }),
);

// POST /api/sevkiyat/:no/cikar  { barkod }  -> yanlislikla okutulan parcayi taslak sevkiyattan cikarir
router.post(
  "/:no/cikar",
  rol(ROLLER.DEPO, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const s = await sevkiyatBul(c, F, req.params.no);
      if (s.durum !== "HAZIRLANIYOR") throw hatalar.engel("Bu sevkiyat kapanmis", "YANLIS_DURUM");
      const b = await birimBul(c, F, req.body.barkod);
      // Satir silinmez: "cikarildi" olarak isaretlenir (kim, ne zaman). Listede artik gorunmez.
      const r = await c.query(
        `UPDATE sevkiyat_satiri_kayit SET cikarma_zamani = now(), cikaran = $3
          WHERE sevkiyat_id = $1 AND birim_id = $2 AND cikarma_zamani IS NULL`,
        [s.id, b.id, req.ctx.kullaniciId],
      );
      if (!r.rowCount) throw hatalar.bulunamadi(`${b.barkod} bu sevkiyatta yok`);
      const onceki = b.ek?.oncekiDurum || D.SERBEST;
      await birimGuncelle(c, req.ctx, b.id, { yer: b.ek?.oncekiYer || null });
      await birimDurumu(c, req.ctx, b, onceki, { olayTipi: OLAY.SIPARISE_AYIRMA, aciklama: `${s.no} sevkiyatindan cikarildi` });
      const onaySifirlandi = await onaySifirla(c, req.ctx, "SEVKIYAT", s.no, `${b.barkod} cikarildi, yuk degisti; yeniden onay gerekli`);
      return { cikarilan: b.barkod, satirlar: await satirlar(c, s.id), onaySifirlandi };
    });
    res.json(sonuc);
  }),
);

// POST /api/sevkiyat/:no/onayla  { irsaliyeNo }
router.post(
  "/:no/onayla",
  rol(ROLLER.DEPO, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const s = await sevkiyatBul(c, F, req.params.no);
      if (s.durum !== "HAZIRLANIYOR") throw hatalar.engel("Bu sevkiyat zaten kapanmis", "YANLIS_DURUM");
      const ayar = await firmaAyarlari(c, F);
      await onayKontrol(c, F, "SEVKIYAT", s.no, { zorunlu: ayar.sevkiyatOnayZorunlu !== false, islem: "sevk edilemez" });
      const irsaliyeNo = d.metin(req.body.irsaliyeNo ?? s.irsaliye_no, "Irsaliye no", { max: 60 });
      const liste = await satirlar(c, s.id);
      if (!liste.length) throw hatalar.engel("Sevkiyatta hic parca yok", "BOS_SEVKIYAT");
      for (const sat of liste) {
        const b = await birimBul(c, F, sat.barkod);
        blokeKontrol(b); // okutulduktan sonra bloke edilmis olabilir
        await birimDurumu(c, req.ctx, b, D.SEVK_EDILDI);
        await olayYaz(c, req.ctx, {
          tip: OLAY.SEVKIYAT, birimId: b.id, miktar: b.miktar, olcuBirimi: b.olcu_birimi,
          aciklama: `${s.no} - ${s.musteri}`, veri: { sevkiyatNo: s.no, musteri: s.musteri, irsaliyeNo },
        });
      }
      const g = await bir(
        c,
        "UPDATE sevkiyat SET durum = 'SEVK_EDILDI', irsaliye_no = $1, onay_zamani = now(), onaylayan = $3 WHERE id = $2 RETURNING *",
        [irsaliyeNo, s.id, req.ctx.kullaniciId],
      );
      await izYaz(c, req.ctx, {
        tablo: "sevkiyat", kayitId: s.id, islem: "DURUM",
        degisiklikler: [{ alan: "durum", eski: "HAZIRLANIYOR", yeni: "SEVK_EDILDI" }], gerekce: `Irsaliye ${irsaliyeNo}, ${liste.length} parca`,
      });
      // CRM'e gonderilmek uzere kuyruga yaz (bolum 17.1)
      await c.query(
        `INSERT INTO entegrasyon_kuyrugu (firma_id, hedef, olay_tipi, veri) VALUES ($1,'CRM','SEVKIYAT_ONAYLANDI',$2)`,
        [F, {
          olayNo: `${s.no}-ONAY`,
          sevkiyatNo: s.no,
          musteri: s.musteri,
          musteriCrmRef: s.crm_ref,
          siparisNo: s.siparis_no,
          irsaliyeNo,
          tarih: new Date().toISOString(),
          satirlar: liste.map((x) => ({ barkod: x.barkod, lotNo: x.lot_no, urunKod: x.urun_kod, miktar: x.miktar, olcuBirimi: x.olcu_birimi })),
        }],
      );
      return { sevkiyat: g, satirSayisi: liste.length };
    });
    res.json(sonuc);
  }),
);

// POST /api/sevkiyat/:no/iptal  { gerekce }  -> hazirlanan sevkiyat iptal edilir; parcalar onceki yerine doner.
// Kayit silinmez: durum IPTAL olur; kim, ne zaman, neden saklanir.
router.post(
  "/:no/iptal",
  rol(ROLLER.DEPO, ROLLER.SEF),
  sar(async (req, res) => {
    const gerekce = d.metin(req.body.gerekce, "Iptal gerekcesi", { max: 1000 });
    if (gerekce.length < 5) throw hatalar.gecersiz("Iptal gerekcesi en az 5 karakter olmali");
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const s = await sevkiyatBul(c, F, req.params.no);
      if (s.durum !== "HAZIRLANIYOR") throw hatalar.engel("Yalnizca hazirlanan sevkiyat iptal edilebilir", "YANLIS_DURUM");
      const liste = await satirlar(c, s.id);
      for (const sat of liste) {
        const b = await birimBul(c, F, sat.barkod);
        await c.query(
          "UPDATE sevkiyat_satiri_kayit SET cikarma_zamani = now(), cikaran = $3 WHERE sevkiyat_id = $1 AND birim_id = $2 AND cikarma_zamani IS NULL",
          [s.id, b.id, req.ctx.kullaniciId],
        );
        await birimGuncelle(c, req.ctx, b.id, { yer: b.ek?.oncekiYer || null });
        await birimDurumu(c, req.ctx, b, b.ek?.oncekiDurum || D.SERBEST, { olayTipi: OLAY.SIPARISE_AYIRMA, aciklama: `${s.no} sevkiyati iptal edildi` });
      }
      await c.query("UPDATE sevkiyat SET durum = 'IPTAL', iptal_eden = $1, iptal_zamani = now(), iptal_gerekcesi = $2 WHERE id = $3", [req.ctx.kullaniciId, gerekce, s.id]);
      await izYaz(c, req.ctx, { tablo: "sevkiyat", kayitId: s.id, islem: "IPTAL", degisiklikler: [{ alan: "durum", eski: s.durum, yeni: "IPTAL" }], gerekce });
      // Bekleyen onay kapanir (iptal edilen sevkiyat kimsenin onay kutusunda kalmasin)
      await onayEsitle(c, req.ctx, "SEVKIYAT", s.no, "REDDEDILDI", `Kayit iptal edildi: ${gerekce}`);
      return { no: s.no, durum: "IPTAL", serbestBirakilan: liste.length };
    });
    res.json(sonuc);
  }),
);

module.exports = router;
