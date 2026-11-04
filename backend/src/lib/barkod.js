// Okutulan degeri cozumler (bolum 10.3).
// Okuyucu ya duz numara ("FG-2610-0347-02") ya da QR adresi
// ("https://.../b/FG-2610-0347-02") gonderir. Ikisinden de numarayi cikarir.

function barkodCoz(ham) {
  if (ham === undefined || ham === null) return "";
  let s = String(ham).trim();
  // QR adresi ise son parcayi al
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const parcalar = u.pathname.split("/").filter(Boolean);
      s = parcalar[parcalar.length - 1] || "";
    } catch {
      /* gecersiz URL: oldugu gibi birak */
    }
  }
  // Bazi okuyucular sona \r, \n veya bosluk ekler; kucuk harfle okuyanlar da olur
  return decodeURIComponent(s).replace(/\s+/g, "").toUpperCase();
}

// Firmanin saat diliminde YYAA (yil + ay) - ornek: 2610
function yilAy(tarih = new Date(), saatDilimi = "Europe/Istanbul") {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: saatDilimi, year: "2-digit", month: "2-digit" })
    .formatToParts(tarih)
    .reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return `${p.year}${p.month}`;
}

const ikiHane = (n) => String(n).padStart(2, "0");

module.exports = { barkodCoz, yilAy, ikiHane };
