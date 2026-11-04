// Kullaniciya gosterilecek hatalar icin sinif ve async route sarmalayicisi.

class HttpHata extends Error {
  constructor(durum, mesaj, kod, detay) {
    super(mesaj);
    this.durum = durum; // HTTP durum kodu
    this.kod = kod || "HATA"; // frontend'in tanimasi icin sabit kod
    this.detay = detay;
  }
}

const hatalar = {
  gecersiz: (mesaj, detay) => new HttpHata(400, mesaj, "GECERSIZ_ISTEK", detay),
  yetkisiz: (mesaj = "Oturum gerekli") => new HttpHata(401, mesaj, "OTURUM_YOK"),
  yasak: (mesaj = "Bu islem icin yetkiniz yok") => new HttpHata(403, mesaj, "YETKI_YOK"),
  bulunamadi: (mesaj = "Kayit bulunamadi") => new HttpHata(404, mesaj, "BULUNAMADI"),
  // Is kurali ihlali: islem engellenir (ornek: onaysiz hammadde baglanamaz)
  engel: (mesaj, kod = "ENGELLENDI", detay) => new HttpHata(409, mesaj, kod, detay),
};

// async route icindeki hatalari hata middleware'ine iletir
const sar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpHata, hatalar, sar };
