// Birim (fiziksel parca) ortak islemleri: bulma, olusturma, baglama.
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");
const { barkodCoz } = require("../lib/barkod");

// Okutulan barkoddan birimi bulur. kilit=true ise satir islem bitene kadar kilitlenir.
async function birimBul(client, firmaId, ham, { kilit = true, tipler } = {}) {
  const barkod = barkodCoz(ham);
  if (!barkod) throw hatalar.gecersiz("Barkod bos");
  const b = await bir(
    client,
    `SELECT b.*, l.no AS lot_no FROM birim b LEFT JOIN lot l ON l.id = b.lot_id
      WHERE b.firma_id = $1 AND b.barkod = $2 ${kilit ? "FOR UPDATE OF b" : ""}`,
    [firmaId, barkod],
  );
  if (!b) throw hatalar.bulunamadi(`Barkod bulunamadi: ${barkod}`);
  if (tipler && !tipler.includes(b.tip)) {
    throw hatalar.engel(`${barkod} bu islem icin uygun degil (tip: ${b.tip}, beklenen: ${tipler.join(" / ")})`, "YANLIS_BIRIM");
  }
  return b;
}

async function birimOlustur(client, ctx, a) {
  return bir(
    client,
    `INSERT INTO birim (firma_id, barkod, tip, lot_id, malzeme_id, urun_id, is_emri_id, makine_id,
                        ilk_miktar, miktar, olcu_birimi, durum, yer, kaynak_birim_id, sira, ek, olusturan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [ctx.firmaId, a.barkod, a.tip, a.lotId || null, a.malzemeId || null, a.urunId || null, a.isEmriId || null,
      a.makineId || null, a.miktar, a.olcuBirimi, a.durum, a.yer || null, a.kaynakBirimId || null, a.sira || null,
      a.ek || {}, ctx.kullaniciId || null],
  );
}

async function bagla(client, ctx, kaynakId, hedefId, tip, miktar) {
  await client.query(
    `INSERT INTO birim_bagi (firma_id, kaynak_id, hedef_id, tip, miktar) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (kaynak_id, hedef_id, tip) DO NOTHING`,
    [ctx.firmaId, kaynakId, hedefId, tip, miktar ?? null],
  );
}

async function birimGuncelle(client, ctx, id, alanlar) {
  const kolonlar = Object.keys(alanlar);
  const set = kolonlar.map((k, i) => `${k} = $${i + 3}`).join(", ");
  return bir(client, `UPDATE birim SET ${set}, guncelleme_zamani = now() WHERE id = $1 AND firma_id = $2 RETURNING *`, [
    id,
    ctx.firmaId,
    ...kolonlar.map((k) => alanlar[k]),
  ]);
}

function blokeKontrol(b) {
  if (b.bloke) throw hatalar.engel(`${b.barkod} BLOKE durumda. Kalite blokeyi kaldirmadan islem yapilamaz.`, "BLOKE");
}

async function firmaAyarlari(client, firmaId) {
  const f = await bir(client, "SELECT saat_dilimi, ayarlar FROM firma WHERE id = $1", [firmaId]);
  return { saatDilimi: f.saat_dilimi, ...f.ayarlar };
}

module.exports = { birimBul, birimOlustur, bagla, birimGuncelle, blokeKontrol, firmaAyarlari };
