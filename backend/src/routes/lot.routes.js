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

const router = express.Router();

// Olcumleri kontrol planina gore kaydeder; hepsi uygunsa true doner
async function olcumKaydet(c, ctx, birim, asama, olcumler) {
  const kars = await c.query("SELECT * FROM karakteristik WHERE urun_id = $1 AND asama = $2 AND aktif", [birim.urun_id, asama]);
  if (!kars.rows.length) return { gerekliydi: false, uygun: true, sonuclar: [] };
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
    const fire = d.sayi(b.kesimFiresi, "Kesim firesi", { zorunlu: false, min: 0 }) || 0;

    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const top = await birimBul(c, F, req.params.barkod, { tipler: ["FG_LOT"] });
      blokeKontrol(top);
      if (top.durum !== D.KESIM_BEKLIYOR) throw hatalar.engel(`${top.barkod} kesime hazir degil (durum: ${top.durum})`, "YANLIS_DURUM");

      // Metraj olcumu (bolum 8.3 adim 2): uygun degilse kesim engellenir, top karantinaya alinir
      const olcum = await olcumKaydet(c, req.ctx, top, "METRAJ", b.olcumler);
      if (!olcum.uygun) {
        await birimDurumu(c, req.ctx, top, D.KARANTINA, { olayTipi: OLAY.KARANTINAYA_AYIRMA, aciklama: "Metraj olcumu tolerans disi" });
        return { engellendi: true, mesaj: "Olcum tolerans disi. Top karantinaya alindi, kesim yapilmadi.", olcum };
      }

      const toplam = parcalar.reduce((a, x) => a + x, 0) + fire;
      const ayar = await firmaAyarlari(c, F);
      const tol = ayar.kesimToleransiYuzde ?? 1;
      const farkYuzde = (Math.abs(toplam - top.miktar) / top.miktar) * 100;
      if (toplam > top.miktar * (1 + tol / 100)) {
        throw hatalar.engel(`Parcalarin toplami (${toplam} m) topun metrajindan (${top.miktar} m) fazla`, "KESIM_FAZLA");
      }
      const aciklama = d.metin(b.aciklama, "Aciklama", { zorunlu: farkYuzde > tol, max: 1000 });

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
        tip: OLAY.KESIM, birimId: top.id, miktar: toplam - fire, olcuBirimi: top.olcu_birimi,
        aciklama: `${parcalar.length} parca${aciklama ? ` - ${aciklama}` : ""}`, veri: { parcalar, fire, farkYuzde },
      });
      if (fire > 0) {
        await olayYaz(c, req.ctx, { tip: OLAY.HURDA, birimId: top.id, miktar: fire, olcuBirimi: top.olcu_birimi, aciklama: "Kesim firesi" });
      }
      return { engellendi: false, lotNo: top.lot_no, birimler, etiketler, toplam, farkYuzde: Math.round(farkYuzde * 100) / 100, olcum };
    });
    res.status(sonuc.engellendi ? 409 : 201).json(sonuc);
  }),
);

// POST /api/lotlar/:barkod/numune  { arsivYeri? }  -> sahit numune (bolum 9.2)
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
      const urun = await bir(c, "SELECT numune_boyu FROM urun WHERE id = $1", [top.urun_id]);
      const ayar = await firmaAyarlari(c, F);
      const imha = new Date();
      imha.setFullYear(imha.getFullYear() + (ayar.numuneSaklamaYil ?? 3));
      const arsivYeri = req.body.arsivYeri ? d.kod(req.body.arsivYeri, "Arsiv yeri") : null;
      const nm = await birimOlustur(c, req.ctx, {
        barkod, tip: "NM", lotId: top.lot_id, urunId: top.urun_id, isEmriId: top.is_emri_id, makineId: top.makine_id,
        miktar: urun.numune_boyu || 1, olcuBirimi: top.olcu_birimi, durum: D.ARSIVDE,
        yer: arsivYeri ? `NUMUNE:${arsivYeri}` : "NUMUNE",
        ek: { arsivYeri, imhaTarihi: imha.toISOString().slice(0, 10) },
      });
      await bagla(c, req.ctx, top.id, nm.id, "NUMUNE", nm.miktar);
      await olayYaz(c, req.ctx, { tip: OLAY.NUMUNE, birimId: nm.id, karsiBirimId: top.id, miktar: nm.miktar, olcuBirimi: nm.olcu_birimi, aciklama: arsivYeri || "" });
      return { numune: nm, etiket: await etiketBas(c, req.ctx, nm.id) };
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
      const toplam = parcalar.reduce((a, x) => a + x, 0);
      if (toplam > eski.miktar) throw hatalar.engel(`Parcalarin toplami (${toplam}) mevcut boydan (${eski.miktar}) fazla`, "KESIM_FAZLA");
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
      if (toplam < eski.miktar) {
        await olayYaz(c, req.ctx, { tip: OLAY.HURDA, birimId: eski.id, miktar: eski.miktar - toplam, olcuBirimi: eski.olcu_birimi, aciklama: "Yeniden kesim firesi" });
      }
      return { eski: eski.barkod, yeniler, etiketler };
    });
    res.status(201).json(sonuc);
  }),
);

// F-03 Uretim Lot ve YP Uretim Ozeti: her top (uretim lotu) icin miktar dokumu.
// Toplam = top metraji + uretim sirasinda karantinaya ayrilan; Uygun = kullanilabilir parcalar;
// Red/Hurda = hurda karantina + son kontrol reddi + kesim firesi.
const LOT_SECIM = `
  SELECT l.id, l.no, l.durum, l.olusturma_zamani,
         u.kod AS urun_kod, u.ad AS urun_ad, u.olcu_birimi,
         ie.no AS is_emri_no, m.kod AS makine_kod,
         ko.ad_soyad AS operator_ad, ko.sicil_no AS operator_sicil,
         t.barkod AS top_barkod, t.ilk_miktar AS top_metraji, t.durum AS top_durum, t.bloke AS top_bloke,
         COALESCE((t.ek->>'baslangic')::timestamptz, ie.baslangic) AS baslangic, t.olusturma_zamani AS bitis,
         COALESCE(f.uygun, 0) AS uygun, COALESCE(f.kalite_bekleyen, 0) AS kalite_bekleyen, COALESCE(f.ret, 0) AS ret,
         COALESCE(f.parca_sayisi, 0) AS parca_sayisi, COALESCE(f.bloke_parca, 0) AS bloke_parca,
         COALESCE(k.karantina, 0) AS karantina, COALESCE(k.karantina_bekleyen, 0) AS karantina_bekleyen,
         COALESCE(k.karantina_hurda, 0) AS karantina_hurda,
         COALESCE(h.kesim_firesi, 0) AS kesim_firesi,
         rm.hammadde_lotlari, nm.barkod AS numune_barkod
    FROM lot l
    JOIN urun u ON u.id = l.urun_id
    LEFT JOIN is_emri ie ON ie.id = l.is_emri_id
    LEFT JOIN makine m ON m.id = ie.makine_id
    LEFT JOIN kullanici ko ON ko.id = l.olusturan
    LEFT JOIN birim t ON t.lot_id = l.id AND t.tip = 'FG_LOT'
    LEFT JOIN LATERAL (
      SELECT sum(b.miktar) FILTER (WHERE b.durum IN ('SERBEST','DEPODA','SIPARISE_AYRILDI','SEVK_EDILDI')) AS uygun,
             sum(b.miktar) FILTER (WHERE b.durum = 'KALITE_BEKLIYOR') AS kalite_bekleyen,
             sum(b.ilk_miktar) FILTER (WHERE b.durum IN ('RET','HURDA')) AS ret,
             count(*) FILTER (WHERE b.durum <> 'BOLUNDU') AS parca_sayisi,
             count(*) FILTER (WHERE b.bloke) AS bloke_parca
        FROM birim b WHERE b.lot_id = l.id AND b.tip = 'FG') f ON true
    LEFT JOIN LATERAL (
      SELECT sum(b.ilk_miktar) AS karantina,
             sum(b.ilk_miktar) FILTER (WHERE b.durum IN ('KARAR_BEKLIYOR','YENIDEN_ISLEME')) AS karantina_bekleyen,
             sum(b.ilk_miktar) FILTER (WHERE b.durum = 'HURDA') AS karantina_hurda
        FROM birim b WHERE b.lot_id = l.id AND b.tip = 'KR') k ON true
    LEFT JOIN LATERAL (
      SELECT sum(o.miktar) AS kesim_firesi FROM olay o WHERE o.birim_id = t.id AND o.tip = 'HURDA') h ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT rl.no, ', ') AS hammadde_lotlari
        FROM birim_bagi bb JOIN birim rb ON rb.id = bb.kaynak_id JOIN lot rl ON rl.id = rb.lot_id
       WHERE bb.hedef_id = t.id AND bb.tip = 'TUKETILDI') rm ON true
    LEFT JOIN birim nm ON nm.lot_id = l.id AND nm.tip = 'NM'
   WHERE l.firma_id = $1 AND l.tip = 'FG'`;

// GET /api/lotlar  -> uretim lotlari (en yeni once)
router.get(
  "/",
  sar(async (req, res) => {
    const r = await pool.query(`${LOT_SECIM} ORDER BY l.olusturma_zamani DESC LIMIT 500`, [req.ctx.firmaId]);
    res.json(r.rows);
  }),
);

// GET /api/lotlar/:no  -> lot ozeti + tum parcalari (kesilen, karantina, numune)
router.get(
  "/:no",
  sar(async (req, res) => {
    const F = req.ctx.firmaId;
    const lot = await bir(pool, `${LOT_SECIM} AND l.no = $2`, [F, String(req.params.no).toUpperCase()]);
    if (!lot) throw hatalar.bulunamadi("Uretim lotu bulunamadi");
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
