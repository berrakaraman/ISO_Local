// Izlenebilirlik: barkod cozumleme, soy agaci, zaman cizelgesi, hammadde bakiye karti (bolum 13)
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");
const { barkodCoz } = require("../lib/barkod");
const { LOT_SECIM, lotDengesi } = require("./denge");
const { yuvarla: yv, esit } = require("../lib/miktar");

const yuvarla = (n, h = 3) => yv(Number(n) || 0, h);

const BIRIM_SECIM = `
  b.id, b.barkod, b.tip, b.durum, b.bloke, b.ilk_miktar, b.miktar, b.olcu_birimi, b.yer, b.sira, b.ek,
  b.olusturma_zamani, b.kaynak_birim_id, b.is_emri_id,
  l.no AS lot_no, l.tedarikci_lot,
  m.kod AS malzeme_kod, m.ad AS malzeme_ad,
  u.kod AS urun_kod, u.ad AS urun_ad,
  t.unvan AS tedarikci,
  mk.kod AS makine_kod,
  ie.no AS is_emri_no,
  k.ad_soyad AS olusturan_ad, k.sicil_no AS olusturan_sicil`;

const BIRIM_JOIN = `
  FROM birim b
  LEFT JOIN lot l ON l.id = b.lot_id
  LEFT JOIN malzeme m ON m.id = b.malzeme_id
  LEFT JOIN urun u ON u.id = b.urun_id
  LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
  LEFT JOIN makine mk ON mk.id = b.makine_id
  LEFT JOIN is_emri ie ON ie.id = b.is_emri_id
  LEFT JOIN kullanici k ON k.id = b.olusturan`;

// Soy agaci renkleri (sunum sayfa 8): yesil uygun, turuncu kontrol gerekli, kirmizi sorun
function renk(b) {
  if (["RET", "HURDA", "KARANTINA"].includes(b.durum)) return "kirmizi";
  if (b.bloke) return "turuncu";
  if (["KONTROL_BEKLIYOR", "KALITE_BEKLIYOR", "KARAR_BEKLIYOR", "YENIDEN_ISLEME", "SARTLI_KABUL", "TAMAMLANDI_FARK"].includes(b.durum)) return "turuncu";
  if (b.ek && b.ek.sartliKabul) return "turuncu";
  return "yesil";
}

// Okutulan degerin ne oldugunu bulur: birim, lot, is emri ya da sevkiyat
async function cozumle(c, F, ham) {
  const no = barkodCoz(ham);
  if (!no) throw hatalar.gecersiz("Barkod bos");
  const birim = await bir(c, `SELECT ${BIRIM_SECIM} ${BIRIM_JOIN} WHERE b.firma_id = $1 AND b.barkod = $2`, [F, no]);
  if (birim) {
    const bagli = await bir(
      c,
      `SELECT ie.no FROM is_emri_baglama g JOIN is_emri ie ON ie.id = g.is_emri_id WHERE g.birim_id = $1 AND g.cikarma_zamani IS NULL`,
      [birim.id],
    );
    return { tur: "BIRIM", no, birim: { ...birim, renk: renk(birim), bagliIsEmri: bagli?.no || null } };
  }
  const lot = await bir(
    c,
    `SELECT l.*, m.kod AS malzeme_kod, m.ad AS malzeme_ad, u.kod AS urun_kod, u.ad AS urun_ad, t.unvan AS tedarikci
       FROM lot l LEFT JOIN malzeme m ON m.id = l.malzeme_id LEFT JOIN urun u ON u.id = l.urun_id LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
      WHERE l.firma_id = $1 AND l.no = $2`,
    [F, no],
  );
  if (lot) return { tur: "LOT", no, lot };
  const ie = await bir(c, "SELECT id, no, durum FROM is_emri WHERE firma_id = $1 AND no = $2", [F, no]);
  if (ie) return { tur: "IS_EMRI", no, isEmri: ie };
  const sv = await bir(c, "SELECT id, no, durum FROM sevkiyat WHERE firma_id = $1 AND no = $2", [F, no]);
  if (sv) return { tur: "SEVKIYAT", no, sevkiyat: sv };
  throw hatalar.bulunamadi(`Bu numara sistemde yok: ${no}`);
}

// Baslangic birimlerini bulur (lot okutulduysa lotun birimleri)
async function baslangicIdleri(c, F, ham) {
  const r = await cozumle(c, F, ham);
  if (r.tur === "BIRIM") return { cozum: r, idler: [r.birim.id] };
  if (r.tur === "LOT") {
    const x = await c.query("SELECT id FROM birim WHERE lot_id = $1 AND (tip IN ('RM','FG_LOT'))", [r.lot.id]);
    return { cozum: r, idler: x.rows.map((y) => y.id) };
  }
  if (r.tur === "IS_EMRI") {
    const x = await c.query("SELECT id FROM birim WHERE is_emri_id = $1 AND tip = 'FG_LOT'", [r.isEmri.id]);
    return { cozum: r, idler: x.rows.map((y) => y.id) };
  }
  const x = await c.query("SELECT birim_id AS id FROM sevkiyat_satiri WHERE sevkiyat_id = $1", [r.sevkiyat.id]);
  return { cozum: r, idler: x.rows.map((y) => y.id) };
}

// Soy agaci: dugumler + baglar. yon: 'geri' | 'ileri' | 'ikisi'
async function agac(c, F, ham, yon = "ikisi") {
  const { cozum, idler } = await baslangicIdleri(c, F, ham);
  if (!idler.length) return { cozum, dugumler: [], baglar: [] };

  const kume = new Set(idler);
  if (yon === "geri" || yon === "ikisi") {
    const r = await c.query(
      `WITH RECURSIVE g(id) AS (SELECT unnest($1::uuid[]) UNION SELECT bb.kaynak_id FROM birim_bagi bb JOIN g ON bb.hedef_id = g.id)
       SELECT id FROM g LIMIT 3000`,
      [idler],
    );
    r.rows.forEach((x) => kume.add(x.id));
  }
  if (yon === "ileri" || yon === "ikisi") {
    const r = await c.query(
      `WITH RECURSIVE g(id) AS (SELECT unnest($1::uuid[]) UNION SELECT bb.hedef_id FROM birim_bagi bb JOIN g ON bb.kaynak_id = g.id)
       SELECT id FROM g LIMIT 3000`,
      [idler],
    );
    r.rows.forEach((x) => kume.add(x.id));
  }
  const tumIdler = [...kume];
  const birimler = await c.query(`SELECT ${BIRIM_SECIM} ${BIRIM_JOIN} WHERE b.firma_id = $1 AND b.id = ANY($2::uuid[])`, [F, tumIdler]);
  const baglar = await c.query(
    "SELECT kaynak_id, hedef_id, tip, miktar, zaman FROM birim_bagi WHERE kaynak_id = ANY($1::uuid[]) AND hedef_id = ANY($1::uuid[])",
    [tumIdler],
  );

  const dugumler = birimler.rows.map((b) => ({
    id: b.id,
    tur: b.tip,
    sutun: { RM: "hammadde", WIP: "hammadde", FG_LOT: "urun", FG: "urun", KR: "urun", NM: "urun" }[b.tip],
    baslik: b.barkod,
    altBaslik: b.malzeme_ad || b.urun_ad,
    ...b,
    renk: renk(b),
    baslangic: idler.includes(b.id),
  }));
  const kenarlar = [];

  // Proses adimlari: hammadde -> is emri -> top (sunumdaki "Nasil uretildi?" sutunu)
  const ieIdler = [...new Set(birimler.rows.filter((b) => b.tip === "FG_LOT" && b.is_emri_id).map((b) => b.is_emri_id))];
  if (ieIdler.length) {
    const ie = await c.query(
      `SELECT ie.id, ie.no, ie.durum, ie.baslangic, ie.bitis, m.kod AS makine_kod, m.ad AS makine_ad,
              (SELECT string_agg(DISTINCT k.ad_soyad, ', ') FROM is_emri_baglama g JOIN kullanici k ON k.id = g.kullanici_id WHERE g.is_emri_id = ie.id) AS operatorler
         FROM is_emri ie JOIN makine m ON m.id = ie.makine_id WHERE ie.id = ANY($1::uuid[])`,
      [ieIdler],
    );
    for (const x of ie.rows) {
      dugumler.push({
        id: `ie:${x.id}`, tur: "IS_EMRI", sutun: "proses", baslik: `${x.makine_kod} - ${x.no}`, altBaslik: x.makine_ad,
        isEmriNo: x.no, durum: x.durum, makineKod: x.makine_kod, baslangicZamani: x.baslangic, bitisZamani: x.bitis,
        operatorler: x.operatorler, renk: x.durum === "TAMAMLANDI_FARK" ? "turuncu" : "yesil",
      });
    }
  }
  const tipOf = Object.fromEntries(birimler.rows.map((b) => [b.id, b]));
  const ekliIe = new Set();
  for (const k of baglar.rows) {
    const hedef = tipOf[k.hedef_id];
    if (k.tip === "TUKETILDI" && hedef?.tip === "FG_LOT" && hedef.is_emri_id) {
      const ieId = `ie:${hedef.is_emri_id}`;
      kenarlar.push({ kaynak: k.kaynak_id, hedef: ieId, tip: "YUKLENDI" });
      const a = `${ieId}>${hedef.id}`;
      if (!ekliIe.has(a)) {
        ekliIe.add(a);
        kenarlar.push({ kaynak: ieId, hedef: hedef.id, tip: "URETILDI" });
      }
    } else {
      kenarlar.push({ kaynak: k.kaynak_id, hedef: k.hedef_id, tip: k.tip, miktar: k.miktar });
    }
  }

  // Hammadde kutulari: bu agactaki is emirlerine bu ambalajdan ne kadar gitti (ilk miktar degil, kullanilan).
  // Sadece "bundan bolundu" diye agaca giren ambalaj (kendisi makineye takilmamis) ayrica isaretlenir.
  const rmIdler = birimler.rows.filter((b) => b.tip === "RM").map((b) => b.id);
  if (rmIdler.length) {
    const g = await c.query(
      `SELECT g.birim_id, ie.no, g.baglama_miktari, g.tuketilen, g.cikarma_zamani
         FROM is_emri_baglama g JOIN is_emri ie ON ie.id = g.is_emri_id
        WHERE g.birim_id = ANY($1::uuid[]) AND g.is_emri_id = ANY($2::uuid[])`,
      [rmIdler, ieIdler],
    );
    for (const d of dugumler) {
      if (d.tur !== "RM") continue;
      const k = g.rows.filter((x) => x.birim_id === d.id);
      d.kullanim = k.map((x) => ({
        isEmriNo: x.no,
        miktar: x.cikarma_zamani ? Number(x.tuketilen) : Number(x.baglama_miktari),
        aktif: !x.cikarma_zamani,
      }));
      d.buIseGiden = k.length ? yuvarla(d.kullanim.reduce((t, x) => t + x.miktar, 0)) : null;
      d.sadeceKaynak = !k.length && birimler.rows.some((y) => y.kaynak_birim_id === d.id);
    }
  }

  // Parca kutulari: basina gelenlerin tek satirlik ozeti ve su anki hali
  const { yolculuklar } = require("./hikaye");
  const yol = await yolculuklar(c, F, birimler.rows.filter((b) => ["FG", "KR", "RM", "FG_LOT"].includes(b.tip)));
  for (const d of dugumler) {
    if (yol[d.id]) {
      d.yolculuk = yol[d.id].ozet;
      d.simdi = yol[d.id].simdi;
    }
  }

  // Sevkiyat dugumleri ("Kime gitti?")
  const sv = await c.query(
    `SELECT ss.birim_id, s.id, s.no, s.durum, s.onay_zamani, s.irsaliye_no, mu.unvan AS musteri
       FROM sevkiyat_satiri ss JOIN sevkiyat s ON s.id = ss.sevkiyat_id JOIN musteri mu ON mu.id = s.musteri_id
      WHERE ss.birim_id = ANY($1::uuid[])`,
    [tumIdler],
  );
  const ekliSv = new Set();
  for (const x of sv.rows) {
    const id = `sv:${x.id}`;
    if (!ekliSv.has(id)) {
      ekliSv.add(id);
      dugumler.push({
        id, tur: "SEVKIYAT", sutun: "sevkiyat", baslik: `${x.no}`, altBaslik: x.musteri, musteri: x.musteri,
        durum: x.durum, sevkZamani: x.onay_zamani, irsaliyeNo: x.irsaliye_no, renk: tipOf[x.birim_id]?.bloke ? "kirmizi" : "yesil",
      });
    }
    kenarlar.push({ kaynak: x.birim_id, hedef: id, tip: "SEVK" });
  }
  return { cozum, dugumler, baglar: kenarlar };
}

// Zaman cizelgesi: agactaki tum birimlerin olaylari, eskiden yeniye (sunum sayfa 10)
async function zamanCizelgesi(c, F, ham, yon = "ikisi") {
  const a = await agac(c, F, ham, yon);
  const idler = a.dugumler.filter((x) => !String(x.id).includes(":")).map((x) => x.id);
  const ieIdler = a.dugumler.filter((x) => String(x.id).startsWith("ie:")).map((x) => x.id.slice(3));
  const r = await c.query(
    `SELECT o.id, o.zaman, o.tip, o.miktar, o.olcu_birimi, o.aciklama, o.veri, o.cihaz,
            b.barkod, b.tip AS birim_tipi, kb.barkod AS karsi_barkod, ie.no AS is_emri_no,
            k.ad_soyad AS kullanici, k.sicil_no
       FROM olay o
       LEFT JOIN birim b ON b.id = o.birim_id
       LEFT JOIN birim kb ON kb.id = o.karsi_birim_id
       LEFT JOIN is_emri ie ON ie.id = o.is_emri_id
       LEFT JOIN kullanici k ON k.id = o.kullanici_id
      WHERE o.firma_id = $1 AND (o.birim_id = ANY($2::uuid[]) OR (o.birim_id IS NULL AND o.is_emri_id = ANY($3::uuid[])))
      ORDER BY o.zaman, o.id
      LIMIT 2000`,
    [F, idler, ieIdler],
  );
  return { cozum: a.cozum, olaylar: r.rows };
}

// Hammadde bakiye karti (bolum 13.2)
async function hammaddeBakiye(c, F, lotNo) {
  const lot = await bir(
    c,
    `SELECT l.*, m.kod AS malzeme_kod, m.ad AS malzeme_ad, m.olcu_birimi, t.unvan AS tedarikci
       FROM lot l JOIN malzeme m ON m.id = l.malzeme_id LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
      WHERE l.firma_id = $1 AND l.no = $2 AND l.tip = 'RM'`,
    [F, lotNo],
  );
  if (!lot) throw hatalar.bulunamadi("Hammadde lotu bulunamadi");

  const m = await bir(
    c,
    `SELECT COALESCE(sum(ilk_miktar) FILTER (WHERE kaynak_birim_id IS NULL), 0) AS giris,
            COALESCE(sum(miktar) FILTER (WHERE yer LIKE 'DEPO%' AND durum NOT IN ('RET','KARANTINA','KONTROL_BEKLIYOR','IPTAL')), 0) AS depoda,
            COALESCE(sum(miktar) FILTER (WHERE durum = 'IPTAL'), 0) AS iptal,
            COALESCE(sum(miktar) FILTER (WHERE yer LIKE 'DEPO%' AND durum IN ('KARANTINA','KONTROL_BEKLIYOR')), 0) AS depoda_bekleyen,
            COALESCE(sum(miktar) FILTER (WHERE durum = 'RET'), 0) AS ret,
            COALESCE(sum(miktar) FILTER (WHERE yer LIKE 'HAT:%' AND durum NOT IN ('RET','HURDA','IPTAL')), 0) AS hatta
       FROM birim WHERE lot_id = $1`,
    [lot.id],
  );
  const o = await bir(
    c,
    `SELECT COALESCE(sum(o.miktar) FILTER (WHERE o.tip = 'TUKETIM'), 0) AS tuketilen,
            COALESCE(sum(o.miktar) FILTER (WHERE o.tip = 'HURDA'), 0) AS dogrudan_hurda
       FROM olay o JOIN birim b ON b.id = o.birim_id WHERE b.lot_id = $1`,
    [lot.id],
  );

  // Bu hammaddeden uretilen toplar ve tahmini pay (bolum 13.2 pay hesabi kurali)
  const toplar = await c.query(
    `SELECT t.id, t.barkod, t.ilk_miktar, t.urun_id, t.is_emri_id, r.gram_metre,
            (SELECT count(*) FROM birim_bagi x JOIN birim y ON y.id = x.kaynak_id
              WHERE x.hedef_id = t.id AND x.tip = 'TUKETILDI' AND y.malzeme_id = $2) AS toplam_ambalaj,
            (SELECT count(*) FROM birim_bagi x JOIN birim y ON y.id = x.kaynak_id
              WHERE x.hedef_id = t.id AND x.tip = 'TUKETILDI' AND y.lot_id = $1) AS bu_lot_ambalaj
       FROM birim t
       LEFT JOIN recete r ON r.urun_id = t.urun_id AND r.malzeme_id = $2
      WHERE t.tip = 'FG_LOT' AND t.id IN (
        SELECT x.hedef_id FROM birim_bagi x JOIN birim y ON y.id = x.kaynak_id WHERE y.lot_id = $1 AND x.tip = 'TUKETILDI')`,
    [lot.id, lot.malzeme_id],
  );

  // Tuketilen hammaddenin nereye gittigi: her top icin lot dengesi (services/denge.js), metre -> kg
  let uygunKg = 0;
  let karantinaKg = 0;
  let hurdaKg = 0;
  let islemdeKg = 0;
  let numuneKg = 0;
  let olcumFarkiKg = 0;
  const urunler = [];
  const kararlar = [];
  for (const t of toplar.rows) {
    const pay = t.toplam_ambalaj ? t.bu_lot_ambalaj / t.toplam_ambalaj : 1;
    const kgm = t.gram_metre ? (t.gram_metre / 1000) * pay : 0;
    const satir = await bir(c, `${LOT_SECIM} AND l.id = (SELECT lot_id FROM birim WHERE id = $2)`, [F, t.id]);
    const dn = lotDengesi(satir);
    const g = dn.dagilim;
    const uygunM = yuvarla(g.uygun + g.kaliteBekleyen);
    const karantinaM = yuvarla(g.parcaKarantinada + g.karantinaBekleyen);
    uygunKg += uygunM * kgm;
    karantinaKg += karantinaM * kgm;
    hurdaKg += g.hurda * kgm;
    islemdeKg += g.kesilmemis * kgm;
    numuneKg += g.numune * kgm;
    olcumFarkiKg -= dn.olcumFazlasi * kgm;
    urunler.push({
      lotNo: t.barkod, metraj: t.ilk_miktar, toplamMetre: dn.toplam, pay: yuvarla(pay, 3), tahmini: pay < 1,
      uygunMetre: uygunM, karantinaMetre: karantinaM, hurdaMetre: g.hurda, kesilmemisMetre: g.kesilmemis, numuneMetre: g.numune,
      dengeTutuyor: dn.tutuyor, dengeFarki: dn.fark,
    });
    const kr = await c.query(
      `SELECT b.barkod, b.ilk_miktar, b.olcu_birimi, b.durum, b.ek, o.zaman AS karar_zamani, o.aciklama AS karar_notu,
              k.ad_soyad AS karar_veren, (o.veri->>'yeniBarkod') AS yeni_barkod
         FROM birim b
         LEFT JOIN LATERAL (SELECT * FROM olay WHERE birim_id = b.id AND tip = 'KARANTINA_KARARI' ORDER BY zaman DESC LIMIT 1) o ON true
         LEFT JOIN kullanici k ON k.id = o.kullanici_id
        WHERE b.lot_id = (SELECT lot_id FROM birim WHERE id = $1) AND b.tip = 'KR' ORDER BY b.olusturma_zamani`,
      [t.id],
    );
    kr.rows.forEach((x) => kararlar.push({ ...x, fgLotNo: t.barkod }));
  }

  // Hammadde kontrolu: giris = depoda (kullanilabilir + bekleyen + ret) + iptal + hatta + tuketilen + dogrudan hurda
  const giris = m.giris;
  const depoda = m.depoda + m.depoda_bekleyen + m.ret;
  const kontrolToplam = depoda + m.iptal + m.hatta + o.tuketilen + o.dogrudan_hurda;
  const dagilimToplam = uygunKg + karantinaKg + hurdaKg + islemdeKg + numuneKg + olcumFarkiKg;
  return {
    lot,
    bakiye: {
      olcuBirimi: lot.olcu_birimi,
      giris: yuvarla(giris),
      depodaKullanilabilir: yuvarla(m.depoda),
      depodaBekleyen: yuvarla(m.depoda_bekleyen),
      ret: yuvarla(m.ret),
      hatta: yuvarla(m.hatta),
      tuketilen: yuvarla(o.tuketilen),
      tuketilenDagilimi: {
        uygunUrun: yuvarla(uygunKg),
        karantinada: yuvarla(karantinaKg),
        hurda: yuvarla(hurdaKg),
        kesimBekleyen: yuvarla(islemdeKg),
        numune: yuvarla(numuneKg),
        olcumFarki: yuvarla(olcumFarkiKg),
        // Recetedeki gram/metreye gore beklenenden fazla harcanan hammadde (proses kaybi; is emri dengesinde aciklanir)
        aciklanamayan: yuvarla(o.tuketilen - dagilimToplam),
        tahmini: urunler.some((u) => u.tahmini),
      },
      dogrudanHurda: yuvarla(o.dogrudan_hurda),
      iptal: yuvarla(m.iptal),
      kontrol: { tutuyor: esit(giris, kontrolToplam), fark: yuvarla(giris - kontrolToplam) },
    },
    urunler,
    karantinaKararlari: kararlar,
  };
}

module.exports = { cozumle, agac, zamanCizelgesi, hammaddeBakiye, renk };
