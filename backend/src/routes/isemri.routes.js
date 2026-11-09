// Is emri ve kiosk akisi (bolum 6.3, 7, 8.1, 8.2, 11)
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { barkodCoz } = require("../lib/barkod");
const { ROLLER, BIRIM_DURUM: D, IS_EMRI_DURUM: S, OLAY } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { yeniNumara } = require("../services/numara");
const { olayYaz, izYaz, farklar } = require("../services/iz");
const { etiketBas } = require("../services/etiket");
const { birimBul, birimOlustur, bagla, birimGuncelle, blokeKontrol, firmaAyarlari } = require("../services/birim");
const { onayOlustur, onayKontrol, onaySifirla } = require("../services/onay");
const { yuvarla, sifirMi } = require("../lib/miktar");
const { aletKontrol } = require("../services/alet");

const router = express.Router();

// Urun karti uretime hazir mi? Recete (gram/metre) ve kontrol plani olmadan
// miktar dengesi ve kalite gecitleri calismaz; is emri acilmaz (bolum 6.3, 11).
async function urunHazirMi(c, urunId) {
  const r = await bir(
    c,
    `SELECT (SELECT count(*) FROM recete WHERE urun_id = $1) AS recete,
            (SELECT count(*) FROM karakteristik WHERE urun_id = $1 AND asama = 'ILK_PARCA' AND aktif) AS ilk_parca,
            (SELECT count(*) FROM karakteristik WHERE urun_id = $1 AND asama = 'METRAJ' AND aktif) AS metraj`,
    [urunId],
  );
  const eksik = [];
  if (!r.recete) eksik.push("recete (gram/metre)");
  if (!r.ilk_parca) eksik.push("ilk parca kontrol plani");
  if (!r.metraj) eksik.push("metraj kontrol plani");
  return eksik;
}

async function isEmriBul(c, F, no, { kilit = true } = {}) {
  const ie = await bir(
    c,
    `SELECT ie.*, u.kod AS urun_kod, u.ad AS urun_ad, u.olcu_birimi AS urun_birimi, m.kod AS makine_kod
       FROM is_emri ie JOIN urun u ON u.id = ie.urun_id JOIN makine m ON m.id = ie.makine_id
      WHERE ie.firma_id = $1 AND ie.no = $2 ${kilit ? "FOR UPDATE OF ie" : ""}`,
    [F, String(no).toUpperCase()],
  );
  if (!ie) throw hatalar.bulunamadi(`Is emri bulunamadi: ${no}`);
  return ie;
}

function durumBekle(ie, izinli, islem) {
  if (!izinli.includes(ie.durum)) {
    throw hatalar.engel(`${ie.no} ${islem} icin uygun durumda degil (durum: ${ie.durum})`, "YANLIS_DURUM");
  }
}

async function durumDegistir(c, ctx, ie, yeni, gerekce) {
  await c.query("UPDATE is_emri SET durum = $1 WHERE id = $2", [yeni, ie.id]);
  await izYaz(c, ctx, { tablo: "is_emri", kayitId: ie.id, islem: yeni === S.IPTAL ? "IPTAL" : "DURUM", degisiklikler: [{ alan: "durum", eski: ie.durum, yeni }], gerekce });
  await olayYaz(c, ctx, { tip: OLAY.IS_EMRI_DURUM, isEmriId: ie.id, aciklama: `${ie.durum} -> ${yeni}`, veri: { eski: ie.durum, yeni } });
}

// Karantina toplamini ve uretilen metraji dondurur (kiosk sayaclari icin)
async function sayaclar(c, ieId) {
  const r = await bir(
    c,
    `SELECT COALESCE(sum(ilk_miktar) FILTER (WHERE tip = 'FG_LOT'), 0) AS uretilen,
            COALESCE(sum(ilk_miktar) FILTER (WHERE tip = 'KR'), 0) AS karantina,
            count(*) FILTER (WHERE tip = 'KR') AS karantina_sayisi,
            count(*) FILTER (WHERE tip = 'FG_LOT') AS top_sayisi
       FROM birim WHERE is_emri_id = $1 AND durum <> 'IPTAL'`,
    [ieId],
  );
  return r;
}

// POST /api/is-emirleri  { urunId, makineId, hedefMiktar, planlananTarih?, oncelik?, musteriId?, siparisNo?, aciklama? }
router.post(
  "/",
  rol(ROLLER.SEF),
  sar(async (req, res) => {
    const b = req.body;
    const urunId = d.metin(b.urunId, "Urun", { max: 40 });
    const makineId = d.metin(b.makineId, "Makine", { max: 40 });
    const hedef = d.sayi(b.hedefMiktar, "Hedef miktar", { pozitif: true });
    const oncelik = d.sayi(b.oncelik, "Oncelik", { zorunlu: false, min: 1, max: 5 }) ?? 3;
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const urun = await bir(c, "SELECT * FROM urun WHERE id = $1 AND firma_id = $2 AND aktif", [urunId, F]);
      if (!urun) throw hatalar.gecersiz("Urun bulunamadi veya pasif");
      const makine = await bir(c, "SELECT * FROM makine WHERE id = $1 AND firma_id = $2 AND aktif", [makineId, F]);
      if (!makine) throw hatalar.gecersiz("Makine bulunamadi veya pasif");
      const eksik = await urunHazirMi(c, urun.id);
      if (eksik.length) throw hatalar.engel(`${urun.kod} urun kartinda eksik var: ${eksik.join(", ")}. Tanimlar'dan tamamlayin.`, "URUN_KARTI_EKSIK");
      if (b.musteriId) {
        const mu = await bir(c, "SELECT 1 FROM musteri WHERE id = $1 AND firma_id = $2 AND aktif", [b.musteriId, F]);
        if (!mu) throw hatalar.gecersiz("Musteri bulunamadi veya pasif");
      }
      if (b.planlananTarih && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.planlananTarih))) throw hatalar.gecersiz("Planlanan tarih YYYY-AA-GG olmali");
      const ayar = await firmaAyarlari(c, F);
      const atananId = d.metin(b.atananId, "Is emrini onaylayacak kisi", { zorunlu: ayar.isEmriOnayZorunlu !== false, max: 40 });
      const no = await yeniNumara(c, F, "IE", ayar.saatDilimi);
      const ie = await bir(
        c,
        `INSERT INTO is_emri (firma_id, no, urun_id, makine_id, hedef_miktar, planlanan_tarih, oncelik, musteri_id, siparis_no, aciklama, olusturan)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [F, no, urun.id, makine.id, hedef, b.planlananTarih || null, oncelik, b.musteriId || null,
          d.metin(b.siparisNo, "Siparis no", { zorunlu: false, max: 60 }), d.metin(b.aciklama, "Aciklama", { zorunlu: false, max: 1000 }),
          req.ctx.kullaniciId],
      );
      await olayYaz(c, req.ctx, { tip: OLAY.IS_EMRI_ACILDI, isEmriId: ie.id, miktar: hedef, olcuBirimi: urun.olcu_birimi, aciklama: `${urun.kod} - ${makine.kod}` });
      await izYaz(c, req.ctx, {
        tablo: "is_emri", kayitId: ie.id, islem: "EKLEME",
        degisiklikler: [{ alan: "is_emri", eski: null, yeni: `${no} - ${urun.kod} ${hedef} ${urun.olcu_birimi} - ${makine.kod}` }],
      });
      const onay = atananId ? await onayOlustur(c, req.ctx, { kayitTuru: "IS_EMRI", kayitNo: no, atananId }) : null;
      const recete = await c.query(
        `SELECT m.kod, m.ad, r.gram_metre, round($2 * r.gram_metre / 1000, 2) AS ihtiyac_kg
           FROM recete r JOIN malzeme m ON m.id = r.malzeme_id WHERE r.urun_id = $1`,
        [urun.id, hedef],
      );
      return { isEmri: ie, hammaddeIhtiyaci: recete.rows, onay };
    });
    res.status(201).json(sonuc);
  }),
);

// GET /api/is-emirleri?makine=OR03&durum=PLANLANDI,URETIMDE
router.get(
  "/",
  sar(async (req, res) => {
    const durum = req.query.durum ? String(req.query.durum).split(",") : null;
    const makine = req.query.makine ? String(req.query.makine).toUpperCase() : null;
    const r = await pool.query(
      `SELECT ie.id, ie.no, ie.durum, ie.hedef_miktar, ie.planlanan_tarih, ie.oncelik, ie.siparis_no, ie.aciklama,
              ie.baslangic, ie.bitis, ie.olusturma_zamani, ie.denge,
              u.kod AS urun_kod, u.ad AS urun_ad, u.olcu_birimi, m.kod AS makine_kod, mu.unvan AS musteri,
              COALESCE(s.uretilen, 0) AS uretilen, COALESCE(s.karantina, 0) AS karantina,
              ko.ad_soyad AS olusturan_ad, ki.ad_soyad AS iptal_eden_ad, ie.iptal_zamani, ie.iptal_gerekcesi,
              o.id AS onay_id, o.durum AS onay_durum, o.atanan AS onay_atanan_id, ka.ad_soyad AS onay_atanan_ad,
              o.karar_zamani AS onay_karar_zamani, o.karar_notu AS onay_karar_notu, kk.ad_soyad AS onay_karar_veren_ad
         FROM is_emri ie
         JOIN urun u ON u.id = ie.urun_id
         JOIN makine m ON m.id = ie.makine_id
         LEFT JOIN musteri mu ON mu.id = ie.musteri_id
         LEFT JOIN kullanici ko ON ko.id = ie.olusturan
         LEFT JOIN kullanici ki ON ki.id = ie.iptal_eden
         LEFT JOIN onay o ON o.firma_id = ie.firma_id AND o.kayit_turu = 'IS_EMRI' AND o.kayit_no = ie.no
         LEFT JOIN kullanici ka ON ka.id = o.atanan
         LEFT JOIN kullanici kk ON kk.id = o.karar_veren
         LEFT JOIN LATERAL (
           SELECT sum(ilk_miktar) FILTER (WHERE tip = 'FG_LOT') AS uretilen,
                  sum(ilk_miktar) FILTER (WHERE tip = 'KR') AS karantina
             FROM birim WHERE is_emri_id = ie.id AND durum <> 'IPTAL') s ON true
        WHERE ie.firma_id = $1 AND ($2::text[] IS NULL OR ie.durum = ANY($2)) AND ($3::text IS NULL OR m.kod = $3)
        ORDER BY ie.olusturma_zamani DESC
        LIMIT 500`,
      [req.ctx.firmaId, durum, makine],
    );
    res.json(r.rows);
  }),
);

// GET /api/is-emirleri/:no  -> kiosk ve detay ekrani icin her sey
router.get(
  "/:no",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const ie = await isEmriBul(pool, F, req.params.no, { kilit: false });
    const [baglamalar, birimler, olcumler, karakteristikler, recete, sayac] = await Promise.all([
      pool.query(
        `SELECT g.*, b.barkod, b.miktar AS guncel_miktar, b.olcu_birimi, l.no AS lot_no, m.kod AS malzeme_kod, m.ad AS malzeme_ad
           FROM is_emri_baglama g JOIN birim b ON b.id = g.birim_id LEFT JOIN lot l ON l.id = b.lot_id
           LEFT JOIN malzeme m ON m.id = b.malzeme_id
          WHERE g.is_emri_id = $1 ORDER BY g.baglama_zamani`,
        [ie.id],
      ),
      pool.query(
        `SELECT b.id, b.barkod, b.tip, b.ilk_miktar, b.miktar, b.olcu_birimi, b.durum, b.bloke, b.ek, b.olusturma_zamani,
                l.no AS lot_no, k.sicil_no AS operator_sicil
           FROM birim b LEFT JOIN lot l ON l.id = b.lot_id LEFT JOIN kullanici k ON k.id = b.olusturan
          WHERE b.is_emri_id = $1 AND b.tip IN ('FG_LOT','KR') ORDER BY b.olusturma_zamani`,
        [ie.id],
      ),
      pool.query(
        `SELECT o.*, k.ad AS karakteristik, k.alt_sinir, k.ust_sinir, k.olcu_birimi
           FROM olcum o LEFT JOIN karakteristik k ON k.id = o.karakteristik_id
          WHERE o.is_emri_id = $1 ORDER BY o.zaman`,
        [ie.id],
      ),
      pool.query("SELECT * FROM karakteristik WHERE urun_id = $1 AND aktif ORDER BY asama, sira", [ie.urun_id]),
      pool.query(
        `SELECT r.*, m.kod AS malzeme_kod, m.ad AS malzeme_ad FROM recete r JOIN malzeme m ON m.id = r.malzeme_id WHERE r.urun_id = $1`,
        [ie.urun_id],
      ),
      sayaclar(pool, ie.id),
    ]);
    const proses = await prosesDurumu(pool, ie);
    res.json({
      isEmri: ie,
      prosesDurumu: proses,
      sayaclar: sayac,
      baglamalar: baglamalar.rows,
      toplar: birimler.rows.filter((b) => b.tip === "FG_LOT"),
      karantinalar: birimler.rows.filter((b) => b.tip === "KR"),
      olcumler: olcumler.rows,
      karakteristikler: karakteristikler.rows,
      recete: recete.rows,
    });
  }),
);

// POST /api/is-emirleri/:no/baslat
router.post(
  "/:no/baslat",
  rol(ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const ie = await isEmriBul(c, req.ctx.firmaId, req.params.no);
      durumBekle(ie, [S.PLANLANDI, S.DURAKLATILDI], "baslatma");
      const ayar = await firmaAyarlari(c, req.ctx.firmaId);
      await onayKontrol(c, req.ctx.firmaId, "IS_EMRI", ie.no, { zorunlu: ayar.isEmriOnayZorunlu !== false, islem: "uretime baslanamaz" });
      const baska = await bir(
        c,
        `SELECT no FROM is_emri WHERE makine_id = $1 AND id <> $2 AND durum IN ('URETIMDE','ILK_PARCA_BEKLIYOR')`,
        [ie.makine_id, ie.id],
      );
      if (baska) throw hatalar.engel(`${ie.makine_kod} makinesinde ${baska.no} zaten calisiyor`, "MAKINE_DOLU");
      // Ilk parca onayi yalnizca isin en basinda istenir. Bir kez onaylandiysa duraklatmadan donuste
      // dogrudan uretime gecilir (proses olcumu tolerans disiysa top, uygun proses olcumu olmadan kapanmaz).
      const ilkParcaVar = await bir(c, "SELECT 1 FROM olcum WHERE is_emri_id = $1 AND asama = 'ILK_PARCA' AND sonuc = 'UYGUN' LIMIT 1", [ie.id]);
      const yeni = ilkParcaVar ? S.URETIMDE : S.ILK_PARCA_BEKLIYOR;
      await durumDegistir(c, req.ctx, ie, yeni);
      if (!ie.baslangic) {
        await c.query("UPDATE is_emri SET baslangic = now() WHERE id = $1", [ie.id]);
        await olayYaz(c, req.ctx, { tip: OLAY.IS_EMRI_BASLADI, isEmriId: ie.id, aciklama: ie.makine_kod });
      }
      return { no: ie.no, durum: yeni };
    });
    res.json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/bagla  { barkod }  -> hammadde/masura makineye takildi (bolum 7.1)
router.post(
  "/:no/bagla",
  rol(ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      durumBekle(ie, [S.ILK_PARCA_BEKLIYOR, S.URETIMDE, S.DURAKLATILDI], "hammadde baglama");
      const birim = await birimBul(c, F, req.body.barkod, { tipler: ["RM", "WIP"] });
      blokeKontrol(birim);
      if (birim.durum !== D.KABUL) {
        throw hatalar.engel(`${birim.barkod} onaylanmamis malzeme (durum: ${birim.durum}). Makineye takilamaz.`, "ONAYSIZ_MALZEME", {
          lotNo: birim.lot_no,
          durum: birim.durum,
        });
      }
      if (birim.miktar <= 0) throw hatalar.engel(`${birim.barkod} tukenmis`, "TUKENMIS");
      const recete = await c.query("SELECT malzeme_id FROM recete WHERE urun_id = $1", [ie.urun_id]);
      if (recete.rows.length && !recete.rows.some((r) => r.malzeme_id === birim.malzeme_id)) {
        throw hatalar.engel(`${birim.barkod} bu urunun recetesinde olmayan bir malzeme`, "RECETE_DISI");
      }
      const aktif = await bir(
        c,
        `SELECT ie.no FROM is_emri_baglama g JOIN is_emri ie ON ie.id = g.is_emri_id WHERE g.birim_id = $1 AND g.cikarma_zamani IS NULL`,
        [birim.id],
      );
      if (aktif) throw hatalar.engel(`${birim.barkod} zaten ${aktif.no} is emrine bagli`, "ZATEN_BAGLI");

      if (!String(birim.yer || "").startsWith("HAT:")) {
        // Depodan dogrudan okutuldu: cekis da kaydedilir
        await olayYaz(c, req.ctx, { tip: OLAY.CEKIS, birimId: birim.id, isEmriId: ie.id, miktar: birim.miktar, olcuBirimi: birim.olcu_birimi, aciklama: `Depo -> ${ie.makine_kod} (yuklemede)` });
      }
      await birimGuncelle(c, req.ctx, birim.id, { yer: `HAT:${ie.makine_kod}` });
      await c.query(
        `INSERT INTO is_emri_baglama (firma_id, is_emri_id, birim_id, baglama_miktari, kullanici_id) VALUES ($1,$2,$3,$4,$5)`,
        [F, ie.id, birim.id, birim.miktar, req.ctx.kullaniciId],
      );
      await olayYaz(c, req.ctx, { tip: OLAY.YUKLEME, birimId: birim.id, isEmriId: ie.id, miktar: birim.miktar, olcuBirimi: birim.olcu_birimi, aciklama: `${ie.makine_kod} / ${ie.no}` });
      return { barkod: birim.barkod, lotNo: birim.lot_no, miktar: birim.miktar, olcuBirimi: birim.olcu_birimi };
    });
    res.json(sonuc);
  }),
);

// Bir baglamayi kapatir: tuketilen = baglanan - kalan
async function baglamaKapat(c, ctx, ie, g, kalan) {
  const birim = await bir(c, "SELECT * FROM birim WHERE id = $1 FOR UPDATE", [g.birim_id]);
  kalan = yuvarla(kalan);
  if (kalan > yuvarla(g.baglama_miktari)) throw hatalar.gecersiz(`${birim.barkod}: kalan miktar baglanan miktardan (${g.baglama_miktari}) fazla olamaz`);
  const tuketilen = yuvarla(g.baglama_miktari - kalan);
  await c.query("UPDATE is_emri_baglama SET cikarma_zamani = now(), tuketilen = $1 WHERE id = $2", [tuketilen, g.id]);
  await birimGuncelle(c, ctx, birim.id, {
    miktar: kalan,
    yer: !sifirMi(kalan) ? "DEPO" : birim.yer,
    durum: !sifirMi(kalan) ? birim.durum : D.TUKENDI,
  });
  if (tuketilen > 0) {
    await olayYaz(c, ctx, { tip: OLAY.TUKETIM, birimId: birim.id, isEmriId: ie.id, miktar: tuketilen, olcuBirimi: birim.olcu_birimi, aciklama: ie.no });
  }
  if (kalan > 0) {
    await olayYaz(c, ctx, { tip: OLAY.IADE, birimId: birim.id, isEmriId: ie.id, miktar: kalan, olcuBirimi: birim.olcu_birimi, aciklama: `${ie.makine_kod} -> depo` });
  }
  return { barkod: birim.barkod, tuketilen, kalan };
}

// POST /api/is-emirleri/:no/cikar  { barkod, kalanMiktar }  -> uretim sirasinda biten/degisen bobin
router.post(
  "/:no/cikar",
  rol(ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      durumBekle(ie, [S.ILK_PARCA_BEKLIYOR, S.URETIMDE, S.DURAKLATILDI], "hammadde cikarma");
      if (req.body.kalanMiktar === undefined || req.body.kalanMiktar === "") throw hatalar.gecersiz("Kalan miktar zorunlu (bitmisse 0 girin)");
      const birim = await birimBul(c, F, req.body.barkod, { kilit: false });
      const g = await bir(c, "SELECT * FROM is_emri_baglama WHERE is_emri_id = $1 AND birim_id = $2 AND cikarma_zamani IS NULL FOR UPDATE", [ie.id, birim.id]);
      if (!g) throw hatalar.engel(`${birim.barkod} bu is emrine bagli degil`, "BAGLI_DEGIL");
      return baglamaKapat(c, req.ctx, ie, g, d.sayi(req.body.kalanMiktar ?? 0, "Kalan miktar", { min: 0 }));
    });
    res.json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/ilk-parca  { olcumler: [{ karakteristikId, deger }] }  (bolum 7.2)
router.post(
  "/:no/ilk-parca",
  rol(ROLLER.KALITE, ROLLER.OPERATOR),
  sar(async (req, res) => {
    const olcumler = d.dizi(req.body.olcumler, "Olcumler", { min: 1, max: 50 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      durumBekle(ie, [S.ILK_PARCA_BEKLIYOR], "ilk parca onayi");
      const ayar = await firmaAyarlari(c, F);
      const alet = await aletKontrol(c, F, req.body.aletKod, { zorunlu: ayar.olcumAletiZorunlu === true });
      const kalite = req.kullanici.roller.some((r) => r === ROLLER.KALITE || r === ROLLER.ADMIN);
      if (!kalite && !ayar.ilkParcaOperatorOnaylayabilir) throw hatalar.yasak("Ilk parca onayini kalite verir");

      const kars = await c.query("SELECT * FROM karakteristik WHERE urun_id = $1 AND asama = 'ILK_PARCA' AND aktif", [ie.urun_id]);
      const eksik = kars.rows.filter((k) => !olcumler.some((o) => o.karakteristikId === k.id));
      if (eksik.length) throw hatalar.gecersiz(`Eksik olcum: ${eksik.map((k) => k.ad).join(", ")}`);
      const deneme = (await bir(c, "SELECT COALESCE(max(deneme_no),0)+1 AS n FROM olcum WHERE is_emri_id = $1 AND asama = 'ILK_PARCA'", [ie.id])).n;

      const sonuclar = [];
      for (const o of olcumler) {
        const k = kars.rows.find((x) => x.id === o.karakteristikId);
        if (!k) throw hatalar.gecersiz("Karakteristik bu urunun ilk parca planinda yok");
        const deger = d.sayi(o.deger, k.ad);
        const uygun = (k.alt_sinir === null || deger >= k.alt_sinir) && (k.ust_sinir === null || deger <= k.ust_sinir);
        await c.query(
          `INSERT INTO olcum (firma_id, is_emri_id, karakteristik_id, asama, deger, sonuc, deneme_no, kullanici_id, alet_id)
           VALUES ($1,$2,$3,'ILK_PARCA',$4,$5,$6,$7,$8)`,
          [F, ie.id, k.id, deger, uygun ? "UYGUN" : "UYGUN_DEGIL", deneme, req.ctx.kullaniciId, alet?.id || null],
        );
        sonuclar.push({ karakteristik: k.ad, deger, altSinir: k.alt_sinir, ustSinir: k.ust_sinir, uygun });
      }
      const hepsiUygun = sonuclar.every((s) => s.uygun);
      await olayYaz(c, req.ctx, {
        tip: OLAY.ILK_PARCA, isEmriId: ie.id, aciklama: hepsiUygun ? "Ilk parca onaylandi" : "Ilk parca uygun degil",
        veri: { deneme, sonuclar, onaylayanRol: kalite ? "KALITE" : "OPERATOR" },
      });
      if (hepsiUygun) await durumDegistir(c, req.ctx, ie, S.URETIMDE);
      return { onaylandi: hepsiUygun, deneme, sonuclar, durum: hepsiUygun ? S.URETIMDE : ie.durum };
    });
    res.json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/karantina  { hataKodu, miktar, not? }  (bolum 7.3)
router.post(
  "/:no/karantina",
  rol(ROLLER.OPERATOR, ROLLER.SEF, ROLLER.KALITE),
  sar(async (req, res) => {
    const miktar = d.sayi(req.body.miktar, "Miktar", { pozitif: true });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      durumBekle(ie, [S.URETIMDE, S.ILK_PARCA_BEKLIYOR, S.DURAKLATILDI], "karantina kaydi");
      const hata = await bir(c, "SELECT * FROM hata_kodu WHERE firma_id = $1 AND kod = $2 AND aktif", [F, String(req.body.hataKodu || "").toUpperCase()]);
      if (!hata) throw hatalar.gecersiz("Hata kodu bulunamadi");
      const ayar = await firmaAyarlari(c, F);
      const barkod = await yeniNumara(c, F, "KR", ayar.saatDilimi);
      const kr = await birimOlustur(c, req.ctx, {
        barkod, tip: "KR", urunId: ie.urun_id, isEmriId: ie.id, makineId: ie.makine_id, miktar, olcuBirimi: ie.urun_birimi,
        durum: D.KARAR_BEKLIYOR, yer: "KARANTINA",
        ek: { hataKodu: hata.kod, hataAciklama: hata.aciklama, not: d.metin(req.body.not, "Not", { zorunlu: false, max: 1000 }) },
      });
      await olayYaz(c, req.ctx, {
        tip: OLAY.KARANTINAYA_AYIRMA, birimId: kr.id, isEmriId: ie.id, miktar, olcuBirimi: ie.urun_birimi,
        aciklama: `${hata.kod} ${hata.aciklama}`,
      });
      const etiket = await etiketBas(c, req.ctx, kr.id);
      return { karantina: kr, etiket, sayaclar: await sayaclar(c, ie.id) };
    });
    res.status(201).json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/top-bitir  { metraj, agirlik? }  -> bitmis urun lotu (bolum 8.1)
router.post(
  "/:no/top-bitir",
  rol(ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const metraj = d.sayi(req.body.metraj, "Metraj", { pozitif: true });
    const agirlik = d.sayi(req.body.agirlik, "Agirlik", { zorunlu: false, pozitif: true });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      if (ie.durum === S.ILK_PARCA_BEKLIYOR) throw hatalar.engel("Ilk parca onayi verilmeden top bitirilemez", "ILK_PARCA_YOK");
      durumBekle(ie, [S.URETIMDE], "top bitirme");
      const pd = await prosesDurumu(c, ie);
      if (pd.duzeltmeBekliyor) {
        throw hatalar.engel("Son proses olcumu uygun degildi. Ayari duzeltip uygun bir proses olcumu yapmadan top kapatilamaz.", "PROSES_UYGUN_DEGIL");
      }
      if (pd.gecikti) {
        throw hatalar.engel(
          `Periyodik proses olcumu gecikti (son uygun olcum ${pd.gecenDk} dk once, aralik ${pd.aralikDk} dk). Once proses olcumu yapin.`,
          "PROSES_OLCUM_GECIKTI",
        );
      }
      // Bu topun baslangici: onceki topun bitisi ya da is emrinin baslangici
      const onceki = await bir(c, "SELECT max(olusturma_zamani) AS t FROM birim WHERE is_emri_id = $1 AND tip = 'FG_LOT'", [ie.id]);
      const baslangic = onceki.t || ie.baslangic;

      // Bu top uretilirken makinede hammadde olmali; su an bagli olanlar hala kullanilabilir olmali
      const kullanilan = await c.query(
        `SELECT g.birim_id, g.cikarma_zamani, b.barkod, b.durum, b.bloke FROM is_emri_baglama g JOIN birim b ON b.id = g.birim_id
          WHERE g.is_emri_id = $1 AND (g.cikarma_zamani IS NULL OR g.cikarma_zamani >= $2)`,
        [ie.id, baslangic],
      );
      if (!kullanilan.rows.length) throw hatalar.engel("Bu top icin makineye hic hammadde baglanmamis. Once hammadde okutun.", "HAMMADDE_YOK");
      const sorunlu = kullanilan.rows.filter((x) => !x.cikarma_zamani && (x.bloke || x.durum !== D.KABUL));
      if (sorunlu.length) {
        throw hatalar.engel(
          `Makinedeki hammadde artik kullanilamaz: ${sorunlu.map((x) => `${x.barkod} (${x.bloke ? "BLOKE" : x.durum})`).join(", ")}. Kalite kararini bekleyin ya da ambalaji cikarin.`,
          "HAMMADDE_ONAYSIZ",
        );
      }

      const ayar = await firmaAyarlari(c, F);
      const lotNo = await yeniNumara(c, F, "FG", ayar.saatDilimi);
      const lot = await bir(
        c,
        `INSERT INTO lot (firma_id, no, tip, urun_id, is_emri_id, durum, olusturan) VALUES ($1,$2,'FG',$3,$4,$5,$6) RETURNING *`,
        [F, lotNo, ie.urun_id, ie.id, D.KESIM_BEKLIYOR, req.ctx.kullaniciId],
      );
      const top = await birimOlustur(c, req.ctx, {
        barkod: lotNo, tip: "FG_LOT", lotId: lot.id, urunId: ie.urun_id, isEmriId: ie.id, makineId: ie.makine_id,
        miktar: metraj, olcuBirimi: ie.urun_birimi, durum: D.KESIM_BEKLIYOR, yer: `HAT:${ie.makine_kod}`,
        ek: { baslangic, agirlik },
      });

      // Bu top uretilirken bagli olan hammaddeler -> top (soy agaci)
      for (const r of kullanilan.rows) await bagla(c, req.ctx, r.birim_id, top.id, "TUKETILDI");

      // Bu topun uretimi sirasinda ayrilan karantina parcalari bu lota baglanir
      const kr = await c.query("SELECT id FROM birim WHERE is_emri_id = $1 AND tip = 'KR' AND lot_id IS NULL", [ie.id]);
      for (const r of kr.rows) {
        await c.query("UPDATE birim SET lot_id = $1 WHERE id = $2", [lot.id, r.id]);
        await bagla(c, req.ctx, top.id, r.id, "AYRILDI");
      }

      await olayYaz(c, req.ctx, { tip: OLAY.URETIM, birimId: top.id, isEmriId: ie.id, miktar: metraj, olcuBirimi: ie.urun_birimi, veri: { agirlik } });
      const etiket = await etiketBas(c, req.ctx, top.id);

      // Agirlik girildiyse metrajla tutarli mi? (bolum 11)
      let uyari = null;
      if (agirlik) {
        const rc = await bir(c, "SELECT sum(gram_metre) AS gm FROM recete WHERE urun_id = $1", [ie.urun_id]);
        if (rc.gm) {
          const beklenen = (metraj * rc.gm) / 1000;
          const fark = Math.abs(agirlik - beklenen) / beklenen;
          if (fark > 0.05) uyari = `Agirlik metrajla uyumsuz: beklenen ~${yuvarla(beklenen, 2)} kg, girilen ${agirlik} kg. Metraji kontrol edin.`;
        }
      }
      return { lot, top, etiket, uyari, karantinaBaglanan: kr.rows.length, sayaclar: await sayaclar(c, ie.id) };
    });
    res.status(201).json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/duraklat  { gerekce? }  -> is durur (mola, ariza, malzeme bekleme...).
// Durus suresi tutulmaz; ariza / bakim KYS'de elle kaydedilir (makine, tarih, durus dk).
router.post(
  "/:no/duraklat",
  rol(ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const gerekce = d.metin(req.body.gerekce, "Aciklama", { zorunlu: false, max: 1000 });
    const sonuc = await tx(async (c) => {
      const ie = await isEmriBul(c, req.ctx.firmaId, req.params.no);
      durumBekle(ie, [S.URETIMDE, S.ILK_PARCA_BEKLIYOR], "duraklatma");
      await durumDegistir(c, req.ctx, ie, S.DURAKLATILDI, gerekce);
      return { no: ie.no, durum: S.DURAKLATILDI };
    });
    res.json(sonuc);
  }),
);

// Periyodik proses olcumu durumu: son uygun olcumden (ilk parca ya da proses) bu yana gecen sure
async function prosesDurumu(c, ie) {
  const ayar = await firmaAyarlari(c, ie.firma_id);
  const plan = await bir(c, "SELECT count(*) AS n FROM karakteristik WHERE urun_id = $1 AND asama = 'PROSES' AND aktif", [ie.urun_id]);
  const aralikDk = Number(ayar.prosesOlcumAraligiDk ?? 120);
  const son = await bir(
    c,
    `SELECT max(zaman) AS t, round((extract(epoch FROM now() - max(zaman)) / 60)::numeric, 1) AS gecen
       FROM olcum WHERE is_emri_id = $1 AND asama IN ('ILK_PARCA','PROSES') AND sonuc = 'UYGUN'`,
    [ie.id],
  );
  // En son olcum seti (ayni anda kaydedilen satirlar) proses olcumu ve icinde uygun olmayan varsa:
  // ayar duzeltilip uygun bir proses olcumu yapilmadan top kapatilamaz.
  const sonSet = await bir(
    c,
    `SELECT bool_or(sonuc = 'UYGUN_DEGIL') AS kotu, bool_and(asama = 'PROSES') AS proses FROM olcum
      WHERE is_emri_id = $1 AND asama IN ('ILK_PARCA','PROSES')
        AND zaman = (SELECT max(zaman) FROM olcum WHERE is_emri_id = $1 AND asama IN ('ILK_PARCA','PROSES'))`,
    [ie.id],
  );
  const planVar = plan.n > 0;
  return {
    planVar,
    aralikDk,
    sonOlcum: son.t,
    gecenDk: son.gecen,
    duzeltmeBekliyor: !!(sonSet && sonSet.proses && sonSet.kotu),
    gecikti: planVar && ie.durum === S.URETIMDE && aralikDk > 0 && son.t !== null && Number(son.gecen) > aralikDk,
  };
}

// POST /api/is-emirleri/:no/proses-olcum  { olcumler: [{ karakteristikId, deger }], aletKod? }
// Uretim sirasinda periyodik kontrol. Bir deger bile tolerans disiysa is emri otomatik DURAKLATILDI olur,
// Operator ayari duzeltip "Devam et" der; top kapatilmadan once uygun bir proses olcumu yapilmalidir.
router.post(
  "/:no/proses-olcum",
  rol(ROLLER.OPERATOR, ROLLER.KALITE, ROLLER.SEF),
  sar(async (req, res) => {
    const olcumler = d.dizi(req.body.olcumler, "Olcumler", { min: 1, max: 50 });
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      durumBekle(ie, [S.URETIMDE], "proses olcumu");
      const ayar = await firmaAyarlari(c, F);
      const alet = await aletKontrol(c, F, req.body.aletKod, { zorunlu: ayar.olcumAletiZorunlu === true });
      const kars = (await c.query("SELECT * FROM karakteristik WHERE urun_id = $1 AND asama = 'PROSES' AND aktif ORDER BY sira", [ie.urun_id])).rows;
      if (!kars.length) throw hatalar.engel(`${ie.urun_kod} icin proses kontrol plani tanimli degil`, "KONTROL_PLANI_YOK");
      const eksik = kars.filter((k) => !olcumler.some((o) => o.karakteristikId === k.id));
      if (eksik.length) throw hatalar.gecersiz(`Eksik olcum: ${eksik.map((k) => k.ad).join(", ")}`);
      const deneme = (await bir(c, "SELECT COALESCE(max(deneme_no),0)+1 AS n FROM olcum WHERE is_emri_id = $1 AND asama = 'PROSES'", [ie.id])).n;
      const sonuclar = [];
      for (const o of olcumler) {
        const k = kars.find((x) => x.id === o.karakteristikId);
        if (!k) throw hatalar.gecersiz("Karakteristik bu urunun proses planinda yok");
        const deger = d.sayi(o.deger, k.ad);
        const uygun = (k.alt_sinir === null || deger >= k.alt_sinir) && (k.ust_sinir === null || deger <= k.ust_sinir);
        await c.query(
          `INSERT INTO olcum (firma_id, is_emri_id, karakteristik_id, asama, deger, sonuc, deneme_no, kullanici_id, alet_id)
           VALUES ($1,$2,$3,'PROSES',$4,$5,$6,$7,$8)`,
          [F, ie.id, k.id, deger, uygun ? "UYGUN" : "UYGUN_DEGIL", deneme, req.ctx.kullaniciId, alet?.id || null],
        );
        sonuclar.push({ karakteristik: k.ad, deger, altSinir: k.alt_sinir, ustSinir: k.ust_sinir, uygun });
      }
      const hepsiUygun = sonuclar.every((x) => x.uygun);
      // Son uygun olcum: bu ana kadar uretilen ve henuz top olarak kapanmamis kisim suphelidir
      const onceki = await bir(
        c,
        "SELECT max(zaman) AS t FROM olcum WHERE is_emri_id = $1 AND asama IN ('ILK_PARCA','PROSES') AND sonuc = 'UYGUN' AND NOT (asama = 'PROSES' AND deneme_no = $2)",
        [ie.id, deneme],
      );
      await olayYaz(c, req.ctx, {
        tip: OLAY.PROSES_OLCUM, isEmriId: ie.id,
        aciklama: hepsiUygun ? "Proses olcumu uygun" : "Proses olcumu tolerans disi - is emri durduruldu",
        veri: { deneme, sonuclar },
      });
      if (!hepsiUygun) {
        await durumDegistir(c, req.ctx, ie, S.DURAKLATILDI,
          `Proses olcumu tolerans disi: ${sonuclar.filter((x) => !x.uygun).map((x) => `${x.karakteristik} ${x.deger}`).join(", ")}`);
      }
      return {
        uygun: hepsiUygun,
        deneme,
        sonuclar,
        durum: hepsiUygun ? S.URETIMDE : S.DURAKLATILDI,
        supheliAralik: hepsiUygun ? null : { baslangic: onceki.t, bitis: new Date().toISOString() },
      };
    });
    res.json(sonuc);
  }),
);

// Miktar dengesi (bolum 11)
// Recetedeki HER malzeme icin: bu kadar kg tuketildiyse en fazla kac metre uretilebilirdi?
//   beklenen_i = tuketilen_kg_i * 1000 / gram_metre_i   (hic tuketilmediyse 0)
// Urun tum malzemelere ihtiyac duydugu icin beklenen = en kucuk beklenen_i.
// Uretilen = top metrajlari + karantinaya ayrilanlar (karantina da makineden cikan urundur).
async function dengeHesapla(c, ie, toleransYuzde) {
  const tuketim = await c.query(
    `SELECT b.malzeme_id, m.kod, sum(g.tuketilen) AS kg
       FROM is_emri_baglama g JOIN birim b ON b.id = g.birim_id JOIN malzeme m ON m.id = b.malzeme_id
      WHERE g.is_emri_id = $1 GROUP BY b.malzeme_id, m.kod`,
    [ie.id],
  );
  const recete = await c.query(
    "SELECT r.malzeme_id, r.gram_metre, m.kod FROM recete r JOIN malzeme m ON m.id = r.malzeme_id WHERE r.urun_id = $1 ORDER BY m.kod",
    [ie.urun_id],
  );
  const sayac = await sayaclar(c, ie.id);
  const kalemler = recete.rows.map((r) => {
    const t = tuketim.rows.find((x) => x.malzeme_id === r.malzeme_id);
    const kg = yuvarla(t ? t.kg : 0);
    return {
      malzeme: r.kod,
      tuketilenKg: kg,
      gramMetre: r.gram_metre,
      gerekenKg: yuvarla(((sayac.uretilen + sayac.karantina) * r.gram_metre) / 1000),
      beklenenMetraj: yuvarla((kg * 1000) / r.gram_metre, 2),
      eksik: kg === 0,
    };
  });
  const beklenen = kalemler.length ? Math.min(...kalemler.map((k) => k.beklenenMetraj)) : null;
  const uretilenToplam = yuvarla(sayac.uretilen + sayac.karantina, 2);
  const fark = beklenen !== null ? yuvarla(beklenen - uretilenToplam, 2) : null;
  const farkYuzde = beklenen ? yuvarla((fark / beklenen) * 100, 2) : beklenen === 0 && uretilenToplam > 0 ? -100 : null;
  const hedef = Number(ie.hedef_miktar);
  return {
    kalemler,
    eksikMalzeme: kalemler.filter((k) => k.eksik).map((k) => k.malzeme),
    beklenenMetraj: beklenen,
    topMetraji: sayac.uretilen,
    karantina: sayac.karantina,
    uretilenToplam,
    fark,
    farkYuzde,
    toleransYuzde,
    toleransAsildi: farkYuzde !== null && Math.abs(farkYuzde) > toleransYuzde,
    hedefMiktar: hedef,
    hedefFarki: yuvarla(uretilenToplam - hedef, 2),
    hedefGerceklesmeYuzde: hedef > 0 ? yuvarla((uretilenToplam / hedef) * 100, 2) : null,
  };
}

// POST /api/is-emirleri/:no/bitir  { iadeler: [{ barkod, kalanMiktar }], aciklama? }  (bolum 8.2)
router.post(
  "/:no/bitir",
  rol(ROLLER.OPERATOR, ROLLER.SEF),
  sar(async (req, res) => {
    const iadeler = Array.isArray(req.body.iadeler) ? req.body.iadeler : [];
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const ie = await isEmriBul(c, F, req.params.no);
      durumBekle(ie, [S.URETIMDE, S.DURAKLATILDI], "bitirme");
      const acikKr = await bir(c, "SELECT count(*) AS n FROM birim WHERE is_emri_id = $1 AND tip = 'KR' AND lot_id IS NULL", [ie.id]);
      if (acikKr.n) throw hatalar.engel("Son toptan sonra ayrilan karantina parcalari var. Once 'Topu Bitir' ile son topu kapatin.", "ACIK_KARANTINA");

      const aktifler = await c.query("SELECT * FROM is_emri_baglama WHERE is_emri_id = $1 AND cikarma_zamani IS NULL FOR UPDATE", [ie.id]);
      const kapanan = [];
      for (const g of aktifler.rows) {
        const birim = await bir(c, "SELECT barkod FROM birim WHERE id = $1", [g.birim_id]);
        const iade = iadeler.find((x) => barkodCoz(x.barkod) === birim.barkod);
        const kalan = iade ? d.sayi(iade.kalanMiktar, `${birim.barkod} kalan miktar`, { min: 0 }) : 0;
        kapanan.push(await baglamaKapat(c, req.ctx, ie, g, kalan));
      }
      const ayar = await firmaAyarlari(c, F);
      const denge = await dengeHesapla(c, ie, ayar.dengeToleransiYuzde ?? 3);
      const yeni = denge.toleransAsildi ? S.TAMAMLANDI_FARK : S.TAMAMLANDI;
      await c.query("UPDATE is_emri SET bitis = now(), denge = $1 WHERE id = $2", [denge, ie.id]);
      await durumDegistir(c, req.ctx, ie, yeni, req.body.aciklama);
      return { no: ie.no, durum: yeni, denge, kapananBaglamalar: kapanan };
    });
    res.json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/fark-aciklamasi  { aciklama }  -> sef farki aciklar
router.post(
  "/:no/fark-aciklamasi",
  rol(ROLLER.SEF),
  sar(async (req, res) => {
    const aciklama = d.metin(req.body.aciklama, "Aciklama", { max: 2000 });
    const sonuc = await tx(async (c) => {
      const ie = await isEmriBul(c, req.ctx.firmaId, req.params.no);
      durumBekle(ie, [S.TAMAMLANDI_FARK], "fark aciklamasi");
      await c.query("UPDATE is_emri SET denge = denge || jsonb_build_object('farkAciklamasi', $1::text) WHERE id = $2", [aciklama, ie.id]);
      await durumDegistir(c, req.ctx, ie, S.TAMAMLANDI, aciklama);
      return { no: ie.no, durum: S.TAMAMLANDI };
    });
    res.json(sonuc);
  }),
);

// PATCH /api/is-emirleri/:no  { hedefMiktar?, makineId?, oncelik?, planlananTarih?, gerekce }
router.patch(
  "/:no",
  rol(ROLLER.SEF),
  sar(async (req, res) => {
    const b = req.body;
    const sonuc = await tx(async (c) => {
      const ie = await isEmriBul(c, req.ctx.firmaId, req.params.no);
      if ([S.TAMAMLANDI, S.TAMAMLANDI_FARK, S.IPTAL].includes(ie.durum)) throw hatalar.engel("Kapanmis is emri degistirilemez", "YANLIS_DURUM");
      const yeni = {};
      if ("hedefMiktar" in b) yeni.hedef_miktar = d.sayi(b.hedefMiktar, "Hedef miktar", { pozitif: true });
      if ("oncelik" in b) yeni.oncelik = d.sayi(b.oncelik, "Oncelik", { min: 1, max: 5 });
      if ("planlananTarih" in b) yeni.planlanan_tarih = b.planlananTarih || null;
      if ("makineId" in b) {
        if (ie.durum !== S.PLANLANDI) throw hatalar.engel("Makine yalnizca baslamamis is emrinde degistirilebilir", "YANLIS_DURUM");
        const mk = await bir(c, "SELECT id FROM makine WHERE id = $1 AND firma_id = $2 AND aktif", [d.metin(b.makineId, "Makine", { max: 40 }), req.ctx.firmaId]);
        if (!mk) throw hatalar.gecersiz("Makine bulunamadi veya pasif");
        yeni.makine_id = mk.id;
      }
      if ("planlananTarih" in b && b.planlananTarih && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.planlananTarih))) throw hatalar.gecersiz("Planlanan tarih YYYY-AA-GG olmali");
      const kolonlar = Object.keys(yeni);
      if (!kolonlar.length) throw hatalar.gecersiz("Degistirilecek alan yok");
      const gerekce = d.metin(b.gerekce, "Gerekce", { zorunlu: ie.durum !== S.PLANLANDI, max: 1000 });
      const set = kolonlar.map((k, i) => `${k} = $${i + 2}`).join(", ");
      const r = await bir(c, `UPDATE is_emri SET ${set} WHERE id = $1 RETURNING *`, [ie.id, ...kolonlar.map((k) => yeni[k])]);
      const degisenler = farklar(ie, yeni, kolonlar);
      await izYaz(c, req.ctx, { tablo: "is_emri", kayitId: ie.id, islem: "GUNCELLEME", degisiklikler: degisenler, gerekce });
      // Onaylanmis ama baslamamis is emrinin miktari/makinesi degisirse onay gecersiz olur, yeniden onay gerekir
      const kritik = degisenler.some((x) => ["hedef_miktar", "makine_id"].includes(x.alan));
      const onaySifirlandi = kritik && ie.durum === S.PLANLANDI
        ? await onaySifirla(c, req.ctx, "IS_EMRI", ie.no, `Is emri degisti (${degisenler.map((x) => x.alan).join(", ")}), yeniden onay gerekli`)
        : false;
      return { ...r, onaySifirlandi };
    });
    res.json(sonuc);
  }),
);

// POST /api/is-emirleri/:no/iptal  { gerekce }  -> yalnizca baslamamis is emri
router.post(
  "/:no/iptal",
  rol(ROLLER.SEF),
  sar(async (req, res) => {
    const gerekce = d.metin(req.body.gerekce, "Gerekce", { max: 1000 });
    const sonuc = await tx(async (c) => {
      const ie = await isEmriBul(c, req.ctx.firmaId, req.params.no);
      durumBekle(ie, [S.PLANLANDI], "iptal");
      if (gerekce.length < 5) throw hatalar.gecersiz("Iptal gerekcesi en az 5 karakter olmali");
      await durumDegistir(c, req.ctx, ie, S.IPTAL, gerekce);
      await c.query("UPDATE is_emri SET iptal_eden = $1, iptal_zamani = now(), iptal_gerekcesi = $2 WHERE id = $3", [req.ctx.kullaniciId, gerekce, ie.id]);
      return { no: ie.no, durum: S.IPTAL };
    });
    res.json(sonuc);
  }),
);

module.exports = router;
