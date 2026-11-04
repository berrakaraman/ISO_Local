// Numara uretimi (bolum 10.4). Ayni numara iki kez verilemez, verilen numara
// kayit iptal edilse bile tekrar kullanilmaz. Sayac satiri transaction icinde
// kilitlenerek artirilir.
const { yilAy, ikiHane } = require("../lib/barkod");

async function sayacArtir(client, firmaId, anahtar) {
  const r = await client.query(
    `INSERT INTO sayac (firma_id, anahtar, son_deger) VALUES ($1, $2, 1)
     ON CONFLICT (firma_id, anahtar) DO UPDATE SET son_deger = sayac.son_deger + 1
     RETURNING son_deger`,
    [firmaId, anahtar],
  );
  return r.rows[0].son_deger;
}

// Ornek: yeniNumara(c, firmaId, 'FG') -> 'FG-2610-0347'
async function yeniNumara(client, firmaId, onek, saatDilimi = "Europe/Istanbul") {
  const ya = yilAy(new Date(), saatDilimi);
  const n = await sayacArtir(client, firmaId, `${onek}-${ya}`);
  return `${onek}-${ya}-${String(n).padStart(4, "0")}`;
}

// Bir lotun altindaki sira: 'FG-2610-0347' -> 'FG-2610-0347-03'
async function altNumara(client, firmaId, lotNo) {
  const n = await sayacArtir(client, firmaId, `ALT:${lotNo}`);
  return { barkod: `${lotNo}-${ikiHane(n)}`, sira: n };
}

module.exports = { yeniNumara, altNumara };
