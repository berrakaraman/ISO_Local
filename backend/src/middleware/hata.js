// Tum hatalari tek tip JSON'a cevirir: { hata: { kod, mesaj, detay } }
const { HttpHata } = require("../lib/hata");

function bulunamadi(req, _res, next) {
  next(new HttpHata(404, `Boyle bir adres yok: ${req.method} ${req.originalUrl}`, "ADRES_YOK"));
}

// eslint-disable-next-line no-unused-vars
function hataYakala(err, req, res, _next) {
  if (err instanceof HttpHata) {
    return res.status(err.durum).json({ hata: { kod: err.kod, mesaj: err.message, detay: err.detay } });
  }
  // Bozuk JSON govdesi
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ hata: { kod: "GECERSIZ_JSON", mesaj: "Istek govdesi gecerli JSON degil" } });
  }
  // PostgreSQL kisit ihlalleri kullaniciya anlasilir donsun
  if (err.code === "23505") {
    return res.status(409).json({ hata: { kod: "ZATEN_VAR", mesaj: "Bu kayit zaten var", detay: err.detail } });
  }
  if (err.code === "23514" || err.code === "22P02" || err.code === "23503") {
    return res.status(400).json({ hata: { kod: "GECERSIZ_VERI", mesaj: "Gonderilen veri kurallara uymuyor", detay: err.detail || err.message } });
  }
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  res.status(500).json({ hata: { kod: "SUNUCU_HATASI", mesaj: "Beklenmeyen bir hata olustu" } });
}

module.exports = { bulunamadi, hataYakala };
