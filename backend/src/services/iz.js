// Olay gunlugu (bolum 13.1) ve degisiklik izi (bolum 16.1).
// Her ikisi de veritabaninda yalnizca eklemeye aciktir.
const crypto = require("crypto");

// ctx: { firmaId, kullaniciId, cihaz }
async function olayYaz(client, ctx, o) {
  const r = await client.query(
    `INSERT INTO olay (firma_id, tip, birim_id, karsi_birim_id, is_emri_id, miktar, olcu_birimi,
                       kullanici_id, cihaz, aciklama, veri)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, zaman`,
    [
      ctx.firmaId,
      o.tip,
      o.birimId || null,
      o.karsiBirimId || null,
      o.isEmriId || null,
      o.miktar ?? null,
      o.olcuBirimi || null,
      ctx.kullaniciId || null,
      ctx.cihaz || null,
      o.aciklama || null,
      o.veri || {},
    ],
  );
  return r.rows[0];
}

const yaziya = (v) => (v === undefined || v === null ? null : typeof v === "object" ? JSON.stringify(v) : String(v));

// Iki nesne arasindaki farkli alanlari dondurur
function farklar(eski, yeni, alanlar) {
  const liste = [];
  for (const alan of alanlar) {
    if (!(alan in yeni)) continue;
    const e = yaziya(eski ? eski[alan] : null);
    const y = yaziya(yeni[alan]);
    if (e !== y) liste.push({ alan, eski: e, yeni: y });
  }
  return liste;
}

// Degisiklik izine yazar. Satirlar bir ozet (hash) zinciriyle birbirine baglanir:
// eski bir satir veritabaninda elle degistirilirse zincir kirilir ve fark edilir.
async function izYaz(client, ctx, { tablo, kayitId, islem, degisiklikler, gerekce }) {
  if (!degisiklikler || degisiklikler.length === 0) return;
  // Ayni firmanin iz yazimlarini sirala (zincir catallanmasin)
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`iz:${ctx.firmaId}`]);
  const son = await client.query(
    "SELECT ozet FROM degisiklik_izi WHERE firma_id = $1 ORDER BY id DESC LIMIT 1",
    [ctx.firmaId],
  );
  let onceki = son.rows[0] ? son.rows[0].ozet : "BASLANGIC";
  for (const d of degisiklikler) {
    const zaman = new Date().toISOString();
    const ozet = crypto
      .createHash("sha256")
      .update([onceki, ctx.firmaId, tablo, kayitId, d.alan, d.eski, d.yeni, islem, ctx.kullaniciId, zaman, gerekce].join("|"))
      .digest("hex");
    await client.query(
      `INSERT INTO degisiklik_izi (firma_id, tablo, kayit_id, alan, eski_deger, yeni_deger, islem,
                                   kullanici_id, cihaz, zaman, gerekce, onceki_ozet, ozet)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [ctx.firmaId, tablo, String(kayitId), d.alan, d.eski, d.yeni, islem, ctx.kullaniciId || null,
        ctx.cihaz || null, zaman, gerekce || null, onceki, ozet],
    );
    onceki = ozet;
  }
}

// Bir birimin durumunu degistirir; olay + iz kaydini birlikte yazar
async function birimDurumu(client, ctx, birim, yeniDurum, { olayTipi, aciklama, gerekce, veri } = {}) {
  await client.query(
    "UPDATE birim SET durum = $1, guncelleme_zamani = now() WHERE id = $2 AND firma_id = $3",
    [yeniDurum, birim.id, ctx.firmaId],
  );
  await izYaz(client, ctx, {
    tablo: "birim",
    kayitId: birim.id,
    islem: "DURUM",
    degisiklikler: [{ alan: "durum", eski: birim.durum, yeni: yeniDurum }],
    gerekce,
  });
  if (olayTipi) {
    await olayYaz(client, ctx, { tip: olayTipi, birimId: birim.id, aciklama, veri: { ...veri, eski: birim.durum, yeni: yeniDurum } });
  }
}

module.exports = { olayYaz, izYaz, farklar, birimDurumu };
