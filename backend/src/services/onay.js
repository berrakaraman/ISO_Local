// Form onay akisi: kaydi bir kisiye atama ve karar yazma.
// Her adim degisiklik_izi'ne kim/ne zaman/ne ile yazilir.
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");
const { ROLLER, ONAY_DURUM: O } = require("../lib/sabitler");
const { izYaz } = require("./iz");

// Bu tur kayitlari kimler onaylayabilir (bos = herkes). ADMIN her zaman onaylayabilir.
const ONAYLAYABILIR = {
  HAMMADDE: [ROLLER.KALITE], // giris kontrolu kalite isidir
  IS_EMRI: [ROLLER.KALITE, ROLLER.YONETIM], // uretim emrini kalite ya da yonetim onaylar (operator degil)
  SEVKIYAT: [ROLLER.KALITE, ROLLER.YONETIM], // sevk edilecek yuku kalite ya da yonetim onaylar
  KARANTINA: [ROLLER.KALITE],
  KALITE: [ROLLER.KALITE],
};

const yetkili = (roller, tur) => {
  const gerekli = ONAYLAYABILIR[tur];
  return !gerekli || roller.includes(ROLLER.ADMIN) || roller.some((r) => gerekli.includes(r));
};

async function kisiBul(c, firmaId, id) {
  const k = await bir(c, "SELECT id, ad_soyad, roller FROM kullanici WHERE id = $1 AND firma_id = $2 AND aktif", [id, firmaId]);
  if (!k) throw hatalar.gecersiz("Onaylayacak kisi bulunamadi ya da pasif");
  return k;
}

// Yeni kayit icin onay gorevi acar
async function onayOlustur(c, ctx, { kayitTuru, kayitNo, atananId }) {
  const kisi = await kisiBul(c, ctx.firmaId, atananId);
  // Dort goz kurali: kaydi giren kisi kendi kaydini onaylayamaz
  if (kisi.id === ctx.kullaniciId) throw hatalar.gecersiz("Kendi kaydinizi kendinize onaya atayamazsiniz. Baska bir sorumlu secin.");
  if (!yetkili(kisi.roller, kayitTuru)) {
    throw hatalar.gecersiz(`${kisi.ad_soyad} bu kaydi onaylama yetkisine sahip degil (gerekli rol: ${ONAYLAYABILIR[kayitTuru].join(", ")})`);
  }
  const o = await bir(
    c,
    `INSERT INTO onay (firma_id, kayit_turu, kayit_no, atanan, olusturan)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [ctx.firmaId, kayitTuru, kayitNo, kisi.id, ctx.kullaniciId],
  );
  await izYaz(c, ctx, {
    tablo: "onay",
    kayitId: o.id,
    islem: "EKLEME",
    degisiklikler: [
      { alan: "kayit", eski: null, yeni: `${kayitTuru} ${kayitNo}` },
      { alan: "atanan", eski: null, yeni: kisi.ad_soyad },
    ],
  });
  return o;
}

// Karar: kimin verebilecegini kontrol eder ve yazar
async function onayKarari(c, ctx, onay, yeniDurum, not, roller) {
  if (onay.durum === O.ONAYLANDI || onay.durum === O.REDDEDILDI) {
    throw hatalar.engel("Bu kayit icin karar zaten verilmis", "KARAR_VERILMIS");
  }
  const admin = roller.includes(ROLLER.ADMIN);
  if (onay.olusturan === ctx.kullaniciId) throw hatalar.yasak("Kendi girdiginiz kaydi onaylayamazsiniz (dort goz kurali).");
  if (onay.atanan !== ctx.kullaniciId && !admin) {
    throw hatalar.yasak("Bu onay size atanmamis. Yalnizca atanan kisi karar verebilir.");
  }
  if (!yetkili(roller, onay.kayit_turu)) throw hatalar.yasak("Bu kayit turunu onaylama yetkiniz yok");
  return onayYaz(c, ctx, onay, yeniDurum, not);
}

async function onayYaz(c, ctx, onay, yeniDurum, not) {
  if (onay.durum === yeniDurum) return onay;
  const g = await bir(
    c,
    `UPDATE onay SET durum = $1, karar_veren = $2, karar_zamani = now(), karar_notu = $3
      WHERE id = $4 RETURNING *`,
    [yeniDurum, ctx.kullaniciId, not || null, onay.id],
  );
  await izYaz(c, ctx, {
    tablo: "onay",
    kayitId: onay.id,
    islem: "DURUM",
    degisiklikler: [{ alan: "durum", eski: onay.durum, yeni: yeniDurum }],
    gerekce: not,
  });
  return g;
}

// Islem baska bir yoldan yapildiysa (ornek: kalite kontrol ucu) acik onayi da esitler
async function onayEsitle(c, ctx, kayitTuru, kayitNo, yeniDurum, not) {
  const o = await bir(
    c,
    "SELECT * FROM onay WHERE firma_id = $1 AND kayit_turu = $2 AND kayit_no = $3 FOR UPDATE",
    [ctx.firmaId, kayitTuru, kayitNo],
  );
  if (!o || o.durum === O.ONAYLANDI || o.durum === O.REDDEDILDI) return o;
  return onayYaz(c, ctx, o, yeniDurum, not);
}

// Bir sonraki adima gecmeden once onay var mi ve onaylanmis mi? (ornek: is emri baslatma, sevk etme)
async function onayKontrol(c, firmaId, kayitTuru, kayitNo, { zorunlu = true, islem = "devam edilemez" } = {}) {
  const o = await bir(c, "SELECT durum FROM onay WHERE firma_id = $1 AND kayit_turu = $2 AND kayit_no = $3", [firmaId, kayitTuru, kayitNo]);
  if (!o) {
    if (zorunlu) throw hatalar.engel(`${kayitNo} icin onay kaydi yok, ${islem}. Kayit bir sorumluya onaya gonderilmeli.`, "ONAY_YOK");
    return null;
  }
  if (o.durum !== O.ONAYLANDI) {
    const ad = { BEKLIYOR: "onay bekliyor", ASKIDA: "askiya alinmis", REDDEDILDI: "reddedilmis" }[o.durum] || o.durum;
    throw hatalar.engel(`${kayitNo} ${ad}, ${islem}`, "ONAY_BEKLIYOR");
  }
  return o;
}

// Onaylanmis kayit sonradan degisirse onay gecersiz olur ve yeniden "Bekliyor"a doner
async function onaySifirla(c, ctx, kayitTuru, kayitNo, not) {
  const o = await bir(c, "SELECT * FROM onay WHERE firma_id = $1 AND kayit_turu = $2 AND kayit_no = $3 FOR UPDATE", [ctx.firmaId, kayitTuru, kayitNo]);
  if (!o || o.durum !== O.ONAYLANDI) return false;
  await c.query("UPDATE onay SET durum = $1, karar_veren = NULL, karar_zamani = NULL, karar_notu = $2 WHERE id = $3", [O.BEKLIYOR, not, o.id]);
  await izYaz(c, ctx, {
    tablo: "onay",
    kayitId: o.id,
    islem: "DURUM",
    degisiklikler: [{ alan: "durum", eski: o.durum, yeni: O.BEKLIYOR }],
    gerekce: not,
  });
  return true;
}

module.exports = { onayOlustur, onayKarari, onayEsitle, onayKontrol, onaySifirla, ONAYLAYABILIR, yetkili };
