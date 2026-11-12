// Urun hikayesi ozeti: bir barkodun ne oldugunu duz cumlelerle ve tek kaynaktan gelen sayilarla anlatir.
// Akis diyagrami ve miktar dengesi ekranlari bu servisi kullanir; boylece her ekran ayni sayiyi gosterir.
//
//   - Parca yolculugu: bir makaranin/bobinin sirayla basina gelenler ("Son kontrol -> Ege'ye sevk -> iade -> ret")
//   - Uretim lotu ozeti: top + bu topu ureten is emri (hangi bobinden ne kadar kullanildi) + parcalar
//   - Hammadde lotu ozeti: bobin bobin ne oldu (hangi is emrine ne kadar gitti, ne kadari depoda, ne kadari hurda)
const { bir } = require("../config/db");
const { hatalar } = require("../lib/hata");
const { LOT_SECIM, lotDengesi } = require("./denge");
const { cozumle } = require("./izlenebilirlik");
const { yuvarla } = require("../lib/miktar");

const sayi = (n, h = 2) => (Number(n) || 0).toLocaleString("tr-TR", { maximumFractionDigits: h });
const tarih = (t) =>
  t
    ? new Date(t).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
const gun = (t) => (t ? new Date(t).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" }) : "");

// Bir birimin olaylarindan kisa adimlar uretir (en eskiden en yeniye)
function adimlar(olaylar) {
  const sonuc = [];
  for (const o of olaylar) {
    const v = o.veri || {};
    let metin = null;
    let ana = false; // ozet satirina girer mi
    switch (o.tip) {
      case "KABUL":
        metin = `Mal kabul: ${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
        break;
      case "KONTROL_KARARI":
        metin = v.yeni === "KABUL" ? "Giriş kontrolü: kabul" : v.yeni === "RET" ? "Giriş kontrolü: ret" : v.yeni === "KARANTINA" ? "Karantinaya alındı" : "Giriş kontrolü";
        ana = v.yeni !== "KABUL";
        break;
      case "BOLME":
        metin = `${sayi(o.miktar)} ${o.olcu_birimi || ""} ayrılıp ${o.karsi_barkod} oldu`;
        ana = true;
        break;
      case "CEKIS":
        metin = "Depodan hatta çekildi";
        break;
      case "YUKLEME":
        metin = `Makineye takıldı${o.is_emri_no ? ` (${o.is_emri_no})` : ""}`;
        break;
      case "TUKETIM":
        metin = `Üretimde kullanıldı: ${sayi(o.miktar)} ${o.olcu_birimi || ""}${o.is_emri_no ? ` (${o.is_emri_no})` : ""}`;
        ana = true;
        break;
      case "IADE":
        metin = `Depoya geri döndü: ${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
        ana = true;
        break;
      case "URETIM":
        metin = `Üretildi: ${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
        ana = true;
        break;
      case "KESIM":
        if (/bolundu/.test(o.aciklama || "")) {
          metin = `Yeniden kesildi: ${(o.aciklama || "").replace("parcaya bolundu", "parçaya bölündü")}`;
          ana = true;
        } else {
          const adet = Array.isArray(v.parcalar) ? v.parcalar.length : null;
          metin = `Kesildi: ${adet ? `${adet} parça, ` : ""}${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
          ana = true;
        }
        break;
      case "NUMUNE":
        metin = `Şahit numune alındı: ${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
        ana = true;
        break;
      case "SON_KONTROL":
        metin = v.yeni === "SERBEST" ? "Son kontrol: serbest" : v.yeni === "RET" ? "Son kontrol: reddedildi" : v.yeni === "KARANTINA" ? "Son kontrol: karantinaya alındı" : "Son kontrol";
        ana = true;
        break;
      case "KARANTINAYA_AYIRMA":
        metin = `Karantinaya ayrıldı: ${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
        ana = true;
        break;
      case "KARANTINA_KARARI":
        metin = `Kalite kararı: ${{ OLUMLU: "olumlu", HURDA: "hurda", SARTLI_KABUL: "şartlı kabul", KESIM_BEKLIYOR: "yeniden işleme", YENIDEN_ISLEME: "yeniden işleme" }[v.yeni] || v.yeni || ""}`;
        ana = true;
        break;
      case "YERLESTIRME":
        metin = `Rafa kondu${o.aciklama ? ` (${o.aciklama})` : ""}`;
        break;
      case "SIPARISE_AYIRMA":
        metin = "Sevkiyata okutuldu";
        break;
      case "SEVKIYAT":
        metin = `Sevk edildi: ${v.musteri || ""}`;
        ana = true;
        break;
      case "MUSTERI_IADESI":
        metin = "Müşteriden iade geldi";
        ana = true;
        break;
      case "HURDA":
        metin = v.neden === "KESIM_FIRESI" ? `Kesim firesi: ${sayi(o.miktar)} ${o.olcu_birimi || ""}` : `Hurdaya ayrıldı: ${sayi(o.miktar)} ${o.olcu_birimi || ""}`;
        ana = true;
        break;
      case "BLOKE":
        metin = "Bloke edildi (sevk edilemez)";
        ana = true;
        break;
      case "BLOKE_KALDIRMA":
        metin = "Bloke kaldırıldı";
        ana = true;
        break;
      case "ETIKET_BASKISI":
        if (/Kopya ([2-9]|\d\d)/.test(o.aciklama || "")) {
          const neden = (o.aciklama || "").split(" - ").slice(1).join(" - ");
          metin = `Etiket yeniden basıldı${neden ? ` (${neden.replace(/\.$/, "")})` : ""}`;
          ana = true;
        }
        break;
      case "IPTAL":
        metin = "İptal edildi";
        ana = true;
        break;
      default:
        break;
    }
    if (metin) sonuc.push({ zaman: o.zaman, metin, ana, kim: o.kullanici, aciklama: o.aciklama });
  }
  return sonuc;
}

// Birimin su anki hali, tek cumle
function simdi(b, ek = {}) {
  const yer = b.yer && b.yer.startsWith("DEPO:") ? ` (${b.yer.slice(5)})` : "";
  if (b.durum === "SEVK_EDILDI") return `Müşteride${ek.musteri ? `: ${ek.musteri}` : ""}`;
  if (["HURDA", "RET"].includes(b.durum)) return "Hurdaya ayrıldı";
  if (b.durum === "BOLUNDU") return ek.cocuklar?.length ? `Bölündü: ${ek.cocuklar.join(" + ")}` : "Bölündü";
  if (b.durum === "TUKENDI") return "Tamamı kullanıldı";
  if (b.durum === "KESILDI") return "Tamamı kesildi";
  if (b.durum === "IPTAL") return "İptal edildi";
  if (b.bloke) return `Depoda, bloke: sevk edilemez${yer}`;
  if (b.durum === "SIPARISE_AYRILDI") return `Sevkiyata ayrıldı, henüz gönderilmedi${yer}`;
  if (["SERBEST", "DEPODA"].includes(b.durum)) return `Depoda, kullanılabilir${yer}`;
  if (b.durum === "OLUMLU") return "Olumlu karar: yeni numarayla stoğa girdi";
  if (b.durum === "SARTLI_KABUL") return "Şartlı kabul: yeni numarayla stoğa girdi";
  if (b.durum === "KALITE_BEKLIYOR") return "Son kontrol bekliyor";
  if (b.durum === "KARANTINA" && b.tip === "RM") return `Depoda, karantinada: kullanılamaz${yer}`;
  if (b.durum === "KARANTINA") return "Karantina alanında, kalite kararı bekliyor";
  if (b.durum === "KARAR_BEKLIYOR") return "Karantinada, kalite kararı bekliyor";
  if (b.durum === "KESIM_BEKLIYOR") return "Kesim bekliyor";
  if (b.durum === "KONTROL_BEKLIYOR") return "Giriş kontrolü bekliyor";
  if (b.yer && b.yer.startsWith("HAT:")) return `Makine başında (${b.yer.slice(4)})`;
  if (b.durum === "KABUL") return `Depoda, kullanılabilir${yer}`;
  return "";
}

// Birden fazla birimin yolculugu: { [birimId]: { adimlar, ozet, simdi } }
async function yolculuklar(c, F, birimler) {
  if (!birimler.length) return {};
  const idler = birimler.map((b) => b.id);
  const olaylar = await c.query(
    `SELECT o.id, o.birim_id, o.zaman, o.tip, o.miktar, o.olcu_birimi, o.aciklama, o.veri,
            kb.barkod AS karsi_barkod, ie.no AS is_emri_no, k.ad_soyad AS kullanici
       FROM olay o
       LEFT JOIN birim kb ON kb.id = o.karsi_birim_id
       LEFT JOIN is_emri ie ON ie.id = o.is_emri_id
       LEFT JOIN kullanici k ON k.id = o.kullanici_id
      WHERE o.firma_id = $1 AND o.birim_id = ANY($2::uuid[])
     UNION ALL
     -- Sahit numune olayi numune biriminde durur; topun yolculugunda da gorunsun (top = karsi birim)
     SELECT o.id, o.karsi_birim_id AS birim_id, o.zaman, o.tip, o.miktar, o.olcu_birimi, o.aciklama, o.veri,
            NULL AS karsi_barkod, NULL AS is_emri_no, k.ad_soyad AS kullanici
       FROM olay o LEFT JOIN kullanici k ON k.id = o.kullanici_id
      WHERE o.firma_id = $1 AND o.tip = 'NUMUNE' AND o.karsi_birim_id = ANY($2::uuid[])
      ORDER BY zaman, id`,
    [F, idler],
  );
  const sevk = await c.query(
    `SELECT ss.birim_id, mu.unvan AS musteri FROM sevkiyat_satiri ss JOIN sevkiyat s ON s.id = ss.sevkiyat_id
       JOIN musteri mu ON mu.id = s.musteri_id WHERE ss.birim_id = ANY($1::uuid[]) AND s.durum = 'SEVK_EDILDI'`,
    [idler],
  );
  const kaynaklar = await c.query(
    "SELECT b.id, k.barkod, k.tip FROM birim b JOIN birim k ON k.id = b.kaynak_birim_id WHERE b.id = ANY($1::uuid[])",
    [idler],
  );
  const cocuk = await c.query(
    "SELECT kaynak_birim_id, barkod, ilk_miktar FROM birim WHERE kaynak_birim_id = ANY($1::uuid[]) ORDER BY sira NULLS LAST, barkod",
    [idler],
  );
  const sonuc = {};
  for (const b of birimler) {
    const kendi = olaylar.rows.filter((o) => o.birim_id === b.id);
    const a = adimlar(kendi);
    // Baska bir parcadan bolunerek / kesilerek olustuysa bunu en basa yaz
    const kaynak = kaynaklar.rows.find((x) => x.id === b.id);
    if (kaynak) {
      a.unshift({
        zaman: b.olusturma_zamani || null,
        metin: kaynak.tip === "KR" ? `${kaynak.barkod} karantina kaydından geldi` : `${kaynak.barkod} parçasından ayrıldı`,
        ana: true,
      });
    }
    const cocuklar = cocuk.rows.filter((x) => x.kaynak_birim_id === b.id).map((x) => `${x.barkod} (${sayi(x.ilk_miktar)} ${b.olcu_birimi})`);
    const musteri = sevk.rows.find((x) => x.birim_id === b.id)?.musteri;
    sonuc[b.id] = {
      adimlar: a,
      ozet: a.filter((x) => x.ana).map((x) => x.metin).join(" → "),
      simdi: simdi(b, { musteri, cocuklar }),
    };
  }
  return sonuc;
}

// Uretim lotu (top) ozeti
async function uretimLotuOzeti(c, F, topId) {
  const satir = await bir(c, `${LOT_SECIM} AND l.id = (SELECT lot_id FROM birim WHERE id = $2)`, [F, topId]);
  if (!satir) throw hatalar.bulunamadi("Uretim lotu bulunamadi");
  const denge = lotDengesi(satir);
  const b = satir.olcu_birimi || "m";

  // Lotun parcalari: kesilen makaralar, bolunenlerden cikanlar, karantina, numune
  const birimler = (
    await c.query(
      `SELECT b.id, b.barkod, b.tip, b.durum, b.bloke, b.ilk_miktar, b.miktar, b.olcu_birimi, b.yer, b.ek, b.kaynak_birim_id, b.olusturma_zamani
         FROM birim b WHERE b.lot_id = $1 AND b.tip IN ('FG','KR','NM') ORDER BY b.tip, b.sira NULLS LAST, b.barkod`,
      [satir.id],
    )
  ).rows;
  const yol = await yolculuklar(c, F, birimler);
  const parcalar = birimler
    .filter((x) => x.tip === "FG")
    .map((x) => ({
      barkod: x.barkod,
      metre: Number(x.ilk_miktar),
      kalan: Number(x.miktar),
      durum: x.durum,
      bloke: x.bloke,
      kaynak: birimler.find((y) => y.id === x.kaynak_birim_id)?.barkod || null,
      karantinadanGelen: !!(x.ek && x.ek.karantinadan),
      ...yol[x.id],
    }));
  const karantina = birimler
    .filter((x) => x.tip === "KR")
    .map((x) => ({ barkod: x.barkod, metre: Number(x.ilk_miktar), durum: x.durum, neden: x.ek?.hataAciklama, hataKodu: x.ek?.hataKodu, ...yol[x.id] }));
  const numune = birimler.filter((x) => x.tip === "NM").map((x) => ({ barkod: x.barkod, metre: Number(x.ilk_miktar), yer: x.ek?.arsivYeri }));

  // Bu topu ureten is emri: hangi bobinden ne kadar kullanildi, is emrinden baska ne cikti
  const ie = await bir(
    c,
    `SELECT ie.id, ie.no, ie.durum, ie.baslangic, ie.bitis, ie.hedef_miktar, ie.denge, m.kod AS makine_kod,
            mu.unvan AS musteri,
            (SELECT string_agg(DISTINCT k.ad_soyad, ', ') FROM is_emri_baglama g JOIN kullanici k ON k.id = g.kullanici_id WHERE g.is_emri_id = ie.id) AS operatorler
       FROM is_emri ie JOIN makine m ON m.id = ie.makine_id LEFT JOIN musteri mu ON mu.id = ie.musteri_id
      WHERE ie.id = (SELECT is_emri_id FROM birim WHERE id = $1)`,
    [topId],
  );
  let isEmri = null;
  if (ie) {
    const bobinler = (
      await c.query(
        `SELECT rb.barkod, rb.olcu_birimi, m.kod AS malzeme_kod, rl.no AS lot_no, rl.tedarikci_lot, t.unvan AS tedarikci,
                g.baglama_miktari, g.tuketilen, g.cikarma_zamani
           FROM is_emri_baglama g JOIN birim rb ON rb.id = g.birim_id
           LEFT JOIN malzeme m ON m.id = rb.malzeme_id LEFT JOIN lot rl ON rl.id = rb.lot_id LEFT JOIN tedarikci t ON t.id = rl.tedarikci_id
          WHERE g.is_emri_id = $1 ORDER BY g.baglama_zamani`,
        [ie.id],
      )
    ).rows.map((x) => ({
      barkod: x.barkod,
      malzeme: x.malzeme_kod,
      lotNo: x.lot_no,
      tedarikci: x.tedarikci,
      tedarikciLot: x.tedarikci_lot,
      takilan: Number(x.baglama_miktari),
      kullanilan: x.cikarma_zamani ? Number(x.tuketilen) : null,
      iade: x.cikarma_zamani ? yuvarla(Number(x.baglama_miktari) - Number(x.tuketilen)) : null,
      birim: x.olcu_birimi,
    }));
    const ciktilar = (
      await c.query(
        `SELECT b.barkod, b.tip, b.ilk_miktar, b.durum FROM birim b
          WHERE b.is_emri_id = $1 AND (b.tip = 'FG_LOT' OR (b.tip = 'KR')) ORDER BY b.olusturma_zamani`,
        [ie.id],
      )
    ).rows.map((x) => ({ barkod: x.barkod, tip: x.tip, metre: Number(x.ilk_miktar), durum: x.durum }));
    isEmri = {
      no: ie.no,
      durum: ie.durum,
      makine: ie.makine_kod,
      musteri: ie.musteri,
      operatorler: ie.operatorler,
      baslangic: ie.baslangic,
      bitis: ie.bitis,
      hedef: Number(ie.hedef_miktar),
      denge: ie.denge,
      bobinler,
      ciktilar,
    };
  }

  // Duz cumleler
  const cumleler = [];
  const g = denge.dagilim;
  const tedarik = isEmri ? [...new Set(isEmri.bobinler.map((x) => `${x.tedarikci || "?"} ${x.tedarikciLot ? `(parti ${x.tedarikciLot})` : ""}`.trim()))] : [];
  if (isEmri) {
    const kullanilan = isEmri.bobinler.filter((x) => x.kullanilan !== null);
    const kg = yuvarla(kullanilan.reduce((t, x) => t + x.kullanilan, 0));
    cumleler.push(
      `${satir.top_barkod}, ${gun(satir.bitis)} günü ${isEmri.makine} makinesinde ${isEmri.operatorler || "operatör"} tarafından üretilen ${sayi(satir.top_metraji)} ${b}'lik toptur (iş emri ${isEmri.no}).`,
    );
    if (kullanilan.length) {
      cumleler.push(
        `Hammadde: ${tedarik.join(", ")}. Bu iş emrine ${kullanilan.map((x) => `${x.barkod} bobininden ${sayi(x.kullanilan)} ${x.birim}`).join(", ")} kullanıldı; toplam ${sayi(kg)} kg.`,
      );
    } else if (isEmri.bobinler.length) {
      cumleler.push(`Hammadde: ${tedarik.join(", ")}. İş emri bitmediği için kullanılan miktar henüz kesinleşmedi.`);
    }
    const digerTop = isEmri.ciktilar.filter((x) => x.tip === "FG_LOT" && x.barkod !== satir.top_barkod);
    const kr = isEmri.ciktilar.filter((x) => x.tip === "KR");
    if (digerTop.length || kr.length) {
      cumleler.push(
        `Aynı iş emrinden bu topun dışında ${[
          digerTop.length ? `${digerTop.map((x) => `${x.barkod} (${sayi(x.metre)} ${b})`).join(", ")} topu` : "",
          kr.length ? `üretim sırasında karantinaya ayrılan ${sayi(kr.reduce((t, x) => t + x.metre, 0))} ${b}` : "",
        ]
          .filter(Boolean)
          .join(" ve ")} çıktı.`,
      );
    }
  }
  const sevkM = Number(satir.sevk_edilen || 0);
  const parcalarYaprak = parcalar.filter((x) => x.durum !== "BOLUNDU");
  // Topun kendi dagilimi: karantinadan (KR) gelen parcalar topun metresine dahil degildir, ayri anlatilir
  const birimById = new Map(birimler.map((x) => [x.id, x]));
  const krKokenli = (x) => {
    for (let k = birimById.get(x.kaynak_birim_id), adim = 0; k && adim < 50; k = birimById.get(k.kaynak_birim_id), adim++) {
      if (k.tip === "KR") return true;
    }
    return false;
  };
  const topun = { sevk: 0, stok: 0, ayrilan: 0, bloke: 0, kalite: 0, karantina: 0, ret: 0 };
  for (const x of birimler) {
    if (x.tip !== "FG" || x.durum === "BOLUNDU" || krKokenli(x)) continue;
    const m = Number(x.miktar);
    if (x.durum === "SEVK_EDILDI") topun.sevk += m;
    else if (["RET", "HURDA"].includes(x.durum)) topun.ret += Number(x.ilk_miktar);
    else if (x.bloke && ["SERBEST", "DEPODA", "SIPARISE_AYRILDI"].includes(x.durum)) topun.bloke += m;
    else if (["SERBEST", "DEPODA"].includes(x.durum)) topun.stok += m;
    else if (x.durum === "SIPARISE_AYRILDI") topun.ayrilan += m;
    else if (x.durum === "KALITE_BEKLIYOR") topun.kalite += m;
    else if (x.durum === "KARANTINA") topun.karantina += m;
  }
  const bolumler = [];
  if (g.numune) bolumler.push(`${sayi(g.numune)} ${b} şahit numune`);
  if (topun.sevk) bolumler.push(`${sayi(topun.sevk)} ${b} müşteriye gitti`);
  if (topun.stok) bolumler.push(`${sayi(topun.stok)} ${b} depoda, kullanılabilir`);
  if (topun.ayrilan) bolumler.push(`${sayi(topun.ayrilan)} ${b} sevkiyata ayrıldı (henüz gönderilmedi)`);
  if (topun.bloke) bolumler.push(`${sayi(topun.bloke)} ${b} depoda ama bloke`);
  if (topun.kalite) bolumler.push(`${sayi(topun.kalite)} ${b} son kontrol bekliyor`);
  if (topun.karantina) bolumler.push(`${sayi(topun.karantina)} ${b} son kontrolde karantinaya alındı`);
  if (g.kesilmemis) bolumler.push(`${sayi(g.kesilmemis)} ${b} henüz kesilmedi`);
  const topHurda = yuvarla(Number(satir.kesim_firesi || 0) + Number(satir.top_hurda || 0) + topun.ret);
  if (topHurda) bolumler.push(`${sayi(topHurda)} ${b} hurda (${[
    Number(satir.kesim_firesi) ? `${sayi(satir.kesim_firesi)} ${b} kesim firesi` : "",
    topun.ret ? `${sayi(topun.ret)} ${b} reddedilen makara` : "",
    Number(satir.top_hurda) ? `${sayi(satir.top_hurda)} ${b} top hurdası` : "",
  ].filter(Boolean).join(", ")})`);
  const topToplam = yuvarla(Number(g.numune) + topun.sevk + topun.stok + topun.ayrilan + topun.bloke + topun.kalite + topun.karantina + Number(g.kesilmemis) + topHurda);
  cumleler.push(
    `${sayi(satir.top_metraji)} ${b}'lik toptan: ${bolumler.join(", ") || "henüz bir şey çıkmadı"}.` +
      (bolumler.length > 1 ? ` Kontrol: ${sayi(topToplam)} ${b}${Number(satir.olcum_fazlasi) ? ` (kesimde ${sayi(satir.olcum_fazlasi)} ${b} ölçüm fazlası dahil)` : ""}.` : ""),
  );
  if (Number(satir.karantina)) {
    const krParcalar = birimler.filter((x) => x.tip === "KR");
    const krDurum = krParcalar.map((k) => {
      const m = `${sayi(k.ilk_miktar)} ${b}`;
      const yeni = birimler.find((x) => x.kaynak_birim_id === k.id);
      if (k.durum === "OLUMLU") return `${m} olumlu → ${yeni ? yeni.barkod : "yeni numara"}`;
      if (k.durum === "SARTLI_KABUL") return `${m} şartlı kabul → ${yeni ? yeni.barkod : "yeni numara"}`;
      if (k.durum === "HURDA") return `${m} hurda`;
      if (k.durum === "YENIDEN_ISLEME") return `${m} yeniden işlemede`;
      return `${m} kalite kararı bekliyor`;
    });
    cumleler.push(
      `Ayrıca top bitmeden, makine başında ${sayi(satir.karantina)} ${b} karantinaya ayrıldı (topun ${sayi(satir.top_metraji)} ${b}'sine dahil değildir): ${krDurum.join("; ")}.`,
    );
  }
  for (const p of parcalarYaprak.filter((x) => /iade/.test(x.ozet || "") || x.bloke)) {
    cumleler.push(`${p.barkod} (${sayi(p.metre)} ${b}): ${p.ozet}.`);
  }

  return {
    tur: "URETIM_LOTU",
    lotNo: satir.no,
    topBarkod: satir.top_barkod,
    urun: `${satir.urun_kod} ${satir.urun_ad}`,
    birim: b,
    cumleler,
    denge: {
      ...denge,
      topMetraji: Number(satir.top_metraji),
      karantina: Number(satir.karantina || 0),
      sevkEdilen: sevkM,
      stokta: Number(satir.stokta || 0),
      sevkeAyrilan: Number(satir.sevke_ayrilan || 0),
      blokeMiktar: Number(satir.bloke_miktar || 0),
      kesimFiresi: Number(satir.kesim_firesi || 0),
      ret: Number(satir.ret || 0),
      topHurda: Number(satir.top_hurda || 0),
      karantinaHurda: Number(satir.karantina_hurda || 0),
    },
    isEmri,
    parcalar,
    karantina,
    numune,
  };
}

// Hammadde lotu ozeti: bobin bobin
async function hammaddeLotuOzeti(c, F, lotId) {
  const lot = await bir(
    c,
    `SELECT l.id, l.no, l.tedarikci_lot, l.durum, l.olusturma_zamani, m.kod AS malzeme_kod, m.ad AS malzeme_ad, t.unvan AS tedarikci
       FROM lot l JOIN malzeme m ON m.id = l.malzeme_id LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
      WHERE l.firma_id = $1 AND l.id = $2`,
    [F, lotId],
  );
  if (!lot) throw hatalar.bulunamadi("Hammadde lotu bulunamadi");
  const birimler = (
    await c.query(
      `SELECT b.id, b.barkod, b.tip, b.durum, b.bloke, b.ilk_miktar, b.miktar, b.olcu_birimi, b.yer, b.kaynak_birim_id, b.sira
         FROM birim b WHERE b.lot_id = $1 ORDER BY b.sira NULLS LAST, b.barkod`,
      [lot.id],
    )
  ).rows;
  const idler = birimler.map((x) => x.id);
  const kullanim = (
    await c.query(
      `SELECT g.birim_id, ie.no, mk.kod AS makine, g.baglama_miktari, g.tuketilen, g.cikarma_zamani
         FROM is_emri_baglama g JOIN is_emri ie ON ie.id = g.is_emri_id JOIN makine mk ON mk.id = ie.makine_id
        WHERE g.birim_id = ANY($1::uuid[]) ORDER BY g.baglama_zamani`,
      [idler],
    )
  ).rows;
  const hurda = (
    await c.query(
      "SELECT birim_id, sum(miktar) AS m FROM olay WHERE birim_id = ANY($1::uuid[]) AND tip = 'HURDA' GROUP BY birim_id",
      [idler],
    )
  ).rows;
  const yol = await yolculuklar(c, F, birimler);
  const bobinler = birimler.map((x) => {
    const k = kullanim.filter((y) => y.birim_id === x.id);
    const ayrilan = birimler.filter((y) => y.kaynak_birim_id === x.id);
    return {
      barkod: x.barkod,
      ilk: Number(x.ilk_miktar),
      kaynak: birimler.find((y) => y.id === x.kaynak_birim_id)?.barkod || null,
      ayrilan: ayrilan.map((y) => ({ barkod: y.barkod, miktar: Number(y.ilk_miktar) })),
      isler: k.map((y) => ({
        isEmriNo: y.no,
        makine: y.makine,
        takilan: Number(y.baglama_miktari),
        kullanilan: y.cikarma_zamani ? Number(y.tuketilen) : null,
      })),
      kullanilan: yuvarla(k.reduce((t, y) => t + (y.cikarma_zamani ? Number(y.tuketilen) : 0), 0)),
      hurda: Number(hurda.find((y) => y.birim_id === x.id)?.m || 0),
      kalan: Number(x.miktar),
      durum: x.durum,
      birim: x.olcu_birimi,
      ...yol[x.id],
    };
  });
  const asil = bobinler.filter((x) => !x.kaynak);
  const giris = yuvarla(asil.reduce((t, x) => t + x.ilk, 0));
  const kullanilan = yuvarla(bobinler.reduce((t, x) => t + x.kullanilan, 0));
  const hurdaT = yuvarla(bobinler.reduce((t, x) => t + x.hurda, 0));
  const kalan = yuvarla(bobinler.reduce((t, x) => t + x.kalan, 0));
  const isler = [...new Set(kullanim.map((y) => `${y.no} (${y.makine})`))];
  const br = birimler[0]?.olcu_birimi || "kg";
  const cumleler = [
    `${lot.tedarikci || "Tedarikçi"} firmasının ${lot.tedarikci_lot || "-"} partisinden ${gun(lot.olusturma_zamani)} günü ${asil.length} ambalaj, toplam ${sayi(giris)} ${br} ${lot.malzeme_ad} geldi (lot ${lot.no}).`,
    isler.length
      ? `Bu partiden ${isler.length} iş emrinde toplam ${sayi(kullanilan)} ${br} kullanıldı: ${isler.join(", ")}.`
      : "Bu partiden henüz üretimde kullanılan yok.",
    `${sayi(kalan)} ${br} hâlâ duruyor${hurdaT ? `, ${sayi(hurdaT)} ${br} hurdaya ayrıldı` : ""}. Kontrol: ${sayi(giris)} = ${sayi(kullanilan)} + ${sayi(kalan)}${hurdaT ? ` + ${sayi(hurdaT)}` : ""}.`,
  ];
  if (lot.durum === "KARANTINA") cumleler.push("Parti şu an karantinada: kalan ambalajlar kullanılamaz.");
  if (lot.durum === "RET") cumleler.push("Parti giriş kontrolünde reddedildi, üretimde kullanılmadı.");
  return {
    tur: "HAMMADDE_LOTU",
    lotNo: lot.no,
    tedarikci: lot.tedarikci,
    tedarikciLot: lot.tedarikci_lot,
    malzeme: `${lot.malzeme_kod} ${lot.malzeme_ad}`,
    durum: lot.durum,
    birim: br,
    giris,
    kullanilan,
    hurda: hurdaT,
    kalan,
    tutuyor: Math.abs(giris - kullanilan - hurdaT - kalan) < 0.001,
    cumleler,
    bobinler,
  };
}

// GET /izlenebilirlik/:barkod/ozet
async function ozet(c, F, ham) {
  const r = await cozumle(c, F, ham);
  const sonuc = { cozum: { tur: r.tur, no: r.no }, odak: null, uretimLotlari: [], hammaddeLotlari: [] };
  const lotIdleri = { fg: new Set(), rm: new Set() };
  if (r.tur === "BIRIM") {
    const b = await bir(c, "SELECT id, tip, lot_id, barkod, durum, bloke, ilk_miktar, miktar, olcu_birimi, yer, kaynak_birim_id FROM birim WHERE id = $1", [r.birim.id]);
    const y = (await yolculuklar(c, F, [b]))[b.id];
    sonuc.odak = { barkod: b.barkod, tip: b.tip, metre: Number(b.ilk_miktar), kalan: Number(b.miktar), birim: b.olcu_birimi, ...y };
    if (["FG_LOT", "FG", "KR", "NM"].includes(b.tip)) {
      const top = await bir(c, "SELECT id FROM birim WHERE lot_id = $1 AND tip = 'FG_LOT'", [b.lot_id]);
      if (top) lotIdleri.fg.add(top.id);
    }
    if (b.tip === "RM") lotIdleri.rm.add(b.lot_id);
  } else if (r.tur === "LOT") {
    if (r.lot.tip === "RM") lotIdleri.rm.add(r.lot.id);
    else {
      const top = await bir(c, "SELECT id FROM birim WHERE lot_id = $1 AND tip = 'FG_LOT'", [r.lot.id]);
      if (top) lotIdleri.fg.add(top.id);
    }
  } else if (r.tur === "IS_EMRI") {
    const x = await c.query("SELECT id FROM birim WHERE is_emri_id = $1 AND tip = 'FG_LOT' ORDER BY olusturma_zamani", [r.isEmri.id]);
    x.rows.forEach((y) => lotIdleri.fg.add(y.id));
  } else if (r.tur === "SEVKIYAT") {
    const x = await c.query(
      "SELECT DISTINCT t.id FROM sevkiyat_satiri ss JOIN birim b ON b.id = ss.birim_id JOIN birim t ON t.lot_id = b.lot_id AND t.tip = 'FG_LOT' WHERE ss.sevkiyat_id = $1",
      [r.sevkiyat.id],
    );
    x.rows.forEach((y) => lotIdleri.fg.add(y.id));
  }
  for (const id of lotIdleri.fg) {
    const u = await uretimLotuOzeti(c, F, id);
    sonuc.uretimLotlari.push(u);
    // Bu topun hammadde partileri de (bobin bobin) eklenir; ekranda "partinin tamami" diye ayri gosterilir
    for (const no of new Set((u.isEmri?.bobinler || []).map((x) => x.lotNo).filter(Boolean))) {
      const l = await bir(c, "SELECT id FROM lot WHERE firma_id = $1 AND no = $2", [F, no]);
      if (l) lotIdleri.rm.add(l.id);
    }
  }
  for (const id of lotIdleri.rm) sonuc.hammaddeLotlari.push(await hammaddeLotuOzeti(c, F, id));
  return sonuc;
}

module.exports = { ozet, yolculuklar, uretimLotuOzeti, hammaddeLotuOzeti, simdi, tarih };
