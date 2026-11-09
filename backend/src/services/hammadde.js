// Hammadde lotu ortak islemleri: giris kontrolu karari ve iptal.
// Hem /hammadde uclari hem de onay akisi (F-01 "Onayla / Reddet") ayni kurallari kullanir.
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");
const { BIRIM_DURUM: D, OLAY, ONAY_DURUM: O } = require("../lib/sabitler");
const { izYaz, birimDurumu } = require("./iz");
const { onayEsitle } = require("./onay");

// Giris kontrolu karari <-> form onay durumu
const KARAR_ONAY = { [D.KABUL]: O.ONAYLANDI, [D.RET]: O.REDDEDILDI, [D.KARANTINA]: O.ASKIDA };
const ONAY_KARAR = { [O.ONAYLANDI]: D.KABUL, [O.REDDEDILDI]: D.RET, [O.ASKIDA]: D.KARANTINA };

async function lotKilitle(c, firmaId, lotNo) {
  const lot = await bir(c, "SELECT * FROM lot WHERE firma_id = $1 AND no = $2 AND tip = 'RM' FOR UPDATE", [firmaId, String(lotNo).toUpperCase()]);
  if (!lot) throw hatalar.bulunamadi("Hammadde lotu bulunamadi");
  return lot;
}

// Lotun tum ambalajlarina giris kontrolu kararini uygular (KABUL / KARANTINA / RET)
async function hammaddeKarari(c, ctx, lotNo, karar, not, { onayiEsitle = true } = {}) {
  const lot = await lotKilitle(c, ctx.firmaId, lotNo);
  if (lot.durum === D.IPTAL) throw hatalar.engel("Bu lot iptal edilmis, karar verilemez", "IPTAL_EDILMIS");
  // Dort goz kurali: mal kabulu yapan kisi kendi lotunun giris kontrolunu onaylayamaz
  if (lot.olusturan === ctx.kullaniciId) throw hatalar.yasak("Mal kabulunu yaptiginiz lotun giris kontrol kararini veremezsiniz (dort goz kurali).");
  const r = await c.query(
    `SELECT * FROM birim WHERE lot_id = $1 AND durum IN ('KONTROL_BEKLIYOR','KABUL','KARANTINA') FOR UPDATE`,
    [lot.id],
  );
  for (const birim of r.rows) {
    if (birim.durum === karar) continue;
    await birimDurumu(c, ctx, birim, karar, { olayTipi: OLAY.KONTROL_KARARI, aciklama: not, gerekce: not });
  }
  await c.query("UPDATE lot SET durum = $1 WHERE id = $2", [karar, lot.id]);
  await izYaz(c, ctx, {
    tablo: "lot", kayitId: lot.id, islem: "DURUM",
    degisiklikler: [{ alan: "durum", eski: lot.durum, yeni: karar }], gerekce: not,
  });
  if (onayiEsitle) await onayEsitle(c, ctx, "HAMMADDE", lot.no, KARAR_ONAY[karar], not);
  // Kullanilamaz karar verildiyse su an makinede bagli ambalajlar bildirilir; topu bitirme bu ambalajlarla engellenir
  const bagli = karar === D.KABUL ? [] : (await c.query(
    `SELECT b.barkod, ie.no AS is_emri_no FROM is_emri_baglama g JOIN birim b ON b.id = g.birim_id JOIN is_emri ie ON ie.id = g.is_emri_id
      WHERE b.lot_id = $1 AND g.cikarma_zamani IS NULL`, [lot.id])).rows;
  return { lotNo: lot.no, karar, etkilenenAmbalaj: r.rows.length, makinedeBagliAmbalajlar: bagli };
}

// Lotu iptal eder. Yalnizca hic kullanilmamis lot iptal edilebilir;
// kullanilmaya baslanan lot icin duzeltme kaydi gerekir (iz bozulmasin).
async function hammaddeIptal(c, ctx, lotNo, gerekce) {
  const lot = await lotKilitle(c, ctx.firmaId, lotNo);
  if (lot.durum === D.IPTAL) throw hatalar.engel("Bu lot zaten iptal edilmis", "IPTAL_EDILMIS");
  const birimler = (await c.query("SELECT * FROM birim WHERE lot_id = $1 FOR UPDATE", [lot.id])).rows;
  const ids = birimler.map((b) => b.id);
  const kullanildi =
    birimler.some((b) => b.kaynak_birim_id || Number(b.miktar) !== Number(b.ilk_miktar) || !String(b.yer || "").startsWith("DEPO")) ||
    (await bir(c, "SELECT 1 FROM is_emri_baglama WHERE birim_id = ANY($1) LIMIT 1", [ids])) ||
    (await bir(c, "SELECT 1 FROM birim_bagi WHERE kaynak_id = ANY($1) LIMIT 1", [ids]));
  if (kullanildi) {
    throw hatalar.engel(
      "Bu lottan cekis / uretim yapilmis, iptal edilemez. Hatali bilgi icin duzeltme kaydi acilmalidir.",
      "KULLANILMIS",
    );
  }
  for (const b of birimler) {
    await birimDurumu(c, ctx, b, D.IPTAL, { olayTipi: OLAY.IPTAL, aciklama: gerekce, gerekce });
  }
  await c.query(
    "UPDATE lot SET durum = $1, iptal_eden = $2, iptal_zamani = now(), iptal_gerekcesi = $3 WHERE id = $4",
    [D.IPTAL, ctx.kullaniciId, gerekce, lot.id],
  );
  await izYaz(c, ctx, {
    tablo: "lot", kayitId: lot.id, islem: "IPTAL",
    degisiklikler: [{ alan: "durum", eski: lot.durum, yeni: D.IPTAL }], gerekce,
  });
  return { lotNo: lot.no, iptalEdilenAmbalaj: birimler.length };
}

module.exports = { hammaddeKarari, hammaddeIptal, KARAR_ONAY, ONAY_KARAR };
