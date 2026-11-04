// Basit istek dogrulama yardimcilari (ek kutuphane gerektirmez).
const { hatalar } = require("./hata");

function metin(deger, ad, { zorunlu = true, max = 500 } = {}) {
  if (deger === undefined || deger === null || String(deger).trim() === "") {
    if (zorunlu) throw hatalar.gecersiz(`${ad} zorunlu`);
    return null;
  }
  const s = String(deger).trim();
  if (s.length > max) throw hatalar.gecersiz(`${ad} en fazla ${max} karakter olabilir`);
  return s;
}

function sayi(deger, ad, { zorunlu = true, min, max, pozitif = false } = {}) {
  if (deger === undefined || deger === null || deger === "") {
    if (zorunlu) throw hatalar.gecersiz(`${ad} zorunlu`);
    return null;
  }
  const n = typeof deger === "string" ? Number(deger.replace(",", ".")) : Number(deger);
  if (!Number.isFinite(n)) throw hatalar.gecersiz(`${ad} sayi olmali`);
  if (pozitif && n <= 0) throw hatalar.gecersiz(`${ad} sifirdan buyuk olmali`);
  if (min !== undefined && n < min) throw hatalar.gecersiz(`${ad} en az ${min} olmali`);
  if (max !== undefined && n > max) throw hatalar.gecersiz(`${ad} en fazla ${max} olabilir`);
  return n;
}

function secim(deger, ad, secenekler, { zorunlu = true } = {}) {
  if (deger === undefined || deger === null || deger === "") {
    if (zorunlu) throw hatalar.gecersiz(`${ad} zorunlu`);
    return null;
  }
  if (!secenekler.includes(deger)) throw hatalar.gecersiz(`${ad} su degerlerden biri olmali: ${secenekler.join(", ")}`);
  return deger;
}

function dizi(deger, ad, { min = 1, max = 500 } = {}) {
  if (!Array.isArray(deger)) throw hatalar.gecersiz(`${ad} liste olmali`);
  if (deger.length < min) throw hatalar.gecersiz(`${ad} en az ${min} eleman icermeli`);
  if (deger.length > max) throw hatalar.gecersiz(`${ad} en fazla ${max} eleman icerebilir`);
  return deger;
}

// Kod alanlari: yalnizca A-Z, 0-9 ve tire (barkod uyumu - bolum 10.4)
function kod(deger, ad) {
  const s = metin(deger, ad, { max: 40 }).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(s)) {
    throw hatalar.gecersiz(`${ad} yalnizca buyuk harf, rakam ve tire icerebilir (Turkce karakter yok): ${s}`);
  }
  return s;
}

const bool = (deger) => deger === true || deger === "true" || deger === 1 || deger === "1";

module.exports = { metin, sayi, secim, dizi, kod, bool };
