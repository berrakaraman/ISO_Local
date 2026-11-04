// Etiket uretimi (bolum 10.6). Cikti ZPL'dir: termal etiket yazicisinin dili.
// Barkodlari yazicinin kendi komutlari cizer (^BC = Code 128, ^BQ = QR).
// 100x50 mm etiket 300 dpi'da 1181x591 nokta; kucuk etiket 50x25 mm = 591x295 nokta.
const env = require("../config/env");

// ZPL'de ^ ve ~ ozel karakterdir; metinden temizlenir
const z = (v) => String(v ?? "").replace(/[\^~]/g, " ");

const tarihSaat = (d, tz = "Europe/Istanbul") =>
  d ? new Intl.DateTimeFormat("tr-TR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(d)) : "";
const tarih = (d, tz = "Europe/Istanbul") =>
  d ? new Intl.DateTimeFormat("tr-TR", { timeZone: tz, dateStyle: "short" }).format(new Date(d)) : "";

function buyukEtiket({ baslik, satirlar, barkod, kopyaNo, vurgulu }) {
  const qr = `${env.etiketUrl}/${barkod}`;
  let y = 150;
  const satirZpl = satirlar
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => {
      const out = `^FO40,${y}^A0N,34,34^FD${z(s)}^FS`;
      y += 44;
      return out;
    })
    .join("\n");
  return [
    "^XA",
    "^CI28", // UTF-8 (Turkce karakterler icin)
    "^PW1181^LL591",
    vurgulu
      ? `^FO0,0^GB1181,110,110^FS^FO40,22^A0N,72,72^FR^FD${z(baslik)}^FS` // siyah bant uzerine beyaz yazi
      : `^FO40,30^A0N,56,56^FD${z(baslik)}^FS`,
    `^FO40,${vurgulu ? 120 : 95}^A0N,30,30^FD${z(barkod)}${kopyaNo > 1 ? `  (Kopya ${kopyaNo})` : ""}^FS`,
    satirZpl,
    `^FO40,450^BY3,2,100^BCN,100,N,N,N^FD${z(barkod)}^FS`,
    `^FO880,140^BQN,2,7^FDQA,${z(qr)}^FS`,
    "^XZ",
  ].join("\n");
}

function kucukEtiket({ barkod, satir1, satir2, kopyaNo }) {
  return [
    "^XA",
    "^CI28",
    "^PW591^LL295",
    `^FO30,20^A0N,36,36^FD${z(barkod)}${kopyaNo > 1 ? ` K${kopyaNo}` : ""}^FS`,
    `^FO30,65^A0N,26,26^FD${z(satir1)}^FS`,
    `^FO30,98^A0N,26,26^FD${z(satir2)}^FS`,
    `^FO30,140^BY2,2,120^BCN,120,N,N,N^FD${z(barkod)}^FS`,
    "^XZ",
  ].join("\n");
}

// b: etiketVerisi() sorgusunun dondurdugu satir
function zplUret(b, kopyaNo = 1) {
  switch (b.tip) {
    case "RM":
      return buyukEtiket({
        baslik: `${b.malzeme_kod} ${b.malzeme_ad}`,
        barkod: b.barkod,
        kopyaNo,
        satirlar: [
          `Tedarikci: ${b.tedarikci || "-"}`,
          `Tedarikci lot: ${b.tedarikci_lot || "-"}`,
          `Miktar: ${b.ilk_miktar} ${b.olcu_birimi}`,
          `Kabul: ${tarih(b.olusturma_zamani)}`,
        ],
      });
    case "FG_LOT":
      return buyukEtiket({
        baslik: `${b.urun_kod} ${b.urun_ad}`,
        barkod: b.barkod,
        kopyaNo,
        satirlar: [
          `Makine: ${b.makine_kod || "-"}   Operator: ${b.operator_sicil || "-"}`,
          `Metraj: ${b.ilk_miktar} ${b.olcu_birimi}`,
          `Uretim: ${tarihSaat(b.olusturma_zamani)}`,
          `Is emri: ${b.is_emri_no || "-"}`,
        ],
      });
    case "FG":
      return buyukEtiket({
        baslik: `${b.urun_kod} ${b.urun_ad}`,
        barkod: b.barkod,
        kopyaNo,
        satirlar: [
          `Lot: ${b.lot_no}   Parca ${b.sira}${b.lot_parca_sayisi ? ` / ${b.lot_parca_sayisi}` : ""}`,
          `Boy: ${b.ilk_miktar} ${b.olcu_birimi}`,
          `Tarih: ${tarihSaat(b.olusturma_zamani)}`,
        ],
      });
    case "KR":
      return buyukEtiket({
        baslik: "KARANTINA",
        vurgulu: true,
        barkod: b.barkod,
        kopyaNo,
        satirlar: [
          `Neden: ${b.ek?.hataKodu || ""} ${b.ek?.hataAciklama || ""}`,
          `Miktar: ${b.ilk_miktar} ${b.olcu_birimi}`,
          `Is emri: ${b.is_emri_no || "-"}   Makine: ${b.makine_kod || "-"}`,
          `${tarihSaat(b.olusturma_zamani)}   Operator: ${b.operator_sicil || "-"}`,
        ],
      });
    case "NM":
      return kucukEtiket({
        barkod: b.barkod,
        kopyaNo,
        satir1: `${b.urun_kod} - Lot ${b.lot_no}`,
        satir2: `Imha: ${b.ek?.imhaTarihi || "-"}`,
      });
    default:
      return kucukEtiket({ barkod: b.barkod, kopyaNo, satir1: b.malzeme_ad || b.urun_ad || "", satir2: tarih(b.olusturma_zamani) });
  }
}

// Etiket icin gereken tum bilgiyi tek sorguda getirir
async function etiketVerisi(client, firmaId, birimId) {
  const r = await client.query(
    `SELECT b.*, l.no AS lot_no, l.tedarikci_lot,
            m.kod AS malzeme_kod, m.ad AS malzeme_ad,
            u.kod AS urun_kod, u.ad AS urun_ad,
            t.unvan AS tedarikci, mk.kod AS makine_kod, ie.no AS is_emri_no,
            k.sicil_no AS operator_sicil,
            (SELECT count(*) FROM birim x WHERE x.lot_id = b.lot_id AND x.tip = 'FG') AS lot_parca_sayisi
       FROM birim b
       LEFT JOIN lot l ON l.id = b.lot_id
       LEFT JOIN malzeme m ON m.id = b.malzeme_id
       LEFT JOIN urun u ON u.id = b.urun_id
       LEFT JOIN tedarikci t ON t.id = l.tedarikci_id
       LEFT JOIN makine mk ON mk.id = b.makine_id
       LEFT JOIN is_emri ie ON ie.id = b.is_emri_id
       LEFT JOIN kullanici k ON k.id = b.olusturan
      WHERE b.id = $1 AND b.firma_id = $2`,
    [birimId, firmaId],
  );
  return r.rows[0] || null;
}

// Etiket kaydi olusturur ve ZPL'i dondurur. Ilk baski kopya 1, sonrakiler 2, 3...
async function etiketBas(client, ctx, birimId, neden) {
  const veri = await etiketVerisi(client, ctx.firmaId, birimId);
  const r = await client.query(
    "SELECT COALESCE(max(kopya_no), 0) + 1 AS n FROM etiket_baskisi WHERE birim_id = $1",
    [birimId],
  );
  const kopyaNo = r.rows[0].n;
  await client.query(
    "INSERT INTO etiket_baskisi (firma_id, birim_id, kopya_no, neden, kullanici_id) VALUES ($1,$2,$3,$4,$5)",
    [ctx.firmaId, birimId, kopyaNo, neden || (kopyaNo === 1 ? "ILK_BASKI" : "YENIDEN_BASKI"), ctx.kullaniciId || null],
  );
  return {
    barkod: veri.barkod,
    tip: veri.tip,
    kopyaNo,
    qrAdresi: `${env.etiketUrl}/${veri.barkod}`,
    zpl: zplUret(veri, kopyaNo),
  };
}

module.exports = { etiketBas, etiketVerisi, zplUret };
