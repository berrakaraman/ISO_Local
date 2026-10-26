const express = require("express");
const router = express.Router();

let excelData = {
  yonetimPaneli: [
    {
      id: 1,
      tarih: "25.09.2026",
      makine: "Ö01",
      lotNo: "260925-Ö01-001",
      urunKodu: "KTS-PA-010",
      uretimMiktari: 1100,
      uygun: 1060,
      karantina: 20,
      redHurda: 20,
      fireOrani: "%3.6",
      durum: "Açık",
    },
  ],
  f01Hammadde: [
    {
      id: 1,
      girisTarihi: "25.09.2026",
      hammaddeKodu: "PA66-01",
      hammaddeAdi: "PA66",
      tedarikci: "ABC",
      tedarikciLot: "PA66-260920-08",
      icLot: "-",
      girisMiktari: 500,
      kullanilan: 82,
      kalan: 418,
      depoYeri: "H-03",
      kontrolSonucu: "Uygun",
      kontrolEden: "Kalite",
    },
  ],
  f02UretimEmri: [
    {
      id: 1,
      emriNo: "ÜE-260925-015",
      siparisNo: "S-4587",
      musteri: "ABC Otomotiv",
      urunKodu: "KTS-PA-010",
      urunAdi: "Kablo Toplama Çorabı",
      planlananMiktar: 1250,
      birim: "m",
      makine: "Ö03",
      tarih: "25.09.2026",
      sorumlu: "Üretim Sorumlusu",
      durum: "Planlandı",
    },
  ],
  f03UretimLot: [
    {
      id: 1,
      tarih: "25.09.2026",
      emriNo: "ÜE-260925-015",
      lotNo: "260925-Ö03-002",
      urunKodu: "KTS-PA-010",
      makine: "Ö03",
      operator: "Ahmet",
      vardiya: "Gündüz",
      baslangic: "08:15",
      bitis: "16:40",
      hammaddeLot: "PA66-260920-08",
      toplamUretim: 1250,
      uygunMiktar: 1180,
      karantina: 40,
      redHurda: 30,
      fireOrani: "%5.6",
      lotDurumu: "Kapatıldı",
    },
  ],
  f04KarantinaRed: [
    {
      id: 1,
      kayitTarihi: "25.09.2026",
      urunKodu: "KTS-PA-010",
      lotNo: "260925-Ö03-002",
      makine: "Ö03",
      sepet: "Sarı sepet",
      hataKodu: "H-04",
      hataAciklamasi: "Örgü sıklığı uygunsuz",
      miktar: 40,
      birim: "m",
      karar: "Yeniden işleme",
      kararVeren: "Kalite Sorumlusu",
      etiketNo: "KAR-260925-001",
    },
  ],
  f05KaliteKontrol: [
    {
      id: 1,
      tarihSaat: "25.09.2026 08:30",
      urunKodu: "KTS-PA-010",
      lotNo: "260925-Ö03-002",
      makine: "Ö03",
      kontrolTuru: "İlk parça",
      parametre: "Örgü sıklığı",
      spesifikasyon: "Onaylı ürün spesifikasyonu",
      sonuc: "Uygun",
      karar: "Uygun",
      kontrolEden: "Kalite Kontrol",
    },
  ],
  f06Sevkiyat: [
    {
      id: 1,
      sevkTarihi: "26.09.2026",
      sevkNo: "SV-260926-024",
      musteri: "ABC Otomotiv",
      urunKodu: "KTS-PA-010",
      lotNo: "260925-Ö03-002",
      sevkMiktari: 1180,
      birim: "m",
      irsaliyeNo: "IRS-00024",
      paketKontrol: "Uygun",
      hazirlayan: "Depo",
      onaylayan: "Kalite",
    },
  ],
  tanimlar: {
    makineKodlari: [
      { id: 1, kod: "Ö01", aciklama: "Örgü Makinesi 1" },
      { id: 2, kod: "Ö02", aciklama: "Örgü Makinesi 2" },
    ],
    hataKodlari: [
      { id: 1, kod: "H-01", aciklama: "Ölçü uygunsuz" },
      { id: 2, kod: "H-02", aciklama: "Çap uygunsuz" },
    ],
  },
};

router.get("/", (req, res) => res.json(excelData));

router.post("/:section", (req, res) => {
  const { section } = req.params;
  const newItem = { ...req.body, id: Date.now() };

  if (section === "tanimlar") {
    const { subCategory } = req.body;
    if (!excelData.tanimlar[subCategory])
      return res.status(400).json({ error: "Geçersiz alt kategori" });
    excelData.tanimlar[subCategory].unshift(newItem);
    return res.status(201).json({ message: "Tanım eklendi", item: newItem });
  }

  if (!excelData[section])
    return res.status(400).json({ error: "Geçersiz kategori" });
  excelData[section].unshift(newItem);
  res.status(201).json({ message: "Kayıt eklendi", item: newItem });
});

router.delete("/:section/:id", (req, res) => {
  const { section, id } = req.params;
  const { subCategory } = req.query;

  if (section === "tanimlar") {
    if (!excelData.tanimlar[subCategory])
      return res.status(400).json({ error: "Geçersiz alt kategori" });
    excelData.tanimlar[subCategory] = excelData.tanimlar[subCategory].filter(
      (item) => item.id != id,
    );
    return res.json({ message: "Tanım silindi" });
  }

  if (!excelData[section])
    return res.status(400).json({ error: "Geçersiz kategori" });
  excelData[section] = excelData[section].filter((item) => item.id != id);
  res.json({ message: "Kayıt silindi" });
});

module.exports = router;
