// Miktar hesaplari icin ortak yardimcilar.
// Metre ve kg degerleri ondalikli oldugu icin (0.1 + 0.2 = 0.30000000000000004)
// karsilastirmalar ve kayitlar 3 haneye yuvarlanarak yapilir.

const HASSASIYET = 3; // 1 mm / 1 g
const ESIK = 0.0005; // bu kadar fark "esit" sayilir

function yuvarla(n, h = HASSASIYET) {
  if (n === null || n === undefined) return null;
  const s = Number(n);
  if (!Number.isFinite(s)) return null;
  const k = 10 ** h;
  return Math.round((s + Number.EPSILON) * k) / k;
}

const esit = (a, b) => Math.abs(Number(a) - Number(b)) < ESIK;
const sifirMi = (a) => esit(a, 0);
const topla = (dizi) => yuvarla(dizi.reduce((a, x) => a + Number(x || 0), 0));

module.exports = { yuvarla, esit, sifirMi, topla, HASSASIYET };
