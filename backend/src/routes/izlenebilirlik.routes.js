// Barkod sorgusu, soy agaci, zaman cizelgesi, etiket ve yerlestirme (bolum 10, 13)
const express = require("express");
const { pool, tx, bir } = require("../config/db");
const { sar, hatalar } = require("../lib/hata");
const d = require("../lib/dogrula");
const { ROLLER, BIRIM_DURUM: D, OLAY } = require("../lib/sabitler");
const { rol } = require("../middleware/auth");
const { olayYaz, birimDurumu } = require("../services/iz");
const { etiketBas, etiketVerisi, zplUret } = require("../services/etiket");
const { birimBul, birimGuncelle } = require("../services/birim");
const { cozumle, agac, zamanCizelgesi } = require("../services/izlenebilirlik");

const router = express.Router();
const yonOku = (q) => d.secim(q || "ikisi", "Yon", ["geri", "ileri", "ikisi"]);

// GET /api/barkod/:barkod  -> okutulan seyin ne oldugu (kiosk ve arama cubugu bunu kullanir)
router.get(
  "/barkod/:barkod",
  sar(async (req, res) => {
    res.json(await cozumle(pool, req.ctx.firmaId, req.params.barkod));
  }),
);

// GET /api/izlenebilirlik/:barkod?yon=ikisi  -> soy agaci (dugumler + baglar)
router.get(
  "/izlenebilirlik/:barkod",
  sar(async (req, res) => {
    const bas = Date.now();
    const sonuc = await agac(pool, req.ctx.firmaId, req.params.barkod, yonOku(req.query.yon));
    res.json({ ...sonuc, sureMs: Date.now() - bas });
  }),
);

// GET /api/izlenebilirlik/:barkod/olaylar?yon=ikisi  -> zaman cizelgesi
router.get(
  "/izlenebilirlik/:barkod/olaylar",
  sar(async (req, res) => {
    res.json(await zamanCizelgesi(pool, req.ctx.firmaId, req.params.barkod, yonOku(req.query.yon)));
  }),
);

// GET /api/birimler/:barkod/etiket  -> etiket onizlemesi (kayit olusturmaz)
router.get(
  "/birimler/:barkod/etiket",
  sar(async (req, res) => {
    const b = await birimBul(pool, req.ctx.firmaId, req.params.barkod, { kilit: false });
    const veri = await etiketVerisi(pool, req.ctx.firmaId, b.id);
    res.json({ barkod: b.barkod, tip: b.tip, zpl: zplUret(veri), veri });
  }),
);

// POST /api/birimler/:barkod/etiket  { neden }  -> yeniden baski (Kopya 2, 3...)
router.post(
  "/birimler/:barkod/etiket",
  sar(async (req, res) => {
    const neden = d.metin(req.body.neden, "Neden", { zorunlu: false, max: 200 }) || "YENIDEN_BASKI";
    const sonuc = await tx(async (c) => {
      const b = await birimBul(c, req.ctx.firmaId, req.params.barkod);
      const etiket = await etiketBas(c, req.ctx, b.id, neden);
      await olayYaz(c, req.ctx, { tip: OLAY.ETIKET_BASKISI, birimId: b.id, aciklama: `Kopya ${etiket.kopyaNo} - ${neden}` });
      return etiket;
    });
    res.json(sonuc);
  }),
);

// POST /api/birimler/:barkod/yerlestir  { yerKodu }  -> rafa yerlestirme (bolum 9.3)
router.post(
  "/birimler/:barkod/yerlestir",
  rol(ROLLER.DEPO, ROLLER.SEF, ROLLER.KALITE),
  sar(async (req, res) => {
    const yerKodu = d.kod(req.body.yerKodu, "Yer kodu");
    const sonuc = await tx(async (c) => {
      const F = req.ctx.firmaId;
      const yer = await bir(c, "SELECT * FROM depo_yeri WHERE firma_id = $1 AND kod = $2 AND aktif", [F, yerKodu]);
      if (!yer) throw hatalar.bulunamadi(`Depo yeri bulunamadi: ${yerKodu}`);
      const b = await birimBul(c, F, req.body.barkod || req.params.barkod);
      const aktif = await bir(c, "SELECT 1 FROM is_emri_baglama WHERE birim_id = $1 AND cikarma_zamani IS NULL", [b.id]);
      if (aktif) throw hatalar.engel(`${b.barkod} su an bir is emrine bagli`, "ZATEN_BAGLI");
      const onek = yer.tip === "NUMUNE" ? "NUMUNE" : yer.tip === "KARANTINA" ? "KARANTINA" : "DEPO";
      const g = await birimGuncelle(c, req.ctx, b.id, { yer: `${onek}:${yer.kod}` });
      await olayYaz(c, req.ctx, { tip: OLAY.YERLESTIRME, birimId: b.id, aciklama: yer.kod });
      if (b.tip === "FG" && b.durum === D.SERBEST && yer.tip === "RAF") await birimDurumu(c, req.ctx, b, D.DEPODA);
      return g;
    });
    res.json(sonuc);
  }),
);

module.exports = router;
