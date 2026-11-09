// Oturum dogrulama ve rol kontrolu.
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { hatalar } = require("../lib/hata");
const { ROLLER } = require("../lib/sabitler");
const { pool } = require("../config/db");

// Authorization: Bearer <token> basligini dogrular, req.kullanici ve req.ctx'i doldurur.
// Token gecerli olsa bile kullanici veritabaninda hala var ve aktif olmali: veritabani sifirlandiysa,
// kullanici pasife alindiysa ya da firmasi yoksa oturum o an kapanir (401 -> giris ekrani).
// Roller ve ad her istekte veritabanindan okunur; rol degisikligi yeniden giris beklemeden gecerli olur.
async function oturum(req, _res, next) {
  const baslik = req.headers.authorization || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
  if (!token) return next(hatalar.yetkisiz());
  let p;
  try {
    p = jwt.verify(token, env.jwtSecret);
  } catch {
    return next(hatalar.yetkisiz("Oturumun suresi doldu, tekrar giris yapin"));
  }
  try {
    const { rows } = await pool.query(
      `SELECT k.ad_soyad, k.sicil_no, k.roller
         FROM kullanici k JOIN firma f ON f.id = k.firma_id
        WHERE k.id = $1 AND k.firma_id = $2 AND k.aktif`,
      [p.sub, p.firmaId],
    );
    if (!rows.length) return next(hatalar.yetkisiz("Oturum artik gecerli degil, tekrar giris yapin"));
    const k = rows[0];
    req.kullanici = {
      id: p.sub,
      firmaId: p.firmaId,
      adSoyad: k.ad_soyad,
      sicilNo: k.sicil_no,
      roller: k.roller || [],
      kiosk: !!p.kiosk,
    };
    // Servislerin kullandigi baglam: kim, hangi firma, hangi cihaz
    req.ctx = {
      firmaId: p.firmaId,
      kullaniciId: p.sub,
      cihaz: String(req.headers["x-cihaz"] || (p.kiosk ? "kiosk" : "web")).slice(0, 60),
    };
    // Denetci yalnizca okuyabilir
    const yalnizDenetci = req.kullanici.roller.length > 0 && req.kullanici.roller.every((r) => r === ROLLER.DENETCI);
    if (yalnizDenetci && req.method !== "GET") return next(hatalar.yasak("Denetci hesabi kayit degistiremez"));
    next();
  } catch (err) {
    next(err);
  }
}

// Sadece belirtilen rollerden birine sahip olanlar gecer. ADMIN her yere girer.
const rol =
  (...izinli) =>
  (req, _res, next) => {
    const r = req.kullanici?.roller || [];
    if (r.includes(ROLLER.ADMIN) || r.some((x) => izinli.includes(x))) return next();
    next(hatalar.yasak());
  };

module.exports = { oturum, rol };
