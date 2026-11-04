// Form onay akisi: kaydi bir kisiye atama ve karar yazma.
// Her adim degisiklik_izi'ne kim/ne zaman/ne ile yazilir.
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");
const { ROLLER, ONAY_DURUM: O } = require("../lib/sabitler");
const { izYaz } = require("./iz");

// Bu tur kayitlari kimler onaylayabilir (bos = herkes)
const ONAYLAYABILIR = {
  HAMMADDE: [ROLLER.KALITE], // giris kontrolu kalite isidir
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

module.exports = { onayOlustur, onayKarari, onayEsitle, ONAYLAYABILIR };
