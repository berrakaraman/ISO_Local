// Uretim lotu miktar dengesi (F-03, YP, hammadde bakiye karti ortak kullanir).
//
// Bir uretim lotu = bir top (FG_LOT) + bu top uretilirken ayrilan karantina parcalari (KR).
//
//   GIRIS   = top metraji + karantinaya ayrilan metre
//   DAGILIM = kesilmemis top + sahit numune
//           + uygun parcalar (serbest / depoda / sevkiyata ayrildi / sevk edildi)
//           + kalite bekleyen parcalar + son kontrolde karantinaya alinan parcalar
//           + karar bekleyen karantina + tum hurda (kesim firesi, red, karantina hurdasi, top hurdasi)
//
//   GIRIS + kesimdeki olcum fazlasi = DAGILIM  olmak zorundadir. Fark varsa kayitlarda hata vardir.
//
// Kural: bir parca hurdaya/redde gittiginde miktari sifirlanir ve miktar HURDA olayina yazilir.
// Boylece "hurda" tek kaynaktan (olay) gelir, ayni metre iki kez sayilmaz.
const { yuvarla, sifirMi } = require("../lib/miktar");

const UYGUN_DURUMLAR = "('SERBEST','DEPODA','SIPARISE_AYRILDI','SEVK_EDILDI')";

const LOT_SECIM = `
  SELECT l.id, l.no, l.durum, l.olusturma_zamani,
         u.kod AS urun_kod, u.ad AS urun_ad, u.olcu_birimi,
         ie.no AS is_emri_no, m.kod AS makine_kod,
         ko.ad_soyad AS operator_ad, ko.sicil_no AS operator_sicil,
         t.barkod AS top_barkod, t.ilk_miktar AS top_metraji, t.miktar AS kesilmemis, t.durum AS top_durum, t.bloke AS top_bloke,
         COALESCE((t.ek->>'baslangic')::timestamptz, ie.baslangic) AS baslangic, t.olusturma_zamani AS bitis,
         COALESCE(f.uygun, 0) AS uygun, COALESCE(f.sevk_edilen, 0) AS sevk_edilen,
         COALESCE(f.kalite_bekleyen, 0) AS kalite_bekleyen, COALESCE(f.fg_karantina, 0) AS fg_karantina,
         COALESCE(f.parca_sayisi, 0) AS parca_sayisi, COALESCE(f.bloke_parca, 0) AS bloke_parca,
         COALESCE(k.karantina, 0) AS karantina, COALESCE(k.karantina_bekleyen, 0) AS karantina_bekleyen,
         COALESCE(k.karantina_olumlu, 0) AS karantina_olumlu,
         COALESCE(h.kesim_firesi, 0) AS kesim_firesi, COALESCE(h.top_hurda, 0) AS top_hurda,
         COALESCE(h.ret, 0) AS ret, COALESCE(h.karantina_hurda, 0) AS karantina_hurda,
         COALESCE(dz.olcum_fazlasi, 0) AS olcum_fazlasi,
         COALESCE(nm.ilk_miktar, 0) AS numune, nm.barkod AS numune_barkod,
         rm.hammadde_lotlari
    FROM lot l
    JOIN urun u ON u.id = l.urun_id
    LEFT JOIN is_emri ie ON ie.id = l.is_emri_id
    LEFT JOIN makine m ON m.id = ie.makine_id
    LEFT JOIN kullanici ko ON ko.id = l.olusturan
    LEFT JOIN birim t ON t.lot_id = l.id AND t.tip = 'FG_LOT'
    LEFT JOIN LATERAL (
      SELECT sum(b.miktar) FILTER (WHERE b.durum IN ${UYGUN_DURUMLAR}) AS uygun,
             sum(b.miktar) FILTER (WHERE b.durum = 'SEVK_EDILDI') AS sevk_edilen,
             sum(b.miktar) FILTER (WHERE b.durum = 'KALITE_BEKLIYOR') AS kalite_bekleyen,
             sum(b.miktar) FILTER (WHERE b.durum = 'KARANTINA') AS fg_karantina,
             count(*) FILTER (WHERE b.durum NOT IN ('BOLUNDU','RET','HURDA')) AS parca_sayisi,
             count(*) FILTER (WHERE b.bloke AND b.durum NOT IN ('BOLUNDU','RET','HURDA')) AS bloke_parca
        FROM birim b WHERE b.lot_id = l.id AND b.tip = 'FG') f ON true
    LEFT JOIN LATERAL (
      SELECT sum(b.ilk_miktar) AS karantina,
             sum(b.miktar) FILTER (WHERE b.durum IN ('KARAR_BEKLIYOR','YENIDEN_ISLEME')) AS karantina_bekleyen,
             sum(b.ilk_miktar) FILTER (WHERE b.durum IN ('OLUMLU','SARTLI_KABUL')) AS karantina_olumlu
        FROM birim b WHERE b.lot_id = l.id AND b.tip = 'KR') k ON true
    LEFT JOIN LATERAL (
      SELECT sum(o.miktar) FILTER (WHERE b.tip = 'FG_LOT' AND COALESCE(o.veri->>'neden', 'KESIM_FIRESI') <> 'TOP_HURDA') AS kesim_firesi,
             sum(o.miktar) FILTER (WHERE b.tip = 'FG_LOT' AND o.veri->>'neden' = 'TOP_HURDA') AS top_hurda,
             sum(o.miktar) FILTER (WHERE b.tip = 'FG') AS ret,
             sum(o.miktar) FILTER (WHERE b.tip = 'KR') AS karantina_hurda
        FROM olay o JOIN birim b ON b.id = o.birim_id
       WHERE b.lot_id = l.id AND o.tip = 'HURDA') h ON true
    LEFT JOIN LATERAL (
      SELECT sum(o.miktar) AS olcum_fazlasi FROM olay o
       WHERE o.birim_id = t.id AND o.tip = 'DUZELTME' AND o.veri->>'neden' = 'OLCUM_FAZLASI') dz ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT rl.no, ', ') AS hammadde_lotlari
        FROM birim_bagi bb JOIN birim rb ON rb.id = bb.kaynak_id JOIN lot rl ON rl.id = rb.lot_id
       WHERE bb.hedef_id = t.id AND bb.tip = 'TUKETILDI') rm ON true
    LEFT JOIN birim nm ON nm.lot_id = l.id AND nm.tip = 'NM'
   WHERE l.firma_id = $1 AND l.tip = 'FG'`;

// Satirdaki ham toplamlardan dengeyi hesaplar ve satira ekler
function lotDengesi(r) {
  const n = (x) => Number(x || 0);
  const toplam = yuvarla(n(r.top_metraji ?? r.topMetraji) + n(r.karantina));
  const hurdaToplam = yuvarla(n(r.kesim_firesi ?? r.kesimFiresi) + n(r.top_hurda ?? r.topHurda) + n(r.ret) + n(r.karantina_hurda ?? r.karantinaHurda));
  const dagilim = {
    kesilmemis: yuvarla(n(r.kesilmemis)),
    numune: yuvarla(n(r.numune)),
    uygun: yuvarla(n(r.uygun)),
    kaliteBekleyen: yuvarla(n(r.kalite_bekleyen ?? r.kaliteBekleyen)),
    parcaKarantinada: yuvarla(n(r.fg_karantina ?? r.fgKarantina)),
    karantinaBekleyen: yuvarla(n(r.karantina_bekleyen ?? r.karantinaBekleyen)),
    hurda: hurdaToplam,
  };
  const dagilimToplam = yuvarla(Object.values(dagilim).reduce((a, x) => a + x, 0));
  const olcumFazlasi = yuvarla(n(r.olcum_fazlasi ?? r.olcumFazlasi));
  const fark = yuvarla(toplam + olcumFazlasi - dagilimToplam);
  return {
    toplam,
    olcumFazlasi,
    dagilim,
    dagilimToplam,
    hurdaToplam,
    // Fire orani yalnizca hurdadir; karar bekleyen karantina fire degildir (henuz karar verilmedi)
    fireYuzde: toplam > 0 ? yuvarla((hurdaToplam / toplam) * 100, 2) : 0,
    fark,
    tutuyor: sifirMi(fark),
  };
}

function lotSatiri(r) {
  const denge = lotDengesi(r);
  return { ...r, toplam: denge.toplam, hurda_toplam: denge.hurdaToplam, fire_yuzde: denge.fireYuzde, denge };
}

module.exports = { LOT_SECIM, lotDengesi, lotSatiri, UYGUN_DURUMLAR };
