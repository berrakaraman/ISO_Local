// Tanimlar (bolum 15.1): makine, malzeme, urun, recete, kontrol plani, hata kodu...
// Silme yoktur; kayit "aktif: false" yapilarak pasife alinir. Her degisiklik izlenir.
const express = require("express");
const bcrypt = require("bcryptjs");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { izYaz, farklar } = require("../services/iz");

const router = express.Router();

// Her tanim turu: tablo, alanlar (istek adi -> kolon + tip), siralama
// Tip: 'kod' | 'metin' | 'sayi' | 'uuid' | dizi (secenekler). Sonu '?' ise zorunlu degil.
const TURLER = {
  makineler: {
    tablo: "makine",
    sirala: "kod",
    alanlar: { kod: "kod", ad: "metin", tip: ["ORGU", "EKSTRUZYON", "METRAJ", "MASURA", "DIGER"], planX: "sayi?", planY: "sayi?" },
  },
  malzemeler: { tablo: "malzeme", sirala: "kod", alanlar: { kod: "kod", ad: "metin", olcuBirimi: "metin?" } },
  tedarikciler: { tablo: "tedarikci", sirala: "unvan", alanlar: { unvan: "metin", onayDurumu: ["ONAYLI", "SARTLI", "ASKIDA"] } },
  musteriler: { tablo: "musteri", sirala: "unvan", alanlar: { unvan: "metin", crmRef: "metin?" } },
  urunler: {
    tablo: "urun",
    sirala: "kod",
    alanlar: { kod: "kod", ad: "metin", olcuBirimi: "metin?", kesimBoyu: "sayi?", numuneBoyu: "sayi?" },
  },
  receteler: { tablo: "recete", sirala: "urun_id", alanlar: { urunId: "uuid", malzemeId: "uuid", gramMetre: "sayi" }, aktifYok: true },
  karakteristikler: {
    tablo: "karakteristik",
    sirala: "urun_id, asama, sira",
    alanlar: {
      urunId: "uuid",
      asama: ["ILK_PARCA", "PROSES", "METRAJ", "SON_KONTROL"],
      ad: "metin",
      nominal: "sayi?",
      altSinir: "sayi?",
      ustSinir: "sayi?",
      olcuBirimi: "metin?",
      sira: "sayi?",
    },
  },
  "hata-kodlari": { tablo: "hata_kodu", sirala: "kod", alanlar: { kod: "kod", aciklama: "metin" } },
  "depo-yerleri": { tablo: "depo_yeri", sirala: "kod", alanlar: { kod: "kod", ad: "metin?", tip: ["RAF", "KARANTINA", "NUMUNE", "SEVK"] } },
};

const kolon = (ad) => ad.replace(/[A-Z]/g, (h) => `_${h.toLowerCase()}`);

// Istek govdesinden alanlari dogrular. kismi=true ise yalnizca gonderilenler (PATCH)
function alanlariOku(tur, govde, kismi) {
  const sonuc = {};
  for (const [ad, tip] of Object.entries(tur.alanlar)) {
    if (kismi && !(ad in govde)) continue;
    const istege = typeof tip === "string" && tip.endsWith("?");
    const t = typeof tip === "string" ? tip.replace("?", "") : tip;
    const v = govde[ad];
    let deger;
    if (Array.isArray(t)) deger = d.secim(v, ad, t, { zorunlu: !kismi });
    else if (t === "kod") deger = v === undefined && kismi ? undefined : d.kod(v, ad);
    else if (t === "sayi") deger = d.sayi(v, ad, { zorunlu: !istege && !kismi });
    else if (t === "uuid") deger = d.metin(v, ad, { zorunlu: !kismi, max: 40 });
    else deger = d.metin(v, ad, { zorunlu: !istege && !kismi });
    if (deger !== undefined) sonuc[kolon(ad)] = deger;
  }
  if (!tur.aktifYok && "aktif" in govde) sonuc.aktif = d.bool(govde.aktif);
  return sonuc;
}

function turAl(req) {
  const tur = TURLER[req.params.tur];
  if (!tur) throw hatalar.bulunamadi(`Boyle bir tanim turu yok: ${req.params.tur}`);
  return tur;
}

// GET /api/tanimlar  -> tum aktif tanimlar tek seferde (formlardaki secim listeleri icin)
router.get(
  "/",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const sonuc = {};
    for (const [ad, tur] of Object.entries(TURLER)) {
      const aktifFiltre = tur.aktifYok ? "" : "AND aktif";
      const r = await pool.query(`SELECT * FROM ${tur.tablo} WHERE firma_id = $1 ${aktifFiltre} ORDER BY ${tur.sirala}`, [F]);
      sonuc[ad] = r.rows;
    }
    const firma = await pool.query("SELECT kod, unvan, saat_dilimi, ayarlar FROM firma WHERE id = $1", [F]);
    sonuc.firma = firma.rows[0];
    res.json(sonuc);
  }),
);

// ---- Kullanicilar (yalnizca ADMIN) ----
const KULLANICI_ALANLARI = "id, kullanici_adi, ad_soyad, sicil_no, roller, aktif, son_giris, olusturma_zamani";
const rolDogrula = (roller) => {
  d.dizi(roller, "Roller");
  for (const r of roller) d.secim(r, "Rol", Object.values(ROLLER));
  return roller;
};

router.get(
  "/kullanicilar",
  rol(ROLLER.ADMIN),
  sar(async (req, res) => {
    const r = await pool.query(`SELECT ${KULLANICI_ALANLARI} FROM kullanici WHERE firma_id = $1 ORDER BY ad_soyad`, [req.ctx.firmaId]);
    res.json(r.rows);
  }),
);

router.post(
  "/kullanicilar",
  rol(ROLLER.ADMIN),
  sar(async (req, res) => {
    const b = req.body;
    const adSoyad = d.metin(b.adSoyad, "Ad soyad", { max: 100 });
    const kullaniciAdi = d.metin(b.kullaniciAdi, "Kullanici adi", { zorunlu: false, max: 60 })?.toLowerCase() || null;
    const sicilNo = d.metin(b.sicilNo, "Sicil no", { zorunlu: false, max: 30 });
    const sifre = d.metin(b.sifre, "Sifre", { zorunlu: false, max: 200 });
    const pin = d.metin(b.pin, "PIN", { zorunlu: false, max: 12 });
    const roller = rolDogrula(b.roller);
    if (sifre && sifre.length < 8) throw hatalar.gecersiz("Sifre en az 8 karakter olmali");
    if (pin && !/^\d{4,8}$/.test(pin)) throw hatalar.gecersiz("PIN 4-8 haneli rakam olmali");
    if (!kullaniciAdi && !sicilNo) throw hatalar.gecersiz("Kullanici adi ya da sicil no gerekli");
    if (kullaniciAdi && !sifre) throw hatalar.gecersiz("Kullanici adi verildiyse sifre de gerekli");
    if (sicilNo && !pin) throw hatalar.gecersiz("Sicil no verildiyse PIN de gerekli");

    const yeni = await tx(async (c) => {
      const k = await bir(
        c,
        `INSERT INTO kullanici (firma_id, kullanici_adi, ad_soyad, sicil_no, sifre_ozeti, pin_ozeti, roller)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${KULLANICI_ALANLARI}`,
        [req.ctx.firmaId, kullaniciAdi, adSoyad, sicilNo, sifre ? await bcrypt.hash(sifre, 10) : null, pin ? await bcrypt.hash(pin, 10) : null, roller],
      );
      await izYaz(c, req.ctx, {
        tablo: "kullanici",
        kayitId: k.id,
        islem: "EKLEME",
        degisiklikler: farklar({}, { kullanici_adi: kullaniciAdi, ad_soyad: adSoyad, sicil_no: sicilNo, roller }, ["kullanici_adi", "ad_soyad", "sicil_no", "roller"]),
      });
      return k;
    });
    res.status(201).json(yeni);
  }),
);

router.patch(
  "/kullanicilar/:id",
  rol(ROLLER.ADMIN),
  sar(async (req, res) => {
    const b = req.body;
    const guncel = await tx(async (c) => {
      const eski = await bir(c, "SELECT * FROM kullanici WHERE id = $1 AND firma_id = $2 FOR UPDATE", [req.params.id, req.ctx.firmaId]);
      if (!eski) throw hatalar.bulunamadi("Kullanici bulunamadi");
      const yeni = {};
      if ("adSoyad" in b) yeni.ad_soyad = d.metin(b.adSoyad, "Ad soyad", { max: 100 });
      if ("roller" in b) yeni.roller = rolDogrula(b.roller);
      if ("aktif" in b) yeni.aktif = d.bool(b.aktif);
      if (eski.id === req.ctx.kullaniciId && yeni.aktif === false) throw hatalar.engel("Kendi hesabinizi pasife alamazsiniz");
      const degisiklikler = farklar(eski, yeni, ["ad_soyad", "roller", "aktif"]);
      if (b.sifre) {
        if (String(b.sifre).length < 8) throw hatalar.gecersiz("Sifre en az 8 karakter olmali");
        yeni.sifre_ozeti = await bcrypt.hash(String(b.sifre), 10);
        degisiklikler.push({ alan: "sifre", eski: "***", yeni: "*** (degistirildi)" });
      }
      if (b.pin) {
        if (!/^\d{4,8}$/.test(String(b.pin))) throw hatalar.gecersiz("PIN 4-8 haneli rakam olmali");
        yeni.pin_ozeti = await bcrypt.hash(String(b.pin), 10);
        degisiklikler.push({ alan: "pin", eski: "***", yeni: "*** (degistirildi)" });
      }
      const kolonlar = Object.keys(yeni);
      if (!kolonlar.length) throw hatalar.gecersiz("Degistirilecek alan yok");
      const set = kolonlar.map((k, i) => `${k} = $${i + 3}`).join(", ");
      const r = await bir(c, `UPDATE kullanici SET ${set} WHERE id = $1 AND firma_id = $2 RETURNING ${KULLANICI_ALANLARI}`, [
        eski.id,
        req.ctx.firmaId,
        ...kolonlar.map((k) => yeni[k]),
      ]);
      await izYaz(c, req.ctx, { tablo: "kullanici", kayitId: eski.id, islem: "GUNCELLEME", degisiklikler, gerekce: b.gerekce });
      return r;
    });
    res.json(guncel);
  }),
);

// ---- Genel tanim uclari ----

// GET /api/tanimlar/:tur?hepsi=1  (hepsi=1 pasifleri de getirir)
router.get(
  "/:tur",
  sar(async (req, res) => {
    const tur = turAl(req);
    const filtre = tur.aktifYok || req.query.hepsi === "1" ? "" : "AND aktif";
    const r = await pool.query(`SELECT * FROM ${tur.tablo} WHERE firma_id = $1 ${filtre} ORDER BY ${tur.sirala}`, [req.ctx.firmaId]);
    res.json(r.rows);
  }),
);

// POST /api/tanimlar/:tur
router.post(
  "/:tur",
  rol(ROLLER.ADMIN),
  sar(async (req, res) => {
    const tur = turAl(req);
    const alanlar = alanlariOku(tur, req.body, false);
    const kolonlar = Object.keys(alanlar);
    const yeni = await tx(async (c) => {
      const r = await bir(
        c,
        `INSERT INTO ${tur.tablo} (firma_id, ${kolonlar.join(", ")}) VALUES ($1, ${kolonlar.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING *`,
        [req.ctx.firmaId, ...kolonlar.map((k) => alanlar[k])],
      );
      await izYaz(c, req.ctx, { tablo: tur.tablo, kayitId: r.id, islem: "EKLEME", degisiklikler: farklar({}, alanlar, kolonlar) });
      return r;
    });
    res.status(201).json(yeni);
  }),
);

// PATCH /api/tanimlar/:tur/:id   { ...degisen alanlar, aktif?, gerekce? }
router.patch(
  "/:tur/:id",
  rol(ROLLER.ADMIN),
  sar(async (req, res) => {
    const tur = turAl(req);
    const alanlar = alanlariOku(tur, req.body, true);
    const kolonlar = Object.keys(alanlar);
    if (!kolonlar.length) throw hatalar.gecersiz("Degistirilecek alan yok");
    const guncel = await tx(async (c) => {
      const eski = await bir(c, `SELECT * FROM ${tur.tablo} WHERE id = $1 AND firma_id = $2 FOR UPDATE`, [req.params.id, req.ctx.firmaId]);
      if (!eski) throw hatalar.bulunamadi();
      const set = kolonlar.map((k, i) => `${k} = $${i + 3}`).join(", ");
      const r = await bir(c, `UPDATE ${tur.tablo} SET ${set} WHERE id = $1 AND firma_id = $2 RETURNING *`, [
        eski.id,
        req.ctx.firmaId,
        ...kolonlar.map((k) => alanlar[k]),
      ]);
      const islem = alanlar.aktif === false ? "IPTAL" : "GUNCELLEME";
      await izYaz(c, req.ctx, { tablo: tur.tablo, kayitId: eski.id, islem, degisiklikler: farklar(eski, alanlar, kolonlar), gerekce: req.body.gerekce });
      return r;
    });
    res.json(guncel);
  }),
);

module.exports = router;
