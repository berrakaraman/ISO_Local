// Olcum aleti (kalibrasyon) kontrolu: kalibrasyonu gecmis ya da kullanim disi aletle olcum kabul edilmez.
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");

// Olcum aleti: verilmisse kalibrasyonu gecerli mi? Gecmisse olcum kabul edilmez.
async function aletKontrol(c, firmaId, aletKod, { zorunlu = false } = {}) {
  if (!aletKod) {
    if (zorunlu) throw hatalar.gecersiz("Olcum aleti secilmeli");
    return null;
  }
  const a = await bir(
    c,
    `SELECT a.*, (a.sonraki_kalibrasyon < (now() AT TIME ZONE f.saat_dilimi)::date) AS gecmis
       FROM olcum_aleti a JOIN firma f ON f.id = a.firma_id WHERE a.firma_id = $1 AND a.kod = $2 AND a.aktif`,
    [firmaId, String(aletKod).toUpperCase()],
  );
  if (!a) throw hatalar.gecersiz(`Olcum aleti bulunamadi: ${aletKod}`);
  if (a.durum !== "KULLANIMDA") throw hatalar.engel(`${a.kod} kullanim disi (kalibrasyonu uygun degil). Bu aletle olcum yapilamaz.`, "ALET_KULLANIM_DISI");
  if (!a.sonraki_kalibrasyon || a.gecmis) throw hatalar.engel(`${a.kod} kalibrasyon tarihi gecmis. Once kalibrasyon yapilmali.`, "KALIBRASYON_GECMIS");
  return a;
}

module.exports = { aletKontrol };
