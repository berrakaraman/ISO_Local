// Giris uclari: web girisi (kullanici adi + sifre) ve kiosk girisi (kart/sicil + PIN)
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { pool } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const { metin } = require("../lib/dogrula");
const { barkodCoz } = require("../lib/barkod");
const { oturum } = require("../middleware/auth");

const router = express.Router();

// Basit deneme siniri: ayni IP + kullanici icin 5 dakikada 10 basarisiz deneme
const denemeler = new Map();
function denemeKontrol(anahtar) {
  const simdi = Date.now();
  const kayit = denemeler.get(anahtar) || { sayi: 0, ilk: simdi };
  if (simdi - kayit.ilk > 5 * 60 * 1000) {
    denemeler.delete(anahtar);
    return;
  }
  if (kayit.sayi >= 10) throw hatalar.engel("Cok fazla hatali deneme. 5 dakika sonra tekrar deneyin.", "COK_DENEME");
}
function denemeHatali(anahtar) {
  const kayit = denemeler.get(anahtar) || { sayi: 0, ilk: Date.now() };
  kayit.sayi++;
  denemeler.set(anahtar, kayit);
}

async function kullaniciBul(alan, deger, firmaKodu) {
  const r = await pool.query(
    `SELECT k.*, f.kod AS firma_kod, f.unvan AS firma_unvan
       FROM kullanici k JOIN firma f ON f.id = k.firma_id
      WHERE k.${alan} = $1 AND k.aktif AND ($2::text IS NULL OR f.kod = $2)`,
    [deger, firmaKodu],
  );
  if (r.rows.length > 1) throw hatalar.gecersiz("Birden fazla firmada ayni kullanici var, firma kodunu da gonderin");
  return r.rows[0] || null;
}

function tokenUret(k, { kiosk = false } = {}) {
  return jwt.sign(
    { sub: k.id, firmaId: k.firma_id, adSoyad: k.ad_soyad, sicilNo: k.sicil_no, roller: k.roller, kiosk },
    env.jwtSecret,
    { expiresIn: kiosk ? env.kioskJwtSure : env.jwtSure },
  );
}

const disaVer = (k) => ({
  id: k.id,
  adSoyad: k.ad_soyad,
  kullaniciAdi: k.kullanici_adi,
  sicilNo: k.sicil_no,
  roller: k.roller,
  firma: { kod: k.firma_kod, unvan: k.firma_unvan },
});

// POST /api/auth/giris  { kullaniciAdi, sifre, firmaKodu? }
router.post(
  "/giris",
  sar(async (req, res) => {
    const kullaniciAdi = metin(req.body.kullaniciAdi, "Kullanici adi", { max: 60 }).toLowerCase();
    const sifre = metin(req.body.sifre, "Sifre", { max: 200 });
    const firmaKodu = metin(req.body.firmaKodu, "Firma kodu", { zorunlu: false, max: 40 });
    const anahtar = `${req.ip}:${kullaniciAdi}`;
    denemeKontrol(anahtar);

    const k = await kullaniciBul("kullanici_adi", kullaniciAdi, firmaKodu);
    const dogru = k && k.sifre_ozeti && (await bcrypt.compare(sifre, k.sifre_ozeti));
    if (!dogru) {
      denemeHatali(anahtar);
      throw hatalar.yetkisiz("Kullanici adi veya sifre hatali");
    }
    denemeler.delete(anahtar);
    await pool.query("UPDATE kullanici SET son_giris = now() WHERE id = $1", [k.id]);
    res.json({ token: tokenUret(k), kullanici: disaVer(k) });
  }),
);

// POST /api/auth/kiosk  { kart: "PR-1215" ya da sicilNo: "1215", pin, firmaKodu? }
// Kiosk oturumu kisa surelidir (KIOSK_JWT_SURE, varsayilan 10 dk)
router.post(
  "/kiosk",
  sar(async (req, res) => {
    let sicil = req.body.sicilNo ? String(req.body.sicilNo).trim() : null;
    if (!sicil && req.body.kart) sicil = barkodCoz(req.body.kart).replace(/^PR-/, "");
    sicil = metin(sicil, "Personel karti / sicil no", { max: 30 });
    const pin = metin(req.body.pin, "PIN", { max: 12 });
    const firmaKodu = metin(req.body.firmaKodu, "Firma kodu", { zorunlu: false, max: 40 });
    const anahtar = `${req.ip}:kiosk:${sicil}`;
    denemeKontrol(anahtar);

    const k = await kullaniciBul("sicil_no", sicil, firmaKodu);
    const dogru = k && k.pin_ozeti && (await bcrypt.compare(pin, k.pin_ozeti));
    if (!dogru) {
      denemeHatali(anahtar);
      throw hatalar.yetkisiz("Kart veya PIN hatali");
    }
    denemeler.delete(anahtar);
    res.json({ token: tokenUret(k, { kiosk: true }), kullanici: disaVer(k) });
  }),
);

// GET /api/auth/ben  -> oturumdaki kullanici
router.get(
  "/ben",
  oturum,
  sar(async (req, res) => {
    const k = await kullaniciBul("id", req.kullanici.id, null);
    if (!k) throw hatalar.yetkisiz("Kullanici bulunamadi veya pasif");
    res.json({ kullanici: disaVer(k), kiosk: req.kullanici.kiosk });
  }),
);

module.exports = router;
