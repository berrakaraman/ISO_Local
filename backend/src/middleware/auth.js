// Oturum dogrulama ve rol kontrolu.
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { hatalar } = require("../lib/hata");
const { ROLLER } = require("../lib/sabitler");

// Authorization: Bearer <token> basligini dogrular, req.kullanici ve req.ctx'i doldurur
function oturum(req, _res, next) {
  const baslik = req.headers.authorization || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
  if (!token) return next(hatalar.yetkisiz());
  try {
    const p = jwt.verify(token, env.jwtSecret);
    req.kullanici = {
      id: p.sub,
      firmaId: p.firmaId,
      adSoyad: p.adSoyad,
      sicilNo: p.sicilNo,
      roller: p.roller || [],
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
  } catch {
    next(hatalar.yetkisiz("Oturumun suresi doldu, tekrar giris yapin"));
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
