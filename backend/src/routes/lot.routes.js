// Bitmis urun lotu islemleri: metraj olcumu, kesim, numune, yeniden kesim (bolum 8.3, 9.1, 9.2)
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER, BIRIM_DURUM: D, OLAY } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { altNumara } = require("../services/numara");
const { olayYaz, birimDurumu } = require("../services/iz");
const { etiketBas } = require("../services/etiket");
const { birimBul, birimOlustur, bagla, birimGuncelle, blokeKontrol, firmaAyarlari } = require("../services/birim");
const { yuvarla, topla } = require("../lib/miktar");
const { LOT_SECIM, lotSatiri } = require("../services/denge");

const router = express.Router();

// Olcumleri kontrol planina gore kaydeder; hepsi uygunsa true doner
async function olcumKaydet(c, ctx, birim, asama, olcumler) {
  const kars = await c.query("SELECT * FROM karakteristik WHERE urun_id = $1 AND asama = $2 AND aktif", [birim.urun_id, asama]);
  if (!kars.rows.length) {
    // Kontrol plani olmayan urun uretime alinamaz (is emri acilirken engellenir); burada da gecit yok
    throw hatalar.engel(`Bu urun icin ${asama} kontrol plani tanimli degil. Tanimlar'dan karakteristik ekleyin.`, "KONTROL_PLANI_YOK");
  }
  if (!Array.isArray(olcumler) || !olcumler.length) {
    throw hatalar.gecersiz(`Bu urun icin ${asama} olcumu gerekli: ${kars.rows.map((k) => k.ad).join(", ")}`);
  }
  const sonuclar = [];
  for (const k of kars.rows) {
    const o = olcumler.find((x) => x.karakteristikId === k.id);
    if (!o) throw hatalar.gecersiz(`Eksik olcum: ${k.ad}`);
    const deger = d.sayi(o.deger, k.ad);
    const uygun = (k.alt_sinir === null || deger >= k.alt_sinir) && (k.ust_sinir === null || deger <= k.ust_sinir);
    await c.query(
      `INSERT INTO olcum (firma_id, is_emri_id, birim_id, karakteristik_id, asama, deger, sonuc, kullanici_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ctx.firmaId, birim.is_emri_id, birim.id, k.id, asama, deger, uygun ? "UYGUN" : "UYGUN_DEGIL", ctx.kullaniciId],
    );
    sonuclar.push({ karakteristik: k.ad, deger, altSinir: k.alt_sinir, ustSinir: k.ust_sinir, uygun });
  }
  return { gerekliydi: true, uygun: sonuclar.every((s) => s.uygun), sonuclar };
}

// POST /api/lotlar/:barkod/kesim
// { parcalar: [100, 100, 95] | (adet + boy), kesimFiresi?, olcumler?: [{karakteristikId, deger}], aciklama? }
router.post(
  "/:barkod/kesim",
  rol(ROLLER.OPERATOR, ROLLER.SEF, ROLLER.KALITE),
  sar(async (req, res) => {
    const b = req.body;
    let parcalar = b.parcalar;
    if (!parcalar && b.adet) {
      const adet = d.sayi(b.adet, "Adet", { min: 1, max: 500 });
      const boy = d.sayi(b.boy, "Boy", { pozitif: true });
      parcalar = Array.from({ length: adet }, () => boy);
    }
    d.dizi(parcalar, "Parcalar", { min: 1, max: 500 });
    parcalar = parcalar.map((p, i) => d.sayi(p, `${i + 1}. parca boyu`, { pozitif: true }));
    const fireGirilen = d.sayi(b.kesimFiresi, "Kesim firesi", { zorunlu: false, min: 0 });

    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const top = await birimBul(c, F, req.params.barkod, { tipler: ["FG_LOT"] });
      blokeKontrol(top);
      if (top.durum !== D.KESIM_BEKLIYOR) throw hatalar.engel(`${top.barkod} kesime hazir degil (durum: ${top.durum})`, "YANLIS_DURUM");
      const ayar = await firmaAyarlari(c, F);

      // Sahit numune kesimden ONCE toptan alinir (bolum 9.2). Alinmadan kesim yapilmaz.
      if (ayar.numuneZorunlu !== false) {
        const nm = await bir(c, "SELECT 1 FROM birim WHERE lot_id = $1 AND tip = 'NM'", [top.lot_id]);
        if (!nm) throw hatalar.engel("Once bu toptan sahit numune alin, sonra kesim yapin.", "NUMUNE_YOK");
      }

      // Metraj olcumu (bolum 8.3 adim 2): uygun degilse kesim engellenir, top karantinaya alinir.
      // Kalite "sartli kabul" verdiyse olcum yine kaydedilir ama kesimi durdurmaz.
      const olcum = await olcumKaydet(c, req.ctx, top, "METRAJ", b.olcumler);
      if (!olcum.uygun && !top.ek?.sartliKabul) {
        await birimGuncelle(c, req.ctx, top.id, { ek: { ...top.ek, karantina: { neden: "Metraj olcumu tolerans disi", sonuclar: olcum.sonuclar } } });
        await birimDurumu(c, req.ctx, top, D.KARANTINA, { olayTipi: OLAY.KARANTINAYA_AYIRMA, aciklama: "Metraj olcumu tolerans disi", gerekce: "Metraj olcumu tolerans disi" });
        await c.query("UPDATE lot SET durum = $1 WHERE id = $2", [D.KARANTINA, top.lot_id]);
        return { engellendi: true, mesaj: "Olcum tolerans disi. Top karantinaya alindi, kesim yapilmadi. Karari kalite verir.", olcum };
      }

      // Hesap: top metraji = parcalar + fire. Fire, girilen degil HESAPLANAN degerdir (kayip metre kalmaz).
      const topMetre = yuvarla(top.miktar);
      const parcaToplam = topla(parcalar);
      const kalan = yuvarla(topMetre - parcaToplam); // > 0 fire, < 0 olcum fazlasi
      const tol = ayar.kesimToleransiYuzde ?? 1;
      const tolMetre = yuvarla((topMetre * tol) / 100);
      if (kalan < -tolMetre) {
        throw hatalar.engel(`Parcalarin toplami (${parcaToplam} m) topun metrajindan (${topMetre} m) %${tol}'den fazla buyuk`, "KESIM_FAZLA");
      }
      const fire = kalan > 0 ? kalan : 0;
      const olcumFazlasi = kalan < 0 ? -kalan : 0;
      // Aciklama zorunlu: operatorun bildirdigi fire ile hesaplanan fire arasinda tolerans ustu fark varsa
      const bildirilen = fireGirilen ?? 0;
      const sapma = yuvarla(Math.abs(kalan - bildirilen));
      const farkYuzde = topMetre > 0 ? yuvarla((sapma / topMetre) * 100, 2) : 0;
      const aciklama = d.metin(b.aciklama, "Aciklama", { zorunlu: sapma > tolMetre, max: 1000 });

      const birimler = [];
      const etiketler = [];
      for (const boy of parcalar) {
        const { barkod, sira } = await altNumara(c, F, top.lot_no);
        const fg = await birimOlustur(c, req.ctx, {
          barkod, sira, tip: "FG", lotId: top.lot_id, urunId: top.urun_id, isEmriId: top.is_emri_id, makineId: top.makine_id,
          miktar: boy, olcuBirimi: top.olcu_birimi, durum: D.KALITE_BEKLIYOR, yer: "METRAJ",
        });
        await bagla(c, req.ctx, top.id, fg.id, "KESILDI", boy);
        birimler.push(fg);
      }
      for (const fg of birimler) etiketler.push(await etiketBas(c, req.ctx, fg.id));
      await birimGuncelle(c, req.ctx, top.id, { miktar: 0 });
      await birimDurumu(c, req.ctx, top, D.KESILDI);
      await c.query("UPDATE lot SET durum = $1 WHERE id = $2", [D.KESILDI, top.lot_id]);
      await olayYaz(c, req.ctx, {
        tip: OLAY.KESIM, birimId: top.id, miktar: parcaToplam, olcuBirimi: top.olcu_birimi,
        aciklama: `${parcalar.length} parca${aciklama ? ` - ${aciklama}` : ""}`,
        veri: { parcalar, topMetre, parcaToplam, fireHesaplanan: fire, fireBildirilen: fireGirilen, olcumFazlasi, farkYuzde },
      });
      if (fire > 0) {
        await olayYaz(c, req.ctx, {
          tip: OLAY.HURDA, birimId: top.id, miktar: fire, olcuBirimi: top.olcu_birimi,
          aciklama: "Kesim firesi", veri: { neden: "KESIM_FIRESI" },
        });
      }
      if (olcumFazlasi > 0) {
        await olayYaz(c, req.ctx, {
          tip: OLAY.DUZELTME, birimId: top.id, miktar: olcumFazlasi, olcuBirimi: top.olcu_birimi,
          aciklama: "Kesimde parcalar top metrajindan uzun cikti (olcum farki)", veri: { neden: "OLCUM_FAZLASI" },
        });
      }
      return {
        engellendi: false, lotNo: top.lot_no, birimler, etiketler,
        hesap: { topMetre, parcaToplam, fire, olcumFazlasi, fireBildirilen: fireGirilen, kontrol: yuvarla(parcaToplam + fire - olcumFazlasi) },
        toplam: yuvarla(parcaToplam + fire), farkYuzde, olcum,
      };
    });
    res.status(sonuc.engellendi ? 409 : 201).json(sonuc);
  }),
);

// POST /api/lotlar/:barkod/numune  { arsivYeri? }  -> sahit numune (bolum 9.2)
// Numune kesimden once topun kendisinden kesilir: topun metraji numune boyu kadar azalir.
router.post(
  "/:barkod/numune",
  rol(ROLLER.KALITE, ROLLER.OPERATOR),
  sar(async (req, res) => {
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const top = await birimBul(c, F, req.params.barkod, { tipler: ["FG_LOT"] });
      const barkod = `NM-${top.lot_no}`;
      const varMi = await bir(c, "SELECT 1 FROM birim WHERE firma_id = $1 AND barkod = $2", [F, barkod]);
      if (varMi) throw hatalar.engel(`Bu lottan zaten numune alinmis: ${barkod}`, "ZATEN_VAR");
      blokeKontrol(top);
      if (top.durum !== D.KESIM_BEKLIYOR) {
        throw hatalar.engel(`Numune kesimden once, kesim bekleyen toptan alinir (top durumu: ${top.durum})`, "YANLIS_DURUM");
      }
      const urun = await bir(c, "SELECT numune_boyu FROM urun WHERE id = $1", [top.urun_id]);
      const boy = yuvarla(Number(urun.numune_boyu) || 1);
      if (boy >= Number(top.miktar)) throw hatalar.engel(`Numune boyu (${boy} m) topun kalan metrajindan (${top.miktar} m) kucuk olmali`, "YETERSIZ_MIKTAR");
      const ayar = await firmaAyarlari(c, F);
      const imha = new Date();
      imha.setFullYear(imha.getFullYear() + (ayar.numuneSaklamaYil ?? 3));
      const arsivYeri = req.body.arsivYeri ? d.kod(req.body.arsivYeri, "Arsiv yeri") : null;
      const nm = await birimOlustur(c, req.ctx, {
        barkod, tip: "NM", lotId: top.lot_id, urunId: top.urun_id, isEmriId: top.is_emri_id, makineId: top.makine_id,
        miktar: boy, olcuBirimi: top.olcu_birimi, durum: D.ARSIVDE,
        yer: arsivYeri ? `NUMUNE:${arsivYeri}` : "NUMUNE",
        ek: { arsivYeri, imhaTarihi: imha.toISOString().slice(0, 10) },
      });
      const kalan = yuvarla(top.miktar - boy);
      await birimGuncelle(c, req.ctx, top.id, { miktar: kalan });
      await bagla(c, req.ctx, top.id, nm.id, "NUMUNE", boy);
      await olayYaz(c, req.ctx, {
        tip: OLAY.NUMUNE, birimId: nm.id, karsiBirimId: top.id, miktar: boy, olcuBirimi: nm.olcu_birimi,
        aciklama: arsivYeri || "", veri: { topKalan: kalan },
      });
      return { numune: nm, topKalan: kalan, etiket: await etiketBas(c, req.ctx, nm.id) };
    });
    res.status(201).json(sonuc);
  }),
);

// POST /api/lotlar/birim/:barkod/bol  { parcalar: [50, 50] }  -> serbest bir parcayi yeniden keser (bolum 9.4)
router.post(
  "/birim/:barkod/bol",
  rol(ROLLER.OPERATOR, ROLLER.SEF, ROLLER.DEPO),
  sar(async (req, res) => {
    const parcalar = d.dizi(req.body.parcalar, "Parcalar", { min: 2, max: 200 }).map((p, i) => d.sayi(p, `${i + 1}. parca`, { pozitif: true }));
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const eski = await birimBul(c, F, req.params.barkod, { tipler: ["FG"] });
      blokeKontrol(eski);
      if (![D.SERBEST, D.DEPODA].includes(eski.durum)) throw hatalar.engel(`${eski.barkod} bolunemez (durum: ${eski.durum})`, "YANLIS_DURUM");
      const toplam = topla(parcalar);
      if (toplam > yuvarla(eski.miktar)) throw hatalar.engel(`Parcalarin toplami (${toplam}) mevcut boydan (${eski.miktar}) fazla`, "KESIM_FAZLA");
      const yeniler = [];
      const etiketler = [];
      for (const boy of parcalar) {
        const { barkod, sira } = await altNumara(c, F, eski.lot_no);
        const fg = await birimOlustur(c, req.ctx, {
          barkod, sira, tip: "FG", lotId: eski.lot_id, urunId: eski.urun_id, isEmriId: eski.is_emri_id, makineId: eski.makine_id,
          miktar: boy, olcuBirimi: eski.olcu_birimi, durum: eski.durum, yer: eski.yer, kaynakBirimId: eski.id,
        });
        await bagla(c, req.ctx, eski.id, fg.id, "BOLUNDU", boy);
        yeniler.push(fg);
        etiketler.push(await etiketBas(c, req.ctx, fg.id));
      }
      await birimGuncelle(c, req.ctx, eski.id, { miktar: 0 });
      await birimDurumu(c, req.ctx, eski, D.BOLUNDU, { olayTipi: OLAY.KESIM, aciklama: `${parcalar.length} parcaya bolundu` });
      const bolmeFiresi = yuvarla(eski.miktar - toplam);
      if (bolmeFiresi > 0) {
        await olayYaz(c, req.ctx, { tip: OLAY.HURDA, birimId: eski.id, miktar: bolmeFiresi, olcuBirimi: eski.olcu_birimi, aciklama: "Yeniden kesim firesi", veri: { neden: "BOLME_FIRESI" } });
      }
      return { eski: eski.barkod, yeniler, etiketler };
    });
    res.status(201).json(sonuc);
  }),
);

// F-03 Uretim Lot ve YP Uretim Ozeti: her top icin miktar dokumu ve denge kontrolu (services/denge.js).
// GET /api/lotlar  -> uretim lotlari (en yeni once)
router.get(
  "/",
  sar(async (req, res) => {
    const r = await pool.query(`${LOT_SECIM} ORDER BY l.olusturma_zamani DESC LIMIT 500`, [req.ctx.firmaId]);
    res.json(r.rows.map(lotSatiri));
  }),
);

// GET /api/lotlar/:no  -> lot ozeti + tum parcalari (kesilen, karantina, numune)
router.get(
  "/:no",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const ham = await bir(pool, `${LOT_SECIM} AND l.no = $2`, [F, String(req.params.no).toUpperCase()]);
    if (!ham) throw hatalar.bulunamadi("Uretim lotu bulunamadi");
    const lot = lotSatiri(ham);
    const birimler = await pool.query(
      `SELECT b.barkod, b.tip, b.ilk_miktar, b.miktar, b.olcu_birimi, b.durum, b.bloke, b.yer, b.ek, b.olusturma_zamani,
              b.kaynak_birim_id, k.ad_soyad AS olusturan_ad
         FROM birim b LEFT JOIN kullanici k ON k.id = b.olusturan
        WHERE b.lot_id = $1 ORDER BY b.tip = 'FG_LOT' DESC, b.sira NULLS LAST, b.olusturma_zamani`,
      [lot.id],
    );
    const karakteristikler = await pool.query(
      `SELECT k.* FROM karakteristik k JOIN lot l ON l.urun_id = k.urun_id WHERE l.id = $1 AND k.asama = 'METRAJ' AND k.aktif ORDER BY k.sira`,
      [lot.id],
    );
    res.json({ lot, birimler: birimler.rows, metrajKarakteristikleri: karakteristikler.rows });
  }),
);

module.exports = router;
