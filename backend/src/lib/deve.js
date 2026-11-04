// Veritabani snake_case doner (ilk_miktar); API cevaplari camelCase olsun (ilkMiktar).
// app.js'te res.json'a baglanir, boylece tum cevaplar otomatik donusur.

const donustur = (s) => s.replace(/_([a-z0-9])/g, (_, h) => h.toUpperCase());

function deve(deger) {
  if (Array.isArray(deger)) return deger.map(deve);
  if (deger && typeof deger === "object" && !(deger instanceof Date) && !Buffer.isBuffer(deger)) {
    const sonuc = {};
    for (const [k, v] of Object.entries(deger)) sonuc[donustur(k)] = deve(v);
    return sonuc;
  }
  return deger;
}

function deveMiddleware(_req, res, next) {
  const json = res.json.bind(res);
  res.json = (govde) => json(deve(govde));
  next();
}

module.exports = { deve, deveMiddleware };
