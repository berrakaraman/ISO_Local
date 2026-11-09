// Hammadde: mal kabul, giris kontrolu, cekis, iade (bolum 6.1, 6.2)
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER, BIRIM_DURUM: D, OLAY } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { yeniNumara, altNumara } = require("../services/numara");
const { olayYaz, birimDurumu, izYaz } = require("../services/iz");
const { etiketBas } = require("../services/etiket");
const { birimBul, birimOlustur, bagla, birimGuncelle, blokeKontrol, firmaAyarlari } = require("../services/birim");
const { hammaddeBakiye } = require("../services/izlenebilirlik");
const { hammaddeKarari, hammaddeIptal } = require("../services/hammadde");
const { onayOlustur } = require("../services/onay");
const { yuvarla, sifirMi } = require("../lib/miktar");

const router = express.Router();

// POST /api/hammadde/kabul
// { malzemeId, tedarikciId, tedarikciLot, coaVar, ambalajlar: [25, 25, 25] | (ambalajSayisi + ambalajMiktari), depoYeri?, aciklama?,
//   atananId? }  -> atananId verilirse giris kontrolu icin o kisiye onay gorevi acilir (F-01 "Sorumlu")
router.post(
  "/kabul",
  rol(ROLLER.DEPO, ROLLER.KALITE),
  sar(async (req, res) => {
    const b = req.body;
    const malzemeId = d.metin(b.malzemeId, "Malzeme", { max: 40 });
    const tedarikciId = d.metin(b.tedarikciId, "Tedarikci", { max: 40 });
    const tedarikciLot = d.metin(b.tedarikciLot, "Tedarikci lot no", { max: 80 });
    let ambalajlar = b.ambalajlar;
    if (!ambalajlar && b.ambalajSayisi) {
      const sayi = d.sayi(b.ambalajSayisi, "Ambalaj sayisi", { min: 1, max: 200 });
      const miktar = d.sayi(b.ambalajMiktari, "Ambalaj miktari", { pozitif: true });
      ambalajlar = Array.from({ length: sayi }, () => miktar);
    }
    d.dizi(ambalajlar, "Ambalajlar", { min: 1, max: 200 });
    ambalajlar = ambalajlar.map((m, i) => d.sayi(m, `${i + 1}. ambalaj miktari`, { pozitif: true }));
    const depoYeri = b.depoYeri ? d.kod(b.depoYeri, "Depo yeri") : null;
    // Giris kontrolu her zaman kaliteye gider; atanan kisi formdaki "Sorumlu"dur (zorunlu)
    const atananId = d.metin(b.atananId, "Giris kontrolunu yapacak kalite sorumlusu", { max: 40 });
    const aciklama = d.metin(b.aciklama, "Aciklama", { zorunlu: false, max: 1000 });

    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const malzeme = await bir(c, "SELECT * FROM malzeme WHERE id = $1 AND firma_id = $2 AND aktif", [malzemeId, F]);
      if (!malzeme) throw hatalar.gecersiz("Malzeme bulunamadi veya pasif");
      const ted = await bir(c, "SELECT * FROM tedarikci WHERE id = $1 AND firma_id = $2 AND aktif", [tedarikciId, F]);
      if (!ted) throw hatalar.gecersiz("Tedarikci bulunamadi veya pasif");
      if (ted.onay_durumu === "ASKIDA") throw hatalar.engel(`${ted.unvan} askiya alinmis bir tedarikci, mal kabul yapilamaz`, "TEDARIKCI_ASKIDA");
      if (depoYeri) {
        const y = await bir(c, "SELECT 1 FROM depo_yeri WHERE firma_id = $1 AND kod = $2 AND aktif", [F, depoYeri]);
        if (!y) throw hatalar.gecersiz(`Depo yeri bulunamadi: ${depoYeri}`);
      }
      const ayar = await firmaAyarlari(c, F);
      const lotNo = await yeniNumara(c, F, "RM", ayar.saatDilimi);
      const lot = await bir(
        c,
        `INSERT INTO lot (firma_id, no, tip, malzeme_id, tedarikci_id, tedarikci_lot, coa_var, durum, olusturan)
         VALUES ($1,$2,'RM',$3,$4,$5,$6,$7,$8) RETURNING *`,
        [F, lotNo, malzeme.id, ted.id, tedarikciLot, b.coaVar === undefined ? null : d.bool(b.coaVar), D.KONTROL_BEKLIYOR, req.ctx.kullaniciId],
      );
      const birimler = [];
      const etiketler = [];
      for (const miktar of ambalajlar) {
        const { barkod, sira } = await altNumara(c, F, lotNo);
        const birim = await birimOlustur(c, req.ctx, {
          barkod, sira, tip: "RM", lotId: lot.id, malzemeId: malzeme.id, miktar, olcuBirimi: malzeme.olcu_birimi,
          durum: D.KONTROL_BEKLIYOR, yer: depoYeri ? `DEPO:${depoYeri}` : "DEPO",
        });
        await olayYaz(c, req.ctx, {
          tip: OLAY.KABUL, birimId: birim.id, miktar, olcuBirimi: malzeme.olcu_birimi,
          aciklama: `${ted.unvan} - ${tedarikciLot}`, veri: { lotNo, coaVar: lot.coa_var, not: aciklama },
        });
        birimler.push(birim);
        etiketler.push(await etiketBas(c, req.ctx, birim.id));
      }
      await izYaz(c, req.ctx, {
        tablo: "lot", kayitId: lot.id, islem: "EKLEME",
        degisiklikler: [
          { alan: "lot", eski: null, yeni: `${lotNo} - ${malzeme.kod} ${malzeme.ad}` },
          { alan: "miktar", eski: null, yeni: `${ambalajlar.length} ambalaj, ${ambalajlar.reduce((a, x) => a + x, 0)} ${malzeme.olcu_birimi}` },
          { alan: "tedarikci", eski: null, yeni: `${ted.unvan} / ${tedarikciLot}` },
        ],
        gerekce: aciklama,
      });
      const onay = await onayOlustur(c, req.ctx, { kayitTuru: "HAMMADDE", kayitNo: lotNo, atananId });
      return { lot, birimler, etiketler, onay };
    });
    res.status(201).json(sonuc);
  }),
);

// POST /api/hammadde/lotlar/:no/kontrol  { karar: KABUL|KARANTINA|RET, not? }
router.post(
  "/lotlar/:no/kontrol",
  rol(ROLLER.KALITE),
  sar(async (req, res) => {
    const karar = d.secim(req.body.karar, "Karar", [D.KABUL, D.KARANTINA, D.RET]);
    const not = d.metin(req.body.not, "Not", { zorunlu: karar !== D.KABUL, max: 1000 });
    const sonuc = await tx((c) => hammaddeKarari(c, req.ctx, req.params.no, karar, not));
    res.json(sonuc);
  }),
);

// POST /api/hammadde/cekis  { barkod, miktar?, isEmriNo? | makineKodu? }
// Miktar ambalajin tamamindan azsa ambalaj bolunur ve cekilen kisma yeni etiket basilir.
router.post(
  "/cekis",
  rol(ROLLER.DEPO, ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const birim = await birimBul(c, F, req.body.barkod, { tipler: ["RM", "WIP"] });
      blokeKontrol(birim);
      if (birim.durum !== D.KABUL) throw hatalar.engel(`${birim.barkod} kullanima uygun degil (durum: ${birim.durum})`, "ONAYSIZ_MALZEME");
      const aktif = await bir(c, "SELECT 1 FROM is_emri_baglama WHERE birim_id = $1 AND cikarma_zamani IS NULL", [birim.id]);
      if (aktif) throw hatalar.engel(`${birim.barkod} zaten bir is emrine bagli`, "ZATEN_BAGLI");

      let makine;
      let isEmri = null;
      if (req.body.isEmriNo) {
        isEmri = await bir(c, "SELECT * FROM is_emri WHERE firma_id = $1 AND no = $2", [F, String(req.body.isEmriNo).toUpperCase()]);
        if (!isEmri) throw hatalar.bulunamadi("Is emri bulunamadi");
        if (!["PLANLANDI", "ILK_PARCA_BEKLIYOR", "URETIMDE", "DURAKLATILDI"].includes(isEmri.durum)) {
          throw hatalar.engel(`${isEmri.no} kapanmis bir is emri (durum: ${isEmri.durum}), malzeme cekilemez`, "YANLIS_DURUM");
        }
        makine = await bir(c, "SELECT * FROM makine WHERE id = $1", [isEmri.makine_id]);
      } else {
        const kod = d.kod(req.body.makineKodu, "Makine kodu ya da is emri");
        makine = await bir(c, "SELECT * FROM makine WHERE firma_id = $1 AND kod = $2 AND aktif", [F, kod]);
        if (!makine) throw hatalar.bulunamadi("Makine bulunamadi");
      }
      const mevcut = yuvarla(birim.miktar);
      const miktar = req.body.miktar === undefined || req.body.miktar === "" ? mevcut : yuvarla(d.sayi(req.body.miktar, "Miktar", { pozitif: true }));
      if (miktar > mevcut) throw hatalar.engel(`Ambalajda ${mevcut} ${birim.olcu_birimi} var, ${miktar} cekilemez`, "YETERSIZ_MIKTAR");
      if (String(birim.yer || "").startsWith("HAT:")) throw hatalar.engel(`${birim.barkod} zaten hatta (${birim.yer}). Once depoya iade edin.`, "ZATEN_HATTA");

      let cekilen = birim;
      let etiket = null;
      if (miktar < mevcut) {
        // Kismi cekis: ayni lot altinda yeni ambalaj numarasi
        const { barkod, sira } = await altNumara(c, F, birim.lot_no);
        cekilen = await birimOlustur(c, req.ctx, {
          barkod, sira, tip: birim.tip, lotId: birim.lot_id, malzemeId: birim.malzeme_id, miktar,
          olcuBirimi: birim.olcu_birimi, durum: D.KABUL, yer: `HAT:${makine.kod}`, kaynakBirimId: birim.id,
        });
        await birimGuncelle(c, req.ctx, birim.id, { miktar: yuvarla(mevcut - miktar) });
        await bagla(c, req.ctx, birim.id, cekilen.id, "BOLUNDU", miktar);
        await olayYaz(c, req.ctx, { tip: OLAY.BOLME, birimId: birim.id, karsiBirimId: cekilen.id, miktar, olcuBirimi: birim.olcu_birimi });
        etiket = await etiketBas(c, req.ctx, cekilen.id);
      } else {
        cekilen = await birimGuncelle(c, req.ctx, birim.id, { yer: `HAT:${makine.kod}` });
      }
      await olayYaz(c, req.ctx, {
        tip: OLAY.CEKIS, birimId: cekilen.id, isEmriId: isEmri?.id, miktar, olcuBirimi: birim.olcu_birimi,
        aciklama: `Depo -> ${makine.kod}${isEmri ? ` (${isEmri.no})` : ""}`,
      });
      return { birim: cekilen, makine: makine.kod, isEmriNo: isEmri?.no || null, etiket, kalanAnaAmbalaj: miktar < mevcut ? yuvarla(mevcut - miktar) : 0 };
    });
    res.json(sonuc);
  }),
);

// POST /api/hammadde/iade  { barkod, kalanMiktar?, depoYeri? }
// Hatta olan ama is emrine bagli olmayan ambalaji depoya geri alir.
router.post(
  "/iade",
  rol(ROLLER.DEPO, ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const birim = await birimBul(c, req.ctx.firmaId, req.body.barkod, { tipler: ["RM", "WIP"] });
      const aktif = await bir(c, "SELECT 1 FROM is_emri_baglama WHERE birim_id = $1 AND cikarma_zamani IS NULL", [birim.id]);
      if (aktif) throw hatalar.engel("Bu ambalaj bir is emrine bagli. Iade, is emri bitirilirken yapilir.", "ZATEN_BAGLI");
      if (!String(birim.yer || "").startsWith("HAT:")) throw hatalar.engel(`${birim.barkod} hatta degil (yer: ${birim.yer || "-"}), iade edilemez`, "HATTA_DEGIL");
      if ([D.IPTAL, D.TUKENDI, D.HURDA].includes(birim.durum)) throw hatalar.engel(`${birim.barkod} iade edilemez (durum: ${birim.durum})`, "YANLIS_DURUM");
      const mevcut = yuvarla(birim.miktar);
      const kalan = req.body.kalanMiktar === undefined || req.body.kalanMiktar === "" ? mevcut : yuvarla(d.sayi(req.body.kalanMiktar, "Kalan miktar", { min: 0 }));
      if (kalan > mevcut) throw hatalar.gecersiz(`Kalan miktar mevcut miktardan (${mevcut}) fazla olamaz`);
      const depoYeri = req.body.depoYeri ? d.kod(req.body.depoYeri, "Depo yeri") : null;
      if (kalan < mevcut) {
        await olayYaz(c, req.ctx, {
          tip: OLAY.HURDA, birimId: birim.id, miktar: yuvarla(mevcut - kalan), olcuBirimi: birim.olcu_birimi,
          aciklama: "Iade sirasinda tartimda eksik cikti", veri: { neden: "IADE_EKSIGI" },
        });
      }
      const g = await birimGuncelle(c, req.ctx, birim.id, {
        miktar: kalan,
        yer: depoYeri ? `DEPO:${depoYeri}` : "DEPO",
        durum: sifirMi(kalan) ? D.TUKENDI : birim.durum,
      });
      await olayYaz(c, req.ctx, { tip: OLAY.IADE, birimId: birim.id, miktar: kalan, olcuBirimi: birim.olcu_birimi, aciklama: "Hattan depoya" });
      return g;
    });
    res.json(sonuc);
  }),
);

// GET /api/hammadde/lotlar?durum=KABUL&ara=PET  -> F-01 Hammadde Giris listesi
// Her satirda: kim kaydetti, kime onaya gitti, kim karar verdi, iptal edildiyse kim/neden.
router.get(
  "/lotlar",
  sar(async (req, res) => {
    const durum = req.query.durum ? String(req.query.durum).split(",") : null;
    const ara = req.query.ara ? `%${String(req.query.ara).toUpperCase()}%` : null;
    const r = await pool.query(
      `SELECT l.id, l.no, l.durum, l.tedarikci_lot, l.coa_var, l.olusturma_zamani,
              m.kod AS malzeme_kod, m.ad AS malzeme_ad, m.olcu_birimi, t.unvan AS tedarikci,
              ko.ad_soyad AS olusturan_ad, ko.sicil_no AS olusturan_sicil,
              l.iptal_zamani, l.iptal_gerekcesi, ki.ad_soyad AS iptal_eden_ad,
              x.ambalaj_sayisi, x.giris_miktari, x.kalan_miktar, x.bloke_var, x.depo_yeri, x.ilk_barkod,
              o.id AS onay_id, o.durum AS onay_durum, o.atanan AS onay_atanan_id, ka.ad_soyad AS onay_atanan_ad,
              o.karar_zamani AS onay_karar_zamani, o.karar_notu AS onay_karar_notu, kk.ad_soyad AS onay_karar_veren_ad
         FROM lot l
         JOIN malzeme m ON m.id = l.malzeme_id
         LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
         LEFT JOIN kullanici ko ON ko.id = l.olusturan
         LEFT JOIN kullanici ki ON ki.id = l.iptal_eden
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE b.kaynak_birim_id IS NULL) AS ambalaj_sayisi,
                  COALESCE(sum(b.ilk_miktar) FILTER (WHERE b.kaynak_birim_id IS NULL), 0) AS giris_miktari,
                  COALESCE(sum(b.miktar) FILTER (WHERE b.durum <> 'IPTAL'), 0) AS kalan_miktar,
                  COALESCE(bool_or(b.bloke), false) AS bloke_var,
                  min(replace(b.yer, 'DEPO:', '')) FILTER (WHERE b.kaynak_birim_id IS NULL AND b.yer LIKE 'DEPO:%') AS depo_yeri,
                  min(b.barkod) FILTER (WHERE b.kaynak_birim_id IS NULL) AS ilk_barkod
             FROM birim b WHERE b.lot_id = l.id
         ) x ON true
         LEFT JOIN onay o ON o.firma_id = l.firma_id AND o.kayit_turu = 'HAMMADDE' AND o.kayit_no = l.no
         LEFT JOIN kullanici ka ON ka.id = o.atanan
         LEFT JOIN kullanici kk ON kk.id = o.karar_veren
        WHERE l.firma_id = $1 AND l.tip = 'RM'
          AND ($2::text[] IS NULL OR l.durum = ANY($2))
          AND ($3::text IS NULL OR upper(l.no || ' ' || m.kod || ' ' || m.ad || ' ' || COALESCE(l.tedarikci_lot,'') || ' ' || COALESCE(t.unvan,'')) LIKE $3)
        ORDER BY l.olusturma_zamani DESC
        LIMIT 500`,
      [req.ctx.firmaId, durum, ara],
    );
    res.json(r.rows);
  }),
);

// POST /api/hammadde/lotlar/:no/iptal  { gerekce }
// Kayit silinmez: lot ve ambalajlari "IPTAL" olur; kim, ne zaman, neden saklanir.
router.post(
  "/lotlar/:no/iptal",
  rol(ROLLER.DEPO, ROLLER.KALITE),
  sar(async (req, res) => {
    const gerekce = d.metin(req.body.gerekce, "Iptal gerekcesi", { max: 1000 });
    if (gerekce.length < 5) throw hatalar.gecersiz("Iptal gerekcesi en az 5 karakter olmali");
    res.json(await tx((c) => hammaddeIptal(c, req.ctx, req.params.no, gerekce)));
  }),
);

// GET /api/hammadde/lotlar/:no/gecmis  -> bu kayitta kim, ne zaman, ne yapti (isim isim)
router.get(
  "/lotlar/:no/gecmis",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const lot = await bir(pool, "SELECT id, no FROM lot WHERE firma_id = $1 AND no = $2 AND tip = 'RM'", [F, req.params.no.toUpperCase()]);
    if (!lot) throw hatalar.bulunamadi("Hammadde lotu bulunamadi");
    const onay = await bir(pool, "SELECT id FROM onay WHERE firma_id = $1 AND kayit_turu = 'HAMMADDE' AND kayit_no = $2", [F, lot.no]);
    const r = await pool.query(
      `SELECT * FROM (
         SELECT i.zaman, 'IZ' AS kaynak, i.tablo, i.islem, i.alan, i.eski_deger, i.yeni_deger, i.gerekce,
                NULL::text AS tip, NULL::text AS barkod, NULL::numeric AS miktar, NULL::text AS olcu_birimi, NULL::text AS aciklama,
                k.ad_soyad AS kim, k.sicil_no, i.cihaz, i.id AS sira
           FROM degisiklik_izi i LEFT JOIN kullanici k ON k.id = i.kullanici_id
          WHERE i.firma_id = $1 AND ((i.tablo = 'lot' AND i.kayit_id = $2) OR (i.tablo = 'onay' AND i.kayit_id = $3))
         UNION ALL
         SELECT o.zaman, 'OLAY', NULL, NULL, NULL, NULL, NULL, NULL,
                o.tip, b.barkod, o.miktar, o.olcu_birimi, o.aciklama,
                k.ad_soyad, k.sicil_no, o.cihaz, o.id
           FROM olay o JOIN birim b ON b.id = o.birim_id LEFT JOIN kullanici k ON k.id = o.kullanici_id
          WHERE o.firma_id = $1 AND b.lot_id = $4
       ) x ORDER BY zaman, kaynak DESC, sira`,
      [F, String(lot.id), onay ? String(onay.id) : "-", lot.id],
    );
    res.json(r.rows);
  }),
);

// GET /api/hammadde/lotlar/:no  -> lot + ambalajlari
router.get(
  "/lotlar/:no",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const lot = await bir(
      pool,
      `SELECT l.*, m.kod AS malzeme_kod, m.ad AS malzeme_ad, m.olcu_birimi, t.unvan AS tedarikci
         FROM lot l JOIN malzeme m ON m.id = l.malzeme_id LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
        WHERE l.firma_id = $1 AND l.no = $2 AND l.tip = 'RM'`,
      [F, req.params.no.toUpperCase()],
    );
    if (!lot) throw hatalar.bulunamadi("Hammadde lotu bulunamadi");
    const birimler = await pool.query(
      `SELECT b.*, (SELECT ie.no FROM is_emri_baglama g JOIN is_emri ie ON ie.id = g.is_emri_id
                     WHERE g.birim_id = b.id AND g.cikarma_zamani IS NULL) AS bagli_is_emri
         FROM birim b WHERE b.lot_id = $1 ORDER BY b.sira`,
      [lot.id],
    );
    res.json({ lot, birimler: birimler.rows });
  }),
);

// GET /api/hammadde/lotlar/:no/bakiye  -> hammadde hikayesi bakiye karti (bolum 13.2)
router.get(
  "/lotlar/:no/bakiye",
  sar(async (req, res) => {
    res.json(await hammaddeBakiye(pool, req.ctx.firmaId, req.params.no.toUpperCase()));
  }),
);

module.exports = router;
