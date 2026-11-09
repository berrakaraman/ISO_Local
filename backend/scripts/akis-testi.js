// Uctan uca akis testi: mal kabulden sevkiyata ve soy agacina kadar tum sureci API uzerinden calistirir.
// Once API calisiyor olmali (npm run dev). Sonra baska bir terminalde:  npm run test:akis
// Bos bir veritabaninda calistirin: npm run db:reset
const API = process.env.API || "http://localhost:5001/api";
// Zamanin gecmesini taklit etmek icin (proses olcum araligi, numune saklama suresi) dogrudan veritabani
const { pool: db } = require("../src/config/db");
const sql = async (q, p) => (await db.query(q, p)).rows;
const r2 = (n) => Math.round(n * 100) / 100;

let gecen = 0;
let kalan = 0;
const tamam = (ad) => {
  gecen++;
  console.log(`  ✔ ${ad}`);
};
const hata = (ad, detay) => {
  kalan++;
  console.log(`  ✘ ${ad}\n      ${detay}`);
};

async function istek(token, yontem, yol, govde) {
  const r = await fetch(`${API}${yol}`, {
    method: yontem,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const veri = await r.json().catch(() => ({}));
  return { durum: r.status, veri };
}

// Basarili olmasi beklenen istek
async function ok(ad, token, yontem, yol, govde) {
  const r = await istek(token, yontem, yol, govde);
  if (r.durum >= 200 && r.durum < 300) tamam(ad);
  else hata(ad, `${r.durum} ${JSON.stringify(r.veri)}`);
  return r.veri;
}

// Engellenmesi beklenen istek
async function engel(ad, beklenenKod, token, yontem, yol, govde) {
  const r = await istek(token, yontem, yol, govde);
  if (r.durum >= 400 && r.veri?.hata?.kod === beklenenKod) tamam(`${ad} -> engellendi (${beklenenKod})`);
  else hata(ad, `Beklenen ${beklenenKod}, gelen ${r.durum} ${JSON.stringify(r.veri)}`);
}

function esit(ad, gercek, beklenen) {
  if (JSON.stringify(gercek) === JSON.stringify(beklenen)) tamam(`${ad} = ${JSON.stringify(gercek)}`);
  else hata(ad, `beklenen ${JSON.stringify(beklenen)}, gelen ${JSON.stringify(gercek)}`);
}

async function main() {
  console.log(`\nAPI: ${API}\n`);
  const s = await istek(null, "GET", "/saglik");
  if (s.durum !== 200) {
    console.log("API'ye ulasilamadi. Once 'npm run dev' ile API'yi baslatin.");
    process.exit(1);
  }
  let bugunUretilen = 0;

  console.log("1) Giris");
  const giris = async (kullaniciAdi, sifre) => (await ok(`${kullaniciAdi} giris`, null, "POST", "/auth/giris", { kullaniciAdi, sifre })).token;
  const depo = await giris("ayse", "Ayse.1234");
  const kalite = await giris("berra", "Berra.1234");
  const sef = await giris("mehmet", "Mehmet.1234");
  const denetci = await giris("denetci", "Denetci.1234");
  const op = await giris("ahmet", "Ahmet.1234");
  await engel("Yanlis sifre", "OTURUM_YOK", null, "POST", "/auth/giris", { kullaniciAdi: "depo", sifre: "yanlis" });
  await engel("Oturumsuz istek", "OTURUM_YOK", null, "GET", "/tanimlar");
  await engel("Denetci kayit degistirmeye calisir", "YETKI_YOK", denetci, "POST", "/hammadde/kabul", {});

  console.log("\n2) Tanimlar ve kisiler");
  const t = await ok("Tanimlar listesi", depo, "GET", "/tanimlar");
  const pet = t.malzemeler.find((x) => x.kod === "PET-025");
  const pa6 = t.malzemeler.find((x) => x.kod === "PA6-GR");
  const ted = t.tedarikciler[0];
  const urun = t.urunler.find((x) => x.kod === "KTS-PET-010");
  const spiral = t.urunler.find((x) => x.kod === "PS-PA6-012");
  const or3 = t.makineler.find((x) => x.kod === "OR03");
  const or1 = t.makineler.find((x) => x.kod === "OR01");
  const ex1 = t.makineler.find((x) => x.kod === "EX01");
  const musteri = t.musteriler[0];
  const karIlk = t.karakteristikler.filter((x) => x.urunId === urun.id && x.asama === "ILK_PARCA");
  const karMetraj = t.karakteristikler.filter((x) => x.urunId === urun.id && x.asama === "METRAJ");
  const karIlkPs = t.karakteristikler.filter((x) => x.urunId === spiral.id && x.asama === "ILK_PARCA");
  await engel("Turkce karakterli makine kodu", "GECERSIZ_ISTEK", kalite, "POST", "/tanimlar/makineler", { kod: "Ö04", ad: "x", tip: "ORGU" });
  const kisilerKalite = (await istek(kalite, "GET", "/onaylar/kisiler")).veri;
  const depoKisi = kisilerKalite.find((x) => x.roller.includes("DEPO"));
  const opKisi = kisilerKalite.find((x) => x.roller.includes("OPERATOR"));
  const sefKisi = kisilerKalite.find((x) => x.roller.includes("SEF"));
  const kaliteKisi = (await ok("Onaya atanabilecek kalite kisileri", depo, "GET", "/onaylar/kisiler?rol=KALITE")).find((x) => x.roller.includes("KALITE"));
  esit("Kisi kendini onay listesinde gormez", (await istek(depo, "GET", "/onaylar/kisiler")).veri.some((x) => x.id === depoKisi.id), false);
  esit("Is emri onaylayicilari yalnizca kalite/yonetim", (await istek(sef, "GET", "/onaylar/kisiler?tur=IS_EMRI")).veri.map((x) => x.adSoyad), [kaliteKisi.adSoyad]);
  const onayla = (ad, onayId) => ok(ad, kalite, "POST", `/onaylar/${onayId}/karar`, { durum: "ONAYLANDI" });

  console.log("\n3) Mal kabul ve giris kontrolu");
  await engel("Sorumlusuz mal kabul", "GECERSIZ_ISTEK", depo, "POST", "/hammadde/kabul", { malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "X", ambalajlar: [1] });
  await engel("Kendine onay atama", "GECERSIZ_ISTEK", depo, "POST", "/hammadde/kabul", { malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "X", ambalajlar: [1], atananId: depoKisi.id });
  const kabul = await ok("Mal kabul: 4 bobin x 25 kg", depo, "POST", "/hammadde/kabul", {
    malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-2610-77", coaVar: true, ambalajlar: [25, 25, 25, 25], depoYeri: "YR-D1-R01", atananId: kaliteKisi.id,
  });
  const lotNo = kabul.lot.no;
  const [b1, b2, b3, b4] = kabul.birimler.map((b) => b.barkod);
  esit("Etiket sayisi", kabul.etiketler.length, 4);
  esit("Ilk ambalaj barkodu lot + -01", b1, `${lotNo}-01`);
  esit("Giris kontrolu kaliteye gitti", kabul.onay.durum, "BEKLIYOR");
  if (kabul.etiketler[0].zpl.includes("^BC") && kabul.etiketler[0].zpl.includes("^BQ")) tamam("Etikette Code 128 ve QR var");
  else hata("Etiket ZPL", kabul.etiketler[0].zpl);

  await engel("Onaysiz is emri: sorumlu yok", "GECERSIZ_ISTEK", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 1250 });
  await engel("Is emrini kendine onaya atama", "GECERSIZ_ISTEK", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 1250, atananId: sefKisi.id });
  await engel("Is emrini operatore onaya atama", "GECERSIZ_ISTEK", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 1250, atananId: opKisi.id });
  const ie1 = await ok("Is emri ac (1250 m, OR03) + kaliteye onay", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 1250, atananId: kaliteKisi.id });
  const ie = ie1.isEmri.no;
  esit("Hammadde ihtiyaci 1250 m x 80 g/m = 100 kg", ie1.hammaddeIhtiyaci[0].ihtiyacKg, 100);
  await engel("Onaylanmamis is emri baslatilir", "ONAY_BEKLIYOR", op, "POST", `/is-emirleri/${ie}/baslat`);
  await engel("Operator is emrini onaylar", "YETKI_YOK", op, "POST", `/onaylar/${ie1.onay.id}/karar`, { durum: "ONAYLANDI" });
  await onayla("Kalite is emrini onaylar", ie1.onay.id);
  const bas1 = await ok("Is emrini baslat", op, "POST", `/is-emirleri/${ie}/baslat`);
  esit("Baslatinca ilk parca bekleniyor", bas1.durum, "ILK_PARCA_BEKLIYOR");
  await engel("Kontrol edilmemis bobin makineye", "ONAYSIZ_MALZEME", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: b1 });
  await engel("Depocu giris kontrol karari verir", "YETKI_YOK", depo, "POST", `/hammadde/lotlar/${lotNo}/kontrol`, { karar: "KABUL" });
  await ok("Kalite lotu kabul eder", kalite, "POST", `/hammadde/lotlar/${lotNo}/kontrol`, { karar: "KABUL" });
  const onayHm = (await istek(kalite, "GET", "/onaylar?tur=HAMMADDE")).veri.find((x) => x.kayitNo === lotNo);
  esit("Giris kontrolu onayi esitlendi", onayHm.durum, "ONAYLANDI");

  console.log("\n4) Cekis ve makineye yukleme");
  const cekis = await ok("Kismi cekis: 01'den 20 kg (bolunur)", depo, "POST", "/hammadde/cekis", { barkod: b1, miktar: 20, isEmriNo: ie });
  esit("Bolunen yeni barkod", cekis.birim.barkod, `${lotNo}-05`);
  esit("Ana ambalajda kalan 25 - 20 = 5 kg", cekis.kalanAnaAmbalaj, 5);
  await engel("Hattaki ambalaj tekrar cekilir", "ZATEN_HATTA", depo, "POST", "/hammadde/cekis", { barkod: cekis.birim.barkod, isEmriNo: ie });
  await ok("Bolunen 20 kg makineye", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: cekis.birim.barkod });
  await ok("QR adresiyle okutma: 02", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: `http://localhost:5173/b/${b2}` });
  await ok("03 depodan dogrudan okutulur", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: b3.toLowerCase() });
  await ok("04 de takilir", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: b4 });
  await engel("Ayni bobin ikinci kez", "ZATEN_BAGLI", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: b4 });

  console.log("\n5) Ilk parca ve karantina");
  await engel("Ilk parca onayi olmadan top bitir", "ILK_PARCA_YOK", op, "POST", `/is-emirleri/${ie}/top-bitir`, { metraj: 100 });
  const ret = await ok("Ilk parca: tolerans disi olcum", kalite, "POST", `/is-emirleri/${ie}/ilk-parca`, {
    olcumler: karIlk.map((k, i) => ({ karakteristikId: k.id, deger: i === 0 ? 11 : k.nominal })),
  });
  esit("Ilk parca onaylanmadi", ret.onaylandi, false);
  const ilk = await ok("Ilk parca: uygun olcum", kalite, "POST", `/is-emirleri/${ie}/ilk-parca`, {
    olcumler: karIlk.map((k) => ({ karakteristikId: k.id, deger: k.nominal })),
  });
  esit("Ilk parca onaylandi", ilk.onaylandi, true);
  const kr1 = await ok("Karantina: tel kopmasi 10 m", op, "POST", `/is-emirleri/${ie}/karantina`, { hataKodu: "H-05", miktar: 10 });
  await ok("Karantina: 12 m", op, "POST", `/is-emirleri/${ie}/karantina`, { hataKodu: "H-04", miktar: 12 });
  const kr3 = await ok("Karantina: 5 m", op, "POST", `/is-emirleri/${ie}/karantina`, { hataKodu: "H-07", miktar: 5 });
  esit("Kiosk karantina toplami 10 + 12 + 5", kr3.sayaclar.karantina, 27);
  if (kr1.etiket.zpl.includes("KARANTINA")) tamam("Karantina etiketi basildi");
  else hata("Karantina etiketi", kr1.etiket.zpl);

  console.log("\n6) Topu bitir, bitir, miktar dengesi");
  const top = await ok("Topu bitir: 1000 m", op, "POST", `/is-emirleri/${ie}/top-bitir`, { metraj: 1000 });
  bugunUretilen += 1000;
  const fgLot = top.lot.no;
  esit("Karantina parcalari lota baglandi", top.karantinaBaglanan, 3);
  await engel("Kesilmeden once numune alinmadan kesim", "NUMUNE_YOK", op, "POST", `/lotlar/${fgLot}/kesim`, {
    parcalar: [100], olcumler: karMetraj.map((k) => ({ karakteristikId: k.id, deger: k.nominal })),
  });
  await engel("Kalan miktar girilmeden bobin cikarma", "GECERSIZ_ISTEK", op, "POST", `/is-emirleri/${ie}/cikar`, { barkod: b4 });
  const bitir = await ok("Isi bitir (03'ten 5 kg iade)", op, "POST", `/is-emirleri/${ie}/bitir`, { iadeler: [{ barkod: b3, kalanMiktar: 5 }] });
  // Tuketilen: 20 + 25 + 20 + 25 = 90 kg -> 90000/80 = 1125 m beklenen; uretilen 1000 + 27 = 1027; fark 98 m = %8,71
  esit("Tuketilen kg (20+25+20+25)", bitir.denge.kalemler[0].tuketilenKg, 90);
  esit("Beklenen metraj 90000/80", bitir.denge.beklenenMetraj, 1125);
  esit("Uretilen = top + karantina", bitir.denge.uretilenToplam, 1027);
  esit("Fark % = 98/1125", bitir.denge.farkYuzde, 8.71);
  esit("Hedefe gore: 1027 - 1250 ve %82,16", [bitir.denge.hedefFarki, bitir.denge.hedefGerceklesmeYuzde], [-223, 82.16]);
  esit("Durum (tolerans %3 asildi)", bitir.durum, "TAMAMLANDI_FARK");
  await ok("Sef farki aciklar", sef, "POST", `/is-emirleri/${ie}/fark-aciklamasi`, { aciklama: "Bobin sonlarinda tel kopmasi, tartilmadan atildi" });
  await engel("Bitmis is emrine malzeme cekilir", "YANLIS_DURUM", depo, "POST", "/hammadde/cekis", { barkod: b1, isEmriNo: ie });

  console.log("\n7) Numune, kesim, son kontrol");
  const nm = await ok("Sahit numune (kesimden once, toptan 1 m)", kalite, "POST", `/lotlar/${fgLot}/numune`, { arsivYeri: "YR-NUM-01" });
  esit("Topta kalan 1000 - 1 = 999", nm.topKalan, 999);
  await engel("Ayni lottan ikinci numune", "ZATEN_VAR", kalite, "POST", `/lotlar/${fgLot}/numune`, {});
  const kesim = await ok("Kesim: 9 x 100 m + 95 m, 4 m fire", op, "POST", `/lotlar/${fgLot}/kesim`, {
    parcalar: [100, 100, 100, 100, 100, 100, 100, 100, 100, 95], kesimFiresi: 4,
    olcumler: karMetraj.map((k) => ({ karakteristikId: k.id, deger: k.nominal })),
  });
  esit("Parca sayisi", kesim.birimler.length, 10);
  esit("Ilk parca barkodu", kesim.birimler[0].barkod, `${fgLot}-01`);
  esit("Kesim hesabi: 999 = 995 + 4 fire", [kesim.hesap.topMetre, kesim.hesap.parcaToplam, kesim.hesap.fire, kesim.hesap.olcumFazlasi], [999, 995, 4, 0]);
  await ok("Son kontrol: lot serbest", kalite, "POST", "/kalite/son-kontrol", { lotNo: fgLot, karar: "SERBEST" });

  console.log("\n8) Karantina kararlari");
  const olumlu = await ok("10 m parca: olumlu", kalite, "POST", `/kalite/karantina/${kr1.karantina.barkod}/karar`, { karar: "OLUMLU" });
  esit("Olumlu parcaya yeni FG numarasi", olumlu.yeniBirim.barkod, `${fgLot}-11`);
  const bek = await ok("Kalite bekleyenler", kalite, "GET", "/kalite/bekleyenler");
  esit("Karar bekleyen karantina", bek.karantina.length, 2);
  await ok("12 m parca: hurda", kalite, "POST", `/kalite/karantina/${bek.karantina[0].barkod}/karar`, { karar: "HURDA", not: "Orgu sikligi duzeltilemez" });
  let L = (await ok("Lot dengesi", sef, "GET", `/lotlar/${fgLot}`)).lot;
  // Giris 1000 + 27 = 1027; dagilim: numune 1 + uygun 995+10 + karantina 5 + hurda (4 fire + 12) = 1027
  esit("Lot: toplam / numune / uygun / kar.bekleyen / hurda", [L.toplam, L.numune, L.uygun, L.karantinaBekleyen, L.hurdaToplam], [1027, 1, 1005, 5, 16]);
  esit("Lot dengesi tutuyor (fark 0)", [L.denge.tutuyor, L.denge.fark], [true, 0]);
  esit("Fire orani yalnizca hurda: 16/1027", L.fireYuzde, 1.56);

  console.log("\n9) Sevkiyat, onay ve bloke");
  await engel("Sorumlusuz sevkiyat", "GECERSIZ_ISTEK", depo, "POST", "/sevkiyat", { musteriId: musteri.id });
  const svA = await ok("Sevkiyat ac (kaliteye onay)", depo, "POST", "/sevkiyat", { musteriId: musteri.id, urunId: urun.id, siparisNo: "S-4587", atananId: kaliteKisi.id });
  const sv = svA.no;
  await engel("Bos sevkiyat onaylanir", "BOS_SEVKIYAT", kalite, "POST", `/onaylar/${svA.onay.id}/karar`, { durum: "ONAYLANDI" });
  await ok("Parca 01 okut", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[0].barkod });
  const ok2 = await ok("Parca 02 okut", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[1].barkod });
  esit("Sevkiyat toplami 100 + 100", ok2.toplam, 200);
  await engel("Ayni parca ikinci kez", "ZATEN_EKLI", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[1].barkod });
  await engel("Karantina etiketi sevkiyatta okutulur", "YANLIS_BIRIM", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kr3.karantina.barkod });
  const bl = await ok("Parca 03 bloke", kalite, "POST", "/kalite/bloke", { barkodlar: [kesim.birimler[2].barkod], neden: "Musteri sikayeti incelemesi" });
  await engel("Bloke parca sevkiyata", "BLOKE", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[2].barkod });
  await engel("Onaylanmamis sevkiyat sevk edilir", "ONAY_BEKLIYOR", depo, "POST", `/sevkiyat/${sv}/onayla`, { irsaliyeNo: "IRS-00024" });
  await onayla("Kalite yuku onaylar", svA.onay.id);
  const ek6 = await ok("Onaydan sonra parca 06 eklenir", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[5].barkod });
  esit("Yuk degisti -> onay sifirlandi", ek6.onaySifirlandi, true);
  await engel("Degisen yuk eski onayla sevk edilir", "ONAY_BEKLIYOR", depo, "POST", `/sevkiyat/${sv}/onayla`, { irsaliyeNo: "IRS-00024" });
  await onayla("Kalite yeni yuku onaylar", svA.onay.id);
  await ok("Sevkiyati sevk et", depo, "POST", `/sevkiyat/${sv}/onayla`, { irsaliyeNo: "IRS-00024" });
  await ok("Blokeyi kaldir", kalite, "POST", `/kalite/bloke/${bl.bloke.id}/kaldir`, { gerekce: "Inceleme tamamlandi, sorun yok" });
  await engel("Sevk edilmis parca hurdaya", "YANLIS_DURUM", kalite, "POST", "/kalite/hurda", { barkod: kesim.birimler[0].barkod, neden: "deneme" });
  await engel("Sevk edilmis parca reddedilir", "YANLIS_DURUM", kalite, "POST", "/kalite/son-kontrol", { barkodlar: [kesim.birimler[0].barkod], karar: "RET", not: "deneme" });

  console.log("\n10) Izlenebilirlik");
  const agac = await ok("Sevk edilen parcadan soy agaci", kalite, "GET", `/izlenebilirlik/${kesim.birimler[0].barkod}`);
  const turler = [...new Set(agac.dugumler.map((x) => x.tur))].sort();
  esit("Agactaki dugum turleri", turler, ["FG", "FG_LOT", "IS_EMRI", "RM", "SEVKIYAT"]);
  const musteriDugum = agac.dugumler.find((x) => x.tur === "SEVKIYAT");
  esit("Sevkiyat dugumundeki musteri", musteriDugum.musteri, musteri.unvan);
  const ileri = await ok("Hammadde lotundan ileri izleme", kalite, "GET", `/izlenebilirlik/${lotNo}?yon=ileri`);
  esit("Ileri izlemede musteri bulundu", ileri.dugumler.some((x) => x.tur === "SEVKIYAT"), true);
  if (agac.sureMs < 1000) tamam(`Soy agaci ${agac.sureMs} ms'de olustu (hedef < 60 sn)`);
  const zc = await ok("Zaman cizelgesi", kalite, "GET", `/izlenebilirlik/${b2}/olaylar`);
  const tipler = new Set(zc.olaylar.map((x) => x.tip));
  esit("Cizelgede kabul, tuketim, uretim, sevkiyat var", ["KABUL", "TUKETIM", "URETIM", "SEVKIYAT"].every((x) => tipler.has(x)), true);

  console.log("\n11) Hammadde bakiye karti");
  const bk = await ok("Bakiye karti", kalite, "GET", `/hammadde/lotlar/${lotNo}/bakiye`);
  esit("Giris kg", bk.bakiye.giris, 100);
  esit("Tuketilen kg", bk.bakiye.tuketilen, 90);
  esit("Depoda (iade 5 + kalan 5)", bk.bakiye.depodaKullanilabilir, 10);
  esit("Bakiye tutuyor", bk.bakiye.kontrol.tutuyor, true);
  const td = bk.bakiye.tuketilenDagilimi;
  // 80 g/m: uygun 1005 m = 80,4 kg; karantina 5 m = 0,4; hurda 16 m = 1,28; numune 1 m = 0,08; toplam 82,16; aciklanamayan 7,84
  esit("Dagilim kg: uygun / karantina / hurda / numune / aciklanamayan", [td.uygunUrun, td.karantinada, td.hurda, td.numune, td.aciklanamayan], [80.4, 0.4, 1.28, 0.08, 7.84]);
  esit("Dagilim toplami = tuketilen", Math.round((td.uygunUrun + td.karantinada + td.hurda + td.kesimBekleyen + td.numune + td.olcumFarki + td.aciklanamayan) * 1000) / 1000, 90);
  esit("Karantina kararlari", bk.karantinaKararlari.map((x) => x.durum), ["OLUMLU", "HURDA", "KARAR_BEKLIYOR"]);

  console.log("\n12) Onay akisi, iptal ve silmeme kurali");
  await engel("Operatore hammadde onayi atanir", "GECERSIZ_ISTEK", depo, "POST", "/hammadde/kabul", {
    malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-X", ambalajlar: [10], atananId: opKisi.id,
  });
  const k2 = await ok("Mal kabul + kaliteye onay gorevi", depo, "POST", "/hammadde/kabul", {
    malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-2610-90", coaVar: true, ambalajlar: [25, 25], depoYeri: "YR-D1-R02", atananId: kaliteKisi.id,
  });
  esit("Onay durumu", k2.onay.durum, "BEKLIYOR");
  const gorev = await ok("Gorevlerim (kalite)", kalite, "GET", "/onaylar?benim=1&durum=BEKLIYOR,ASKIDA");
  esit("Gorev listede", gorev.some((x) => x.kayitNo === k2.lot.no), true);
  await engel("Kaydi giren kisi kendi kaydina karar verir", "YETKI_YOK", depo, "POST", `/onaylar/${k2.onay.id}/karar`, { durum: "ONAYLANDI" });
  await engel("Gerekcesiz red", "GECERSIZ_ISTEK", kalite, "POST", `/onaylar/${k2.onay.id}/karar`, { durum: "REDDEDILDI" });
  await ok("Askiya al (CoA eksik)", kalite, "POST", `/onaylar/${k2.onay.id}/karar`, { durum: "ASKIDA", not: "CoA belgesi bekleniyor" });
  let lot2 = (await istek(kalite, "GET", `/hammadde/lotlar/${k2.lot.no}`)).veri.lot;
  esit("Askida -> lot karantinada", lot2.durum, "KARANTINA");
  const onaylandi = await ok("Onayla", kalite, "POST", `/onaylar/${k2.onay.id}/karar`, { durum: "ONAYLANDI", not: "CoA geldi" });
  esit("Karar veren", onaylandi.kararVerenAd, kaliteKisi.adSoyad);
  lot2 = (await istek(kalite, "GET", `/hammadde/lotlar/${k2.lot.no}`)).veri.lot;
  esit("Onaylandi -> lot kabul", lot2.durum, "KABUL");
  await engel("Ikinci karar", "KARAR_VERILMIS", kalite, "POST", `/onaylar/${k2.onay.id}/karar`, { durum: "REDDEDILDI", not: "x" });
  const liste = await ok("F-01 listesi", depo, "GET", "/hammadde/lotlar");
  const satir = liste.find((x) => x.no === k2.lot.no);
  esit("Listede kaydeden ve karar veren", [satir.olusturanAd, satir.onayKararVerenAd, satir.depoYeri], [depoKisi.adSoyad, kaliteKisi.adSoyad, "YR-D1-R02"]);
  const gecmis = await ok("Kayit gecmisi", depo, "GET", `/hammadde/lotlar/${k2.lot.no}/gecmis`);
  esit("Gecmiste isimler var", [...new Set(gecmis.map((x) => x.kim))].sort(), [depoKisi.adSoyad, kaliteKisi.adSoyad].sort());

  await engel("Kullanilmis lot iptal", "KULLANILMIS", depo, "POST", `/hammadde/lotlar/${lotNo}/iptal`, { gerekce: "Yanlis girildi" });
  await engel("Kisa gerekceyle iptal", "GECERSIZ_ISTEK", depo, "POST", `/hammadde/lotlar/${k2.lot.no}/iptal`, { gerekce: "x" });
  await ok("Lot iptal (silinmez)", depo, "POST", `/hammadde/lotlar/${k2.lot.no}/iptal`, { gerekce: "Irsaliye yanlis firmaya aitmis" });
  const iptalSatir = (await istek(depo, "GET", "/hammadde/lotlar")).veri.find((x) => x.no === k2.lot.no);
  esit("Iptal kaydi listede duruyor", [iptalSatir.durum, iptalSatir.iptalEdenAd, iptalSatir.kalanMiktar], ["IPTAL", depoKisi.adSoyad, 0]);
  esit("Iptal edilen ambalaj barkodu hala bulunur", (await istek(depo, "GET", `/barkod/${k2.lot.no}-01`)).durum, 200);
  await engel("Iptal edilmis lota karar", "IPTAL_EDILMIS", kalite, "POST", `/hammadde/lotlar/${k2.lot.no}/kontrol`, { karar: "KABUL" });
  const bk2 = await ok("Iptal edilen lotun bakiyesi", kalite, "GET", `/hammadde/lotlar/${k2.lot.no}/bakiye`);
  esit("Iptal lot: giris 50 = iptal 50, tutuyor", [bk2.bakiye.giris, bk2.bakiye.iptal, bk2.bakiye.kontrol.tutuyor], [50, 50, true]);

  const sv2 = (await ok("Ikinci sevkiyat", depo, "POST", "/sevkiyat", { musteriId: musteri.id, urunId: urun.id, atananId: kaliteKisi.id })).no;
  const p4 = kesim.birimler[3].barkod;
  await ok("Parca 04 okut", depo, "POST", `/sevkiyat/${sv2}/okut`, { barkod: p4 });
  await ok("Parca 04 cikar (silinmez, isaretlenir)", depo, "POST", `/sevkiyat/${sv2}/cikar`, { barkod: p4 });
  await ok("Parca 04 tekrar okutulur", depo, "POST", `/sevkiyat/${sv2}/okut`, { barkod: p4 });

  console.log("\n13) Form listeleri, onay ve iptal (F-02 ... F-06)");
  const lotlar = await ok("F-03 uretim lotlari", sef, "GET", "/lotlar");
  L = lotlar.find((x) => x.no === fgLot);
  esit("F-03 top / uygun / karantina / bekleyen / kar.hurda / kesim firesi / numune", [L.topMetraji, L.uygun, L.karantina, L.karantinaBekleyen, L.karantinaHurda, L.kesimFiresi, L.numune], [1000, 1005, 27, 5, 12, 4, 1]);
  esit("F-03 denge", L.denge.tutuyor, true);
  esit("F-03 hammadde lotu ve operator", [L.hammaddeLotlari, L.operatorAd], [lotNo, "Ahmet Yılmaz"]);
  const lotDetay = await ok("F-03 lot ayrintisi", sef, "GET", `/lotlar/${fgLot}`);
  esit("Lot parcalarinda numune var", lotDetay.birimler.some((x) => x.tip === "NM"), true);
  const krListe = await ok("F-04 karantina listesi", kalite, "GET", "/kalite/karantinalar");
  const krOlumlu = krListe.find((x) => x.barkod === kr1.karantina.barkod);
  esit("F-04 karar, karar veren, yeni barkod", [krOlumlu.durum, krOlumlu.kararVerenAd, krOlumlu.yeniBarkod], ["OLUMLU", "Berra Karaman", `${fgLot}-11`]);
  const kontroller = await ok("F-05 kontrol listesi", kalite, "GET", "/kalite/kontroller");
  esit("F-05 ilk parca, metraj ve son kontrol var", ["ILK_PARCA", "METRAJ", "SON_KONTROL"].every((x) => kontroller.some((k) => k.tur === x)), true);

  const ie2 = await ok("F-02 is emri + onaya gonder", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 500, atananId: kaliteKisi.id });
  esit("Is emri onayi", ie2.onay.durum, "BEKLIYOR");
  await engel("Onaysiz is emri baslatilir", "ONAY_BEKLIYOR", sef, "POST", `/is-emirleri/${ie2.isEmri.no}/baslat`);
  await engel("Kisa gerekceyle is emri iptali", "GECERSIZ_ISTEK", sef, "POST", `/is-emirleri/${ie2.isEmri.no}/iptal`, { gerekce: "x" });
  await ok("Is emri iptal (silinmez)", sef, "POST", `/is-emirleri/${ie2.isEmri.no}/iptal`, { gerekce: "Musteri siparisi erteledi" });
  await engel("Iptal edilmis is emri onaylanir", "YANLIS_DURUM", kalite, "POST", `/onaylar/${ie2.onay.id}/karar`, { durum: "ONAYLANDI" });
  const ieListe = await ok("F-02 listesi", sef, "GET", "/is-emirleri");
  const ie2Satir = ieListe.find((x) => x.no === ie2.isEmri.no);
  esit("F-02 iptal eden ve kaydeden", [ie2Satir.durum, ie2Satir.iptalEdenAd, ie2Satir.olusturanAd], ["IPTAL", sefKisi.adSoyad, sefKisi.adSoyad]);
  const ieGecmis = await ok("F-02 kayit gecmisi", sef, "GET", `/gecmis/IS_EMRI/${ie2.isEmri.no}`);
  esit("Is emri gecmisinde kayit, onay, iptal", ["EKLEME", "IPTAL"].every((x) => ieGecmis.some((g) => g.islem === x)), true);

  const sv3 = await ok("F-06 sevkiyat + onaya gonder", depo, "POST", "/sevkiyat", { musteriId: musteri.id, atananId: kaliteKisi.id });
  await ok("Parca 05 okut", depo, "POST", `/sevkiyat/${sv3.no}/okut`, { barkod: kesim.birimler[4].barkod });
  await engel("Onaysiz sevkiyat sevk edilir", "ONAY_BEKLIYOR", depo, "POST", `/sevkiyat/${sv3.no}/onayla`, { irsaliyeNo: "IRS-1" });
  await onayla("Sevkiyat onayi (kalite)", sv3.onay.id);
  await ok("Onayli sevkiyat sevk edilir", depo, "POST", `/sevkiyat/${sv3.no}/onayla`, { irsaliyeNo: "IRS-00025" });
  await ok("Hazirlanan sevkiyat iptal", depo, "POST", `/sevkiyat/${sv2}/iptal`, { gerekce: "Musteri teslimati iptal etti" });
  const svListe = await ok("F-06 listesi", depo, "GET", "/sevkiyat");
  const sv3Satir = svListe.find((x) => x.no === sv3.no);
  const sv2Satir = svListe.find((x) => x.no === sv2);
  esit("F-06 hazirlayan / sevk eden / onaylayan / lot", [sv3Satir.olusturanAd, sv3Satir.onaylayanAd, sv3Satir.onayKararVerenAd, sv3Satir.lotlar], [depoKisi.adSoyad, depoKisi.adSoyad, kaliteKisi.adSoyad, fgLot]);
  esit("Iptal edilen sevkiyat duruyor", [sv2Satir.durum, sv2Satir.iptalEdenAd], ["IPTAL", depoKisi.adSoyad]);
  esit("Iptalle parca 04 serbest", (await istek(depo, "GET", `/barkod/${kesim.birimler[3].barkod}`)).veri.birim.durum, "SERBEST");
  for (const [tur, no] of [["URETIM_LOT", fgLot], ["KARANTINA", kr1.karantina.barkod], ["SEVKIYAT", sv3.no]]) {
    const g = await ok(`${tur} gecmisi`, kalite, "GET", `/gecmis/${tur}/${no}`);
    if (!g.length || g.some((x) => !x.kim)) hata(`${tur} gecmisinde isim`, JSON.stringify(g.slice(0, 2)));
  }

  console.log("\n14) Ozel durumlar ve hesap kontrolleri");
  // Urun karti eksikse is emri acilamaz
  const eksikUrun = await ok("Recetesiz urun tanimla", kalite, "POST", "/tanimlar/urunler", { kod: "TST-EKSIK", ad: "Recetesiz deneme urunu" });
  await engel("Recetesiz / kontrol plansiz urune is emri", "URUN_KARTI_EKSIK", sef, "POST", "/is-emirleri", { urunId: eksikUrun.id, makineId: or1.id, hedefMiktar: 10, atananId: kaliteKisi.id });
  await engel("Alt sinir ust sinirdan buyuk karakteristik", "GECERSIZ_ISTEK", kalite, "POST", "/tanimlar/karakteristikler", { urunId: urun.id, asama: "PROSES", ad: "x", altSinir: 5, ustSinir: 3 });

  // Ikinci is emri: 3 x 10 kg PET ile 3 top
  const k3 = await ok("Mal kabul: 3 x 10 kg", depo, "POST", "/hammadde/kabul", { malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-2611-01", ambalajlar: [10, 10, 10], atananId: kaliteKisi.id });
  await ok("Kalite kabul", kalite, "POST", `/hammadde/lotlar/${k3.lot.no}/kontrol`, { karar: "KABUL" });
  const ie3 = await ok("Is emri 3 (OR01, 300 m)", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or1.id, hedefMiktar: 300, atananId: kaliteKisi.id });
  const ie3No = ie3.isEmri.no;
  await onayla("Is emri 3 onayi", ie3.onay.id);
  await ok("Is emri 3 baslat", op, "POST", `/is-emirleri/${ie3No}/baslat`);
  for (const b of k3.birimler) await ok(`${b.barkod} makineye`, op, "POST", `/is-emirleri/${ie3No}/bagla`, { barkod: b.barkod });
  await ok("Is emri 3 ilk parca", kalite, "POST", `/is-emirleri/${ie3No}/ilk-parca`, { olcumler: karIlk.map((k) => ({ karakteristikId: k.id, deger: k.nominal })) });

  // a) Hammadde uretim sirasinda karantinaya alinirsa top bitirilemez
  const hk = await ok("Kalite hammaddeyi karantinaya alir", kalite, "POST", `/hammadde/lotlar/${k3.lot.no}/kontrol`, { karar: "KARANTINA", not: "Tedarikci uyarisi" });
  esit("Makinede bagli ambalajlar bildirildi", hk.makinedeBagliAmbalajlar.length, 3);
  await engel("Karantinadaki hammaddeyle top bitir", "HAMMADDE_ONAYSIZ", op, "POST", `/is-emirleri/${ie3No}/top-bitir`, { metraj: 100 });
  await ok("Kalite hammaddeyi tekrar kabul eder", kalite, "POST", `/hammadde/lotlar/${k3.lot.no}/kontrol`, { karar: "KABUL" });

  // b) Metraj tolerans disi -> top karantina -> sartli kabul -> olcum fazlasiyla kesim
  const tA = (await ok("Top A: 100 m", op, "POST", `/is-emirleri/${ie3No}/top-bitir`, { metraj: 100 })).lot.no;
  bugunUretilen += 100;
  await ok("Top A numune", op, "POST", `/lotlar/${tA}/numune`, {});
  const kotu = karMetraj.map((k) => ({ karakteristikId: k.id, deger: Number(k.ustSinir) + 1 }));
  const iyi = karMetraj.map((k) => ({ karakteristikId: k.id, deger: k.nominal }));
  const kA = await istek(op, "POST", `/lotlar/${tA}/kesim`, { parcalar: [50, 49], olcumler: kotu });
  esit("Tolerans disi metraj: kesim yok, top karantinada", [kA.durum, kA.veri.engellendi], [409, true]);
  let LA = (await istek(sef, "GET", `/lotlar/${tA}`)).veri.lot;
  esit("Karantinadaki top: kesilmemis 99 + numune 1 = 100", [LA.kesilmemis, LA.numune, LA.denge.tutuyor], [99, 1, true]);
  await engel("Karantinadaki top kesilir", "YANLIS_DURUM", op, "POST", `/lotlar/${tA}/kesim`, { parcalar: [50], olcumler: iyi });
  esit("Karantinadaki top kalite bekleyenlerde", (await istek(kalite, "GET", "/kalite/bekleyenler")).veri.karantina.some((x) => x.barkod === tA), true);
  await engel("Top icin yeniden isleme karari", "GECERSIZ_KARAR", kalite, "POST", `/kalite/karantina/${tA}/karar`, { karar: "YENIDEN_ISLEME" });
  await ok("Top sartli kabul", kalite, "POST", `/kalite/karantina/${tA}/karar`, { karar: "SARTLI_KABUL", not: "Musteri onayi ile kabul" });
  await engel("Parcalar topu %1'den fazla asar (100 > 99 + 0,99)", "KESIM_FAZLA", op, "POST", `/lotlar/${tA}/kesim`, { parcalar: [50, 50], olcumler: kotu });
  const kA2 = await ok("Sartli kabul: tolerans disi olcumle kesim 50 + 49,5", op, "POST", `/lotlar/${tA}/kesim`, { parcalar: [50, 49.5], olcumler: kotu });
  esit("Olcum fazlasi 0,5 m, fire 0", [kA2.hesap.olcumFazlasi, kA2.hesap.fire], [0.5, 0]);
  LA = (await istek(sef, "GET", `/lotlar/${tA}`)).veri.lot;
  esit("Top A dengesi: 100 + 0,5 = 1 + 99,5", [LA.denge.toplam, LA.denge.olcumFazlasi, LA.denge.dagilimToplam, LA.denge.tutuyor], [100, 0.5, 100.5, true]);

  // c) Son kontrolde karantina -> sonra ret; yeniden kesim; kismi hurda
  const [pA1, pA2] = kA2.birimler.map((x) => x.barkod);
  await ok("Parca A1 son kontrolde karantinaya", kalite, "POST", "/kalite/son-kontrol", { barkodlar: [pA1], karar: "KARANTINA", not: "Yuzey supheli" });
  LA = (await istek(sef, "GET", `/lotlar/${tA}`)).veri.lot;
  esit("Karantinadaki parca dengede gorunur (50)", [LA.fgKarantina, LA.denge.tutuyor], [50, true]);
  await ok("Karantinadaki parca reddedilir", kalite, "POST", "/kalite/son-kontrol", { barkodlar: [pA1], karar: "RET", not: "Yuzey hatasi dogrulandi" });
  await ok("Parca A2 serbest", kalite, "POST", "/kalite/son-kontrol", { barkodlar: [pA2], karar: "SERBEST" });
  const bol = await ok("A2 (49,5) yeniden kesim: 20 + 29", depo, "POST", `/lotlar/birim/${pA2}/bol`, { parcalar: [20, 29] });
  await ok("20 m parcadan 5 m hurda", kalite, "POST", "/kalite/hurda", { barkod: bol.yeniler[0].barkod, miktar: 5, neden: "Uc kismi ezik" });
  LA = (await istek(sef, "GET", `/lotlar/${tA}`)).veri.lot;
  // uygun 15 + 29 = 44; hurda: red 50 + bolme firesi 0,5 + 5 = 55,5; numune 1 -> 100,5
  esit("Top A: uygun 44, hurda 55,5, numune 1", [LA.uygun, LA.hurdaToplam, LA.numune], [44, 55.5, 1]);
  esit("Top A dengesi tutuyor", [LA.denge.dagilimToplam, LA.denge.tutuyor], [100.5, true]);

  // d) Top tamamen hurda
  const tB = (await ok("Top B: 150 m", op, "POST", `/is-emirleri/${ie3No}/top-bitir`, { metraj: 150 })).lot.no;
  bugunUretilen += 150;
  await ok("Top B numune", op, "POST", `/lotlar/${tB}/numune`, {});
  await istek(op, "POST", `/lotlar/${tB}/kesim`, { parcalar: [100], olcumler: kotu });
  await ok("Top B hurda karari", kalite, "POST", `/kalite/karantina/${tB}/karar`, { karar: "HURDA", not: "Cap tutmuyor" });
  const LB = (await istek(sef, "GET", `/lotlar/${tB}`)).veri.lot;
  esit("Top B: hurda 149 + numune 1 = 150, lot HURDA", [LB.topHurda, LB.numune, LB.denge.tutuyor, LB.durum], [149, 1, true, "HURDA"]);

  // e) Fire tolerans ustu ise aciklama zorunlu
  const tC = (await ok("Top C: 100 m", op, "POST", `/is-emirleri/${ie3No}/top-bitir`, { metraj: 100 })).lot.no;
  bugunUretilen += 100;
  await ok("Top C numune", op, "POST", `/lotlar/${tC}/numune`, {});
  await engel("19 m kayip aciklamasiz", "GECERSIZ_ISTEK", op, "POST", `/lotlar/${tC}/kesim`, { parcalar: [40, 40], olcumler: iyi });
  const kC = await ok("Aciklamayla kesim: 40 + 40, fire 19", op, "POST", `/lotlar/${tC}/kesim`, { parcalar: [40, 40], olcumler: iyi, aciklama: "Top sonu bozuk cikti" });
  esit("Fire hesaplanir: 99 - 80 = 19", kC.hesap.fire, 19);

  // f) Is emri 3 dengesi: 3 ambalaj, 03'ten 2 kg iade -> 28 kg -> 28000/80 = 350 m = 100 + 150 + 100
  const b3son = k3.birimler[2].barkod;
  const bitir3 = await ok("Is emri 3 bitir (03'ten 2 kg iade)", op, "POST", `/is-emirleri/${ie3No}/bitir`, { iadeler: [{ barkod: b3son, kalanMiktar: 2 }] });
  esit("Is emri 3: tuketilen 28, beklenen 350, uretilen 350, fark 0", [bitir3.denge.kalemler[0].tuketilenKg, bitir3.denge.beklenenMetraj, bitir3.denge.uretilenToplam, bitir3.denge.fark], [28, 350, 350, 0]);
  esit("Is emri 3 tamamlandi (fark yok)", bitir3.durum, "TAMAMLANDI");

  // g) Recetedeki bir malzeme hic kullanilmazsa denge bunu yakalar; onaylanan is emri degisirse onay sifirlanir
  const k4 = await ok("PA6 kabul: 20 kg", depo, "POST", "/hammadde/kabul", { malzemeId: pa6.id, tedarikciId: ted.id, tedarikciLot: "AP-1", ambalajlar: [20], atananId: kaliteKisi.id });
  await ok("PA6 kabul karari", kalite, "POST", `/hammadde/lotlar/${k4.lot.no}/kontrol`, { karar: "KABUL" });
  const ie4 = await ok("Is emri 4 (EX01, spiral 100 m)", sef, "POST", "/is-emirleri", { urunId: spiral.id, makineId: ex1.id, hedefMiktar: 100, atananId: kaliteKisi.id });
  await onayla("Is emri 4 onayi", ie4.onay.id);
  const pt = await ok("Onaydan sonra hedef 120'ye cikar", sef, "PATCH", `/is-emirleri/${ie4.isEmri.no}`, { hedefMiktar: 120 });
  esit("Onay sifirlandi", pt.onaySifirlandi, true);
  await engel("Degisen is emri eski onayla baslar", "ONAY_BEKLIYOR", op, "POST", `/is-emirleri/${ie4.isEmri.no}/baslat`);
  await onayla("Is emri 4 yeniden onaylanir", ie4.onay.id);
  await ok("Is emri 4 baslat", op, "POST", `/is-emirleri/${ie4.isEmri.no}/baslat`);
  await ok("PA6 makineye", op, "POST", `/is-emirleri/${ie4.isEmri.no}/bagla`, { barkod: k4.birimler[0].barkod });
  await ok("Spiral ilk parca", kalite, "POST", `/is-emirleri/${ie4.isEmri.no}/ilk-parca`, { olcumler: karIlkPs.map((k) => ({ karakteristikId: k.id, deger: k.nominal })) });
  await ok("Spiral top 100 m", op, "POST", `/is-emirleri/${ie4.isEmri.no}/top-bitir`, { metraj: 100 });
  bugunUretilen += 100;
  const bitir4 = await ok("Is emri 4 bitir (masterbatch hic kullanilmadi)", op, "POST", `/is-emirleri/${ie4.isEmri.no}/bitir`, { iadeler: [{ barkod: k4.birimler[0].barkod, kalanMiktar: 15 }] });
  // PA6: 5 kg -> 5000/45 = 111,11 m; MB: 0 kg -> 0 m; beklenen = 0 -> fark yakalanir
  esit("Eksik malzeme tespit edildi", bitir4.denge.eksikMalzeme, ["MB-SYH"]);
  esit("PA6 beklenen 5000/45 = 111,11 m; toplam beklenen 0", [bitir4.denge.kalemler.find((x) => x.malzeme === "PA6-GR").beklenenMetraj, bitir4.denge.beklenenMetraj], [111.11, 0]);
  esit("Gereken masterbatch 100 m x 1 g = 0,1 kg", bitir4.denge.kalemler.find((x) => x.malzeme === "MB-SYH").gerekenKg, 0.1);
  esit("Is emri 4 fark acik", bitir4.durum, "TAMAMLANDI_FARK");

  // h) Tum lotlarin ve hammadde lotlarinin dengesi
  const tumLotlar = (await istek(sef, "GET", "/lotlar")).veri;
  const bozuk = tumLotlar.filter((x) => !x.denge.tutuyor).map((x) => `${x.no} fark ${x.denge.fark}`);
  esit(`Tum uretim lotlarinda denge tutuyor (${tumLotlar.length} lot)`, bozuk, []);
  for (const no of [lotNo, k3.lot.no, k4.lot.no]) {
    const b = (await istek(kalite, "GET", `/hammadde/lotlar/${no}/bakiye`)).veri.bakiye;
    esit(`${no} bakiyesi tutuyor`, [b.kontrol.tutuyor, b.kontrol.fark], [true, 0]);
  }
  const b3k = (await istek(kalite, "GET", `/hammadde/lotlar/${k3.lot.no}/bakiye`)).veri.bakiye;
  esit("Lot 3: giris 30 = tuketilen 28 + depoda 2", [b3k.giris, b3k.tuketilen, b3k.depodaKullanilabilir], [30, 28, 2]);

  console.log("\n16) Proses kontrolu, duraklatma, bakim / ariza kaydi");
  const karIlkAl = (deger = null) => karIlk.map((k) => ({ karakteristikId: k.id, deger: deger ?? k.nominal }));
  const karProses = t.karakteristikler.filter((x) => x.urunId === urun.id && x.asama === "PROSES");
  esit("KTS proses planinda 2 karakteristik", karProses.length, 2);
  const prosesUygun = (alet) => ({ olcumler: karProses.map((k) => ({ karakteristikId: k.id, deger: k.nominal })), aletKod: alet });
  const k5 = await ok("PET kabul: 2 x 10 kg", depo, "POST", "/hammadde/kabul", { malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-2611-05", ambalajlar: [10, 10], atananId: kaliteKisi.id });
  await ok("PET kabul karari", kalite, "POST", `/hammadde/lotlar/${k5.lot.no}/kontrol`, { karar: "KABUL" });
  const bugunStr = (await sql("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS g"))[0].g;
  const or2 = t.makineler.find((x) => x.kod === "OR02");
  const or5 = t.makineler.find((x) => x.kod === "OR05");
  const ie5A = await ok("Is emri 5 (OR02, 158 m, plan bugun)", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or2.id, hedefMiktar: 158, planlananTarih: bugunStr, atananId: kaliteKisi.id });
  const ie5 = ie5A.isEmri.no;
  await onayla("Is emri 5 onayi", ie5A.onay.id);
  esit("Ilk baslatmada ilk parca beklenir", (await ok("Is emri 5 baslat", op, "POST", `/is-emirleri/${ie5}/baslat`)).durum, "ILK_PARCA_BEKLIYOR");
  for (const b of k5.birimler) await ok(`${b.barkod} makineye`, op, "POST", `/is-emirleri/${ie5}/bagla`, { barkod: b.barkod });
  await engel("Kalibrasyonu gecmis kumpasla ilk parca", "KALIBRASYON_GECMIS", kalite, "POST", `/is-emirleri/${ie5}/ilk-parca`, { olcumler: karIlkAl(), aletKod: "KMP-02" });
  await engel("Tanimsiz aletle ilk parca", "GECERSIZ_ISTEK", kalite, "POST", `/is-emirleri/${ie5}/ilk-parca`, { olcumler: karIlkAl(), aletKod: "YOK-99" });
  const ilk5 = await ok("Ilk parca (KMP-01 ile)", kalite, "POST", `/is-emirleri/${ie5}/ilk-parca`, { olcumler: karIlkAl(), aletKod: "KMP-01" });
  esit("Ilk parca ilk denemede onaylandi", [ilk5.onaylandi, ilk5.deneme], [true, 1]);
  await engel("Eksik proses olcumu", "GECERSIZ_ISTEK", op, "POST", `/is-emirleri/${ie5}/proses-olcum`, { olcumler: [{ karakteristikId: karProses[0].id, deger: 10 }] });
  // 3 saat gecti: son uygun olcum 180 dk once > aralik 120 dk -> top kapatilamaz
  await sql("UPDATE olcum SET zaman = zaman - interval '3 hours' WHERE is_emri_id = (SELECT id FROM is_emri WHERE no = $1)", [ie5]);
  const det5 = (await istek(sef, "GET", `/is-emirleri/${ie5}`)).veri;
  esit("Proses durumu: plan var, aralik 120, gecikti", [det5.prosesDurumu.planVar, det5.prosesDurumu.aralikDk, det5.prosesDurumu.gecikti], [true, 120, true]);
  await engel("Proses olcumu gecikmisken top bitir", "PROSES_OLCUM_GECIKTI", op, "POST", `/is-emirleri/${ie5}/top-bitir`, { metraj: 50 });
  const pr1 = await ok("Proses olcumu uygun", op, "POST", `/is-emirleri/${ie5}/proses-olcum`, prosesUygun("KMP-01"));
  esit("Uygun proses olcumu: uretim devam", [pr1.uygun, pr1.durum], [true, "URETIMDE"]);
  const pr2 = await ok("Proses olcumu: dis cap 10,5 (ust sinir 10,3)", op, "POST", `/is-emirleri/${ie5}/proses-olcum`, {
    olcumler: karProses.map((k, i) => ({ karakteristikId: k.id, deger: i === 0 ? 10.5 : k.nominal })),
  });
  esit("Tolerans disi: is emri otomatik durdu", [pr2.uygun, pr2.durum], [false, "DURAKLATILDI"]);
  esit("Supheli aralik son uygun olcumden baslar", pr2.supheliAralik.baslangic !== null, true);
  await engel("Durmus is emrinde top bitir", "YANLIS_DURUM", op, "POST", `/is-emirleri/${ie5}/top-bitir`, { metraj: 50 });
  await ok("Supheli 8 m karantinaya (is emri dururken)", op, "POST", `/is-emirleri/${ie5}/karantina`, { hataKodu: "H-02", miktar: 8 });
  const bas5 = await ok("Devam et", op, "POST", `/is-emirleri/${ie5}/baslat`);
  esit("Ilk parca zaten onayli: dogrudan uretime doner (yeniden ilk parca istenmez)", bas5.durum, "URETIMDE");
  await engel("Son proses olcumu uygun degilken top bitir", "PROSES_UYGUN_DEGIL", op, "POST", `/is-emirleri/${ie5}/top-bitir`, { metraj: 150 });
  const pr3 = await ok("Ayar duzeltildi, proses olcumu uygun", op, "POST", `/is-emirleri/${ie5}/proses-olcum`, prosesUygun("KMP-01"));
  esit("Proses olcumu 3. deneme uygun", [pr3.uygun, pr3.deneme], [true, 3]);
  const top5 = await ok("Top bitir: 150 m", op, "POST", `/is-emirleri/${ie5}/top-bitir`, { metraj: 150 });
  bugunUretilen += 150;
  esit("8 m karantina bu lota baglandi", top5.karantinaBaglanan, 1);
  const dur5 = await ok("Duraklat (neden sorulmaz)", op, "POST", `/is-emirleri/${ie5}/duraklat`, {});
  esit("Duraklatildi", dur5.durum, "DURAKLATILDI");
  const mkD = (await istek(sef, "GET", "/panel/makineler")).veri.find((x) => x.kod === "OR02");
  esit("Yerlesim planinda OR02 duruyor, uzerinde is emri ve urun", [mkD.durum, mkD.isEmriNo, mkD.urunKod], ["DURUYOR", ie5, "KTS-PET-010"]);
  esit("Devam et: dogrudan uretim", (await ok("Devam et", op, "POST", `/is-emirleri/${ie5}/baslat`)).durum, "URETIMDE");
  const mkC = (await istek(sef, "GET", "/panel/makineler")).veri.find((x) => x.kod === "OR02");
  esit("Yerlesim planinda OR02 calisiyor", mkC.durum, "CALISIYOR");
  // Bakim / ariza: muhendisin formu gibi tek seferlik elle kayit
  const bkGovde = { makineId: or2.id, tur: "ARIZA", tarih: bugunStr, ariza: "Tahrik kayisi koptu", yapilan: "Kayis degistirildi, test edildi", kullanilanParca: "Kayis A-42", durusDk: 45 };
  await engel("Depo bakim kaydi girer", "YETKI_YOK", depo, "POST", "/kys/bakimlar", bkGovde);
  await engel("Ariza tanimsiz ariza kaydi", "GECERSIZ_ISTEK", op, "POST", "/kys/bakimlar", { ...bkGovde, ariza: "" });
  await engel("Kisa yapilan islem", "GECERSIZ_ISTEK", op, "POST", "/kys/bakimlar", { ...bkGovde, yapilan: "ok" });
  await engel("Negatif durus suresi", "GECERSIZ_ISTEK", op, "POST", "/kys/bakimlar", { ...bkGovde, durusDk: -5 });
  const yarinStr = (await sql("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date + 1, 'YYYY-MM-DD') AS g"))[0].g;
  await engel("Ileri tarihli bakim kaydi", "GECERSIZ_ISTEK", op, "POST", "/kys/bakimlar", { ...bkGovde, tarih: yarinStr });
  const bk1 = await ok("Ariza kaydi: OR02, 45 dk", op, "POST", "/kys/bakimlar", bkGovde);
  esit("Ariza kaydi numarasi ve suresi", [bk1.no.startsWith("BK-"), bk1.durusDk, bk1.makineKod], [true, 45, "OR02"]);
  await ok("Planli bakim: OR02, 30 dk", sef, "POST", "/kys/bakimlar", { makineId: or2.id, tur: "PLANLI", tarih: bugunStr, yapilan: "Yaglama ve rulman kontrolu", durusDk: 30 });
  // Uretilen 150 + 8 = 158 m; 158 x 80 g = 12,64 kg -> bobin 1 tamami (10) + bobin 2'den 2,64 kg; iade 7,36 kg
  const bitir5 = await ok("Is emri 5 bitir (bobin 2'den 7,36 kg iade)", op, "POST", `/is-emirleri/${ie5}/bitir`, { iadeler: [{ barkod: k5.birimler[1].barkod, kalanMiktar: 7.36 }] });
  esit("Is emri 5: tuketilen 12,64 kg, beklenen 158, uretilen 158, fark 0", [bitir5.denge.kalemler[0].tuketilenKg, bitir5.denge.beklenenMetraj, bitir5.denge.uretilenToplam, bitir5.denge.fark], [12.64, 158, 158, 0]);
  esit("Hedef 158 tam gerceklesti", [bitir5.durum, bitir5.denge.hedefGerceklesmeYuzde], ["TAMAMLANDI", 100]);
  const d5 = (await ok("Is emri 5 ayrintisi", sef, "GET", `/is-emirleri/${ie5}`));
  esit("Olcumler: ilk parca 1 deneme, proses 3 deneme", [new Set(d5.olcumler.filter((x) => x.asama === "ILK_PARCA").map((x) => x.denemeNo)).size, new Set(d5.olcumler.filter((x) => x.asama === "PROSES").map((x) => x.denemeNo)).size], [1, 3]);
  const kart = await ok("Makine karti OR02", sef, "GET", "/panel/makineler/OR02");
  esit("Makine karti: calisan is yok, 2 bakim kaydi", [kart.isEmri, kart.bakimlar.length], [null, 2]);
  const k7 = kart.son7Gun;
  // 7 gun x 1440 dk = 10.080 dk; planli bakim 30, ariza 45 -> (10080 - 30 - 45) / (10080 - 30) = %99,55
  esit("Son 7 gun: planli 10.080 dk, planli bakim 30, ariza 45", [k7.gun, k7.planliDk, k7.planliDurusDk, k7.plansizDurusDk], [7, 10080, 30, 45]);
  esit("Kullanilabilirlik %99,55", k7.deger, r2(((10080 - 30 - 45) / (10080 - 30)) * 100));

  console.log("\n17) Olcum aletleri ve kalibrasyon");
  const aletler = await ok("Alet listesi", kalite, "GET", "/kys/aletler");
  esit("KMP-01 gecerli, KMP-02 gecmis", [aletler.find((x) => x.kod === "KMP-01").kalibrasyonDurumu, aletler.find((x) => x.kod === "KMP-02").kalibrasyonDurumu], ["GECERLI", "GECMIS"]);
  await engel("Operator alet tanimlar", "YETKI_YOK", op, "POST", "/kys/aletler", { kod: "KMP-09", ad: "x", periyotAy: 12 });
  await ok("Yeni alet KMP-03 (12 ay)", kalite, "POST", "/kys/aletler", { kod: "KMP-03", ad: "Dijital kumpas", periyotAy: 12 });
  const yarin = (await sql("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date + 1, 'YYYY-MM-DD') AS g"))[0].g;
  await engel("Ileri tarihli kalibrasyon", "GECERSIZ_ISTEK", kalite, "POST", "/kys/aletler/KMP-03/kalibrasyon", { tarih: yarin, sonuc: "UYGUN" });
  const kal3 = await ok("KMP-03 kalibrasyon uygun (bugun)", kalite, "POST", "/kys/aletler/KMP-03/kalibrasyon", { tarih: bugunStr, sonuc: "UYGUN", sertifikaNo: "C-1" });
  const beklenenSonraki = (await sql("SELECT to_char($1::date + interval '12 months', 'YYYY-MM-DD') AS g", [bugunStr]))[0].g;
  esit("Sonraki kalibrasyon = bugun + 12 ay", [kal3.alet.sonKalibrasyon, kal3.alet.sonrakiKalibrasyon], [bugunStr, beklenenSonraki]);
  await engel("Gerekcesiz uygun degil", "GECERSIZ_ISTEK", kalite, "POST", "/kys/aletler/KMP-01/kalibrasyon", { tarih: bugunStr, sonuc: "UYGUN_DEGIL" });
  const kal1 = await ok("KMP-01 kalibrasyonda uygun degil", kalite, "POST", "/kys/aletler/KMP-01/kalibrasyon", { tarih: bugunStr, sonuc: "UYGUN_DEGIL", aciklama: "0,08 mm sapma" });
  // KMP-01 ile: ilk parca 2 + 2 olcum, proses 2 olcum = 6
  esit("Supheli olcumler (KMP-01 ile yapilan 6 olcum), etkilenen is emri", [kal1.supheliOlcumler.length, kal1.etkilenenIsEmirleri], [6, [ie5]]);
  esit("KMP-01 kullanim disi", kal1.alet.durum, "KULLANIM_DISI");

  console.log("\n18) Musteri sikayeti, iade, DOF, numune imhasi");
  const ford = t.musteriler.find((x) => x.unvan !== musteri.unvan);
  await engel("Baska musterinin sevkiyatina sikayet", "BASKA_MUSTERI", kalite, "POST", "/kys/sikayetler", { musteriId: ford.id, sevkiyatNo: sv, konu: "x" });
  const sk = await ok("Sikayet: sevkiyat + lot", kalite, "POST", "/kys/sikayetler", { musteriId: musteri.id, sevkiyatNo: sv, lotNo: fgLot, konu: "Cap olcusu tutarsiz", aciklama: "Musteri giris kontrolunde 2 makarada sapma" });
  await engel("Sevk edilmemis parca iade", "YANLIS_DURUM", kalite, "POST", "/kalite/musteri-iadesi", { sikayetNo: sk.no, barkodlar: [kesim.birimler[2].barkod], neden: "x" });
  const iade = await ok("Parca 01 (100 m) musteriden iade", depo, "POST", "/kalite/musteri-iadesi", { sikayetNo: sk.no, barkodlar: [kesim.birimler[0].barkod], neden: "Cap sapmasi" });
  esit("Iade toplami", iade.toplam, 100);
  await engel("Ayni parca ikinci kez iade", "YANLIS_DURUM", depo, "POST", "/kalite/musteri-iadesi", { sikayetNo: sk.no, barkodlar: [kesim.birimler[0].barkod], neden: "x" });
  const bekI = (await istek(kalite, "GET", "/kalite/bekleyenler")).veri.parcaKarantina;
  esit("Iade parca kalite bekleyenlerde", bekI.find((x) => x.barkod === kesim.birimler[0].barkod)?.sikayetNo, sk.no);
  let Li = (await istek(sef, "GET", `/lotlar/${fgLot}`)).veri.lot;
  // once: uygun 1005 (sevk 300 dahil); iade sonrasi uygun 905, parca karantinada 100; giris 1027 degismez
  esit("Iade sonrasi lot: uygun 905, karantinada 100, denge tutuyor", [Li.uygun, Li.denge.dagilim.parcaKarantinada, Li.denge.tutuyor], [905, 100, true]);
  await engel("DOF acilmadan hakli sikayet kapatilir", "DOF_YOK", kalite, "POST", `/kys/sikayetler/${sk.no}/kapat`, { kapanisNotu: "Kapatildi" });
  const gecmisTermin = (await sql("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date - 1, 'YYYY-MM-DD') AS g"))[0].g;
  await engel("Gecmis terminli DOF", "GECERSIZ_ISTEK", kalite, "POST", `/kys/sikayetler/${sk.no}/dof`, { sorumluId: sefKisi.id, termin: gecmisTermin });
  const termin = (await sql("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date + 14, 'YYYY-MM-DD') AS g"))[0].g;
  const dofA = await ok("Sikayetten DOF (sorumlu uretim sefi)", kalite, "POST", `/kys/sikayetler/${sk.no}/dof`, { sorumluId: sefKisi.id, termin });
  const df = dofA.dof.no;
  await engel("DOF acikken sikayet kapatilir", "DOF_ACIK", kalite, "POST", `/kys/sikayetler/${sk.no}/kapat`, { kapanisNotu: "Kapatildi" });
  await engel("Kok neden girilmeden tamamla", "KOK_NEDEN_YOK", sef, "POST", `/kys/doflar/${df}/tamamla`);
  await engel("Sorumlu olmayan operator kok neden girer", "YETKI_YOK", op, "POST", `/kys/doflar/${df}/kok-neden`, { kokNeden: "Kumpas kalibrasyonu kaymis", faaliyet: "Kumpas degistirildi" });
  await engel("Kisa kok neden", "GECERSIZ_ISTEK", sef, "POST", `/kys/doflar/${df}/kok-neden`, { kokNeden: "kumpas", faaliyet: "degisti" });
  await ok("Sorumlu kok neden + faaliyet girer", sef, "POST", `/kys/doflar/${df}/kok-neden`, { kokNeden: "KMP-01 kumpasin kalibrasyonu kaymis, cap olcumu yanlis", faaliyet: "Kumpas kullanim disi, OR hatlarina yeni kumpas, olcum talimati guncellendi" });
  await engel("Kalite, sorumlu yerine tamamlar", "YETKI_YOK", kalite, "POST", `/kys/doflar/${df}/tamamla`);
  await ok("Sorumlu tamamlar", sef, "POST", `/kys/doflar/${df}/tamamla`, { not: "Uygulandi" });
  await engel("Sorumlu kendi DOF'unu dogrular", "YETKI_YOK", sef, "POST", `/kys/doflar/${df}/dogrula`, { etkili: true, etkinlikNotu: "x" });
  const etkisiz = await ok("Kalite: etkili degil", kalite, "POST", `/kys/doflar/${df}/dogrula`, { etkili: false, etkinlikNotu: "Talimat sahada yok" });
  esit("Etkisiz DOF uygulamaya doner", etkisiz.durum, "UYGULAMADA");
  await ok("Sorumlu tekrar tamamlar", sef, "POST", `/kys/doflar/${df}/tamamla`);
  const kapanan = await ok("Kalite: etkili, kapat", kalite, "POST", `/kys/doflar/${df}/dogrula`, { etkili: true, etkinlikNotu: "2 hafta sapma yok" });
  esit("DOF kapandi, kapatan kalite", [kapanan.durum, kapanan.kapatan], ["KAPANDI", kaliteKisi.id]);
  const icDof = await ok("Ic denetim DOF'u (sorumlu kalite)", kalite, "POST", "/kys/doflar", { kaynak: "IC_DENETIM", problem: "Etiket yeniden baski nedeni yazilmiyor", sorumluId: kaliteKisi.id, termin });
  await ok("Kalite kok neden", kalite, "POST", `/kys/doflar/${icDof.no}/kok-neden`, { kokNeden: "Ekranda neden alani zorunlu degil", faaliyet: "Neden alani zorunlu yapildi" });
  await ok("Kalite tamamlar", kalite, "POST", `/kys/doflar/${icDof.no}/tamamla`);
  await engel("Ayni kisi hem sorumlu hem dogrulayici", "YETKI_YOK", kalite, "POST", `/kys/doflar/${icDof.no}/dogrula`, { etkili: true, etkinlikNotu: "x" });
  await engel("Iade karari verilmeden sikayet kapatilir", "IADE_KARARI_YOK", kalite, "POST", `/kys/sikayetler/${sk.no}/kapat`, { kapanisNotu: "Kapatildi" });
  await engel("Numune saklama suresi dolmadan imha", "IMHA_TARIHI_GELMEDI", kalite, "POST", `/kalite/numuneler/NM-${fgLot}/imha`, {});
  await sql("UPDATE birim SET ek = jsonb_set(ek, '{imhaTarihi}', to_jsonb((current_date - 1)::text)) WHERE barkod = $1", [`NM-${fgLot}`]);
  esit("Imhasi gelen numune listede", (await istek(kalite, "GET", "/kalite/numuneler?imhaGelen=1")).veri.map((x) => x.barkod), [`NM-${fgLot}`]);
  await engel("Acik sikayetli lotun numunesi imha", "NUMUNE_DELIL", kalite, "POST", `/kalite/numuneler/NM-${fgLot}/imha`, {});
  await ok("Iade parca reddedilir", kalite, "POST", "/kalite/son-kontrol", { barkodlar: [kesim.birimler[0].barkod], karar: "RET", not: "Cap sapmasi dogrulandi" });
  Li = (await istek(sef, "GET", `/lotlar/${fgLot}`)).veri.lot;
  esit("Lot: uygun 905, hurda 16 + 100 = 116, denge tutuyor", [Li.uygun, Li.hurdaToplam, Li.denge.tutuyor], [905, 116, true]);
  const skK = await ok("Sikayet kapatilir", kalite, "POST", `/kys/sikayetler/${sk.no}/kapat`, { kapanisNotu: "DOF etkili, iade hurdaya ayrildi" });
  esit("Sikayet kapandi", skK.durum, "KAPANDI");
  const skL = (await istek(kalite, "GET", "/kys/sikayetler")).veri.find((x) => x.no === sk.no);
  esit("Sikayet listesinde iade miktari ve DOF", [skL.iadeMiktari, skL.dofNo, skL.dofDurum], [100, df, "KAPANDI"]);
  const imha = await ok("Numune imha", kalite, "POST", `/kalite/numuneler/NM-${fgLot}/imha`, { not: "Saklama suresi doldu" });
  esit("Numune imha edildi", imha.durum, "IMHA_EDILDI");
  Li = (await istek(sef, "GET", `/lotlar/${fgLot}`)).veri.lot;
  esit("Imhadan sonra lotta numune metresi 1 kalir, denge tutuyor", [Li.numune, Li.denge.tutuyor], [1, true]);
  const haksiz = await ok("Ikinci sikayet (haksiz)", kalite, "POST", "/kys/sikayetler", { musteriId: musteri.id, konu: "Teslimat gec" });
  await engel("Haksiz sikayet kisa gerekce", "GECERSIZ_ISTEK", kalite, "POST", `/kys/sikayetler/${haksiz.no}/kapat`, { kapanisNotu: "yok", hakli: false });
  await ok("Haksiz sikayet gerekceyle DOF'suz kapanir", kalite, "POST", `/kys/sikayetler/${haksiz.no}/kapat`, { kapanisNotu: "Teslimat sozlesmedeki tarihte yapilmis, irsaliye ekte", hakli: false });

  console.log("\n19) Tedarikci degerlendirme");
  const ay = Number(bugunStr.slice(5, 7));
  const donem = `${bugunStr.slice(0, 4)}-Q${Math.ceil(ay / 3)}`;
  const on = await ok("Onizleme: donemdeki lotlar", kalite, "GET", `/kys/tedarikci-degerlendirme/onizleme?tedarikciId=${ted.id}&donem=${donem}`);
  // Lotlar: ilk PET (kabul), iptal edilen (sayilmaz), 3x10 (karantina gordu), PA6 (kabul), 2x10 (kabul) -> 3 / 4 = %75
  esit("Karar verilen 4 lot, ilk seferde kabul 3, kalite puani 75", [on.lotSayisi, on.kabulLot, on.kalitePuani], [4, 3, 75]);
  await engel("Puan disi deger", "GECERSIZ_ISTEK", kalite, "POST", "/kys/tedarikci-degerlendirme", { tedarikciId: ted.id, donem, teslimatPuani: 120, belgePuani: 60 });
  await engel("Sartli sonucta aciklamasiz", "GECERSIZ_ISTEK", kalite, "POST", "/kys/tedarikci-degerlendirme", { tedarikciId: ted.id, donem, teslimatPuani: 90, belgePuani: 60 });
  const tdg = await ok("Degerlendirme: teslimat 90, belge 60", kalite, "POST", "/kys/tedarikci-degerlendirme", { tedarikciId: ted.id, donem, teslimatPuani: 90, belgePuani: 60, aciklama: "Karantina orani yuksek" });
  // 75 x 0,5 + 90 x 0,3 + 60 x 0,2 = 37,5 + 27 + 12 = 76,5 -> SARTLI
  esit("Toplam puan 76,5 -> SARTLI", [tdg.hesap.toplam, tdg.hesap.sonuc], [76.5, "SARTLI"]);
  esit("Tedarikci karti sartli oldu", (await istek(depo, "GET", "/tanimlar")).veri.tedarikciler.find((x) => x.id === ted.id).onayDurumu, "SARTLI");
  await engel("Ayni donem ikinci degerlendirme", "ZATEN_VAR", kalite, "POST", "/kys/tedarikci-degerlendirme", { tedarikciId: ted.id, donem, teslimatPuani: 90, belgePuani: 60, aciklama: "x" });
  await engel("Lotu olmayan tedarikci", "VERI_YOK", kalite, "POST", "/kys/tedarikci-degerlendirme", { tedarikciId: t.tedarikciler.find((x) => x.id !== ted.id).id, donem, teslimatPuani: 90, belgePuani: 90 });
  await engel("Gecersiz donem", "GECERSIZ_ISTEK", kalite, "GET", `/kys/tedarikci-degerlendirme/onizleme?tedarikciId=${ted.id}&donem=2026-5`);

  console.log("\n20) Egitim, depo yerlesimi");
  await engel("Ileri tarihli egitim", "GECERSIZ_ISTEK", kalite, "POST", "/kys/egitimler", { kullaniciId: opKisi.id, konu: "Ilk parca", tarih: yarin, sonuc: "BASARILI" });
  await engel("Gecerlilik egitimden once", "GECERSIZ_ISTEK", kalite, "POST", "/kys/egitimler", { kullaniciId: opKisi.id, konu: "Ilk parca", tarih: bugunStr, sonuc: "BASARILI", gecerlilikBitis: gecmisTermin });
  await ok("Egitim kaydi", kalite, "POST", "/kys/egitimler", { kullaniciId: opKisi.id, konu: "Ilk parca ve proses olcumu", tarih: bugunStr, egitmen: "Berra Karaman", sureSaat: 2, sonuc: "BASARILI", gecerlilikBitis: termin });
  await engel("Karar bekleyen karantina parcasi rafa", "RAFA_UYGUN_DEGIL", depo, "POST", `/birimler/${kr3.karantina.barkod}/yerlestir`, { yerKodu: "YR-D1-R01" });
  await engel("Mamul numune dolabina", "RAFA_UYGUN_DEGIL", depo, "POST", `/birimler/${kesim.birimler[6].barkod}/yerlestir`, { yerKodu: "YR-NUM-01" });
  const yer = await ok("Serbest parca rafa", depo, "POST", `/birimler/${kesim.birimler[6].barkod}/yerlestir`, { yerKodu: "YR-D1-R01" });
  esit("Rafa konan parca depoda", [yer.yer, (await istek(depo, "GET", `/barkod/${kesim.birimler[6].barkod}`)).veri.birim.durum], ["DEPO:YR-D1-R01", "DEPODA"]);
  await ok("Karantina parcasi karantina alanina", depo, "POST", `/birimler/${kr3.karantina.barkod}/yerlestir`, { yerKodu: "YR-KAR" });
  await engel("Nedensiz etiket yeniden baski", "GECERSIZ_ISTEK", depo, "POST", `/birimler/${kesim.birimler[6].barkod}/etiket`, {});
  const kopya = await ok("Etiket yeniden baski (nedenli)", depo, "POST", `/birimler/${kesim.birimler[6].barkod}/etiket`, { neden: "Etiket yirtildi" });
  esit("Yeniden baski 2. kopya", kopya.kopyaNo, 2);
  await engel("Operator firma ayari degistirir", "YETKI_YOK", op, "PATCH", "/tanimlar/firma/ayarlar", { numuneZorunlu: false });
  await engel("Bilinmeyen ayar", "GECERSIZ_ISTEK", kalite, "PATCH", "/tanimlar/firma/ayarlar", { uydurma: 1 });
  await engel("Cakisan vardiyalar (08-16 ve 15-23)", "GECERSIZ_ISTEK", kalite, "PATCH", "/tanimlar/firma/ayarlar", { vardiyalar: [{ bas: "08:00", bit: "16:00" }, { bas: "15:00", bit: "23:00" }] });
  await engel("Gecersiz saat 24:30", "GECERSIZ_ISTEK", kalite, "PATCH", "/tanimlar/firma/ayarlar", { vardiyalar: [{ bas: "16:30", bit: "24:30" }] });
  const ay3 = await ok("Uc vardiya (gece vardiyasi 00-08) ve hedef guncelle", kalite, "PATCH", "/tanimlar/firma/ayarlar", {
    vardiyalar: [{ ad: "Sabah", bas: "08:00", bit: "16:00" }, { ad: "Aksam", bas: "16:00", bit: "24:00" }, { ad: "Gece", bas: "00:00", bit: "08:00" }],
    kpiHedefleri: { fireOrani: 2.5 }, gerekce: "Vardiya adlari",
  });
  esit("Ayarlar kaydedildi, diger ayarlar ve hedefler korundu", [ay3.vardiyalar.length, ay3.kpiHedefleri.fireOrani, ay3.kpiHedefleri.kullanilabilirlik, ay3.prosesOlcumAraligiDk, ay3.numuneZorunlu], [3, 2.5, 85, 120, true]);
  await engel("Yerlesim plani 0-100 disi", "GECERSIZ_ISTEK", kalite, "PATCH", `/tanimlar/makineler/${or5.id}`, { planX: 140, gerekce: "deneme" });

  console.log("\n21) KPI (hesaplar kaynaktan tekrar yapilir)");
  const kpi = await ok("KPI paneli", sef, "GET", "/panel/kpi");
  const G = Object.fromEntries(kpi.gostergeler.map((x) => [x.ad, x]));
  esit("6 gosterge", kpi.gostergeler.length, 6);
  esit("Her gosterge = pay / payda x carpan", kpi.gostergeler.every((x) => x.payda > 0 && Math.abs(x.deger - (x.pay / x.payda) * (x.birim === "ppm" ? 1e6 : 100)) < 0.01), true);
  // Ilk parca ilk denemede: IE1 (1. deneme ret), IE3, IE4, IE5 uygun -> 3/4
  esit("Ilk parca ilk seferde 3/4 = %75", [G.ilkParcaIlkSeferde.pay, G.ilkParcaIlkSeferde.payda, G.ilkParcaIlkSeferde.deger], [3, 4, 75]);
  const tumL = (await istek(sef, "GET", "/lotlar")).veri;
  const hurdaT = r2(tumL.reduce((a, x) => a + x.hurdaToplam, 0));
  const krT = r2(tumL.reduce((a, x) => a + x.karantina, 0));
  esit("Fire: pay = lotlardaki hurda toplami, payda = top + karantina", [G.fireOrani.pay, G.fireOrani.payda], [hurdaT, r2(bugunUretilen + krT)]);
  esit("Karantina: 27 + 8 = 35 m", G.karantinaOrani.pay, 35);
  // Sevk: 3 x 100 + 100 = 400 m; iade 100 m -> 250.000 ppm
  esit("Musteri iadesi 100 / 400 x 1.000.000", [G.musteriIadePpm.pay, G.musteriIadePpm.payda, G.musteriIadePpm.deger], [100, 400, 250000]);
  esit("Zamaninda tamamlama 1/1 (yalnizca IE5 planli)", [G.zamanindaTamamlama.pay, G.zamanindaTamamlama.payda], [1, 1]);
  const ku = kpi.kullanilabilirlik;
  // 30 gun x 1440 dk x 19 makine = 820.800 dk; planli bakim 30, ariza 45
  esit("Kullanilabilirlik girdileri: 30 gun, 820.800 dk, planli bakim 30, ariza 45", [ku.gun, ku.planliDk, ku.planliDurusDk, ku.plansizDurusDk], [30, 820800, 30, 45]);
  esit("Kullanilabilirlik = (820800 - 30 - 45) / (820800 - 30)", G.kullanilabilirlik.deger, r2(((820800 - 75) / 820770) * 100));
  esit("Kullanilabilirlik payi = planli - planli durus - plansiz durus", G.kullanilabilirlik.pay, r2(ku.planliDk - ku.planliDurusDk - ku.plansizDurusDk));
  esit("19 makine x 1440 dk/gun", [ku.makineSayisi, ku.gunlukPlanliDk], [19, 1440]);
  esit("Fire hedefi ayardan (2,5)", G.fireOrani.hedef, 2.5);
  esit("Uyarilar: gecmis kalibrasyon 2 (KMP-01 kullanim disi, KMP-02), acik DOF 1", [kpi.uyarilar.gecmisKalibrasyon, kpi.uyarilar.acikDof, kpi.uyarilar.acikSikayet], [2, 1, 0]);
  const tumLotlar2 = (await istek(sef, "GET", "/lotlar")).veri;
  esit(`Son durumda tum lotlarda denge tutuyor (${tumLotlar2.length} lot)`, tumLotlar2.filter((x) => !x.denge.tutuyor).map((x) => x.no), []);

  console.log("\n22) Kayit guvenligi");
  const dogrula = await ok("Degisiklik izi zinciri", denetci, "GET", "/panel/iz-dogrula");
  esit("Zincir saglam", dogrula.saglam, true);
  const ozet = await ok("Panel ozeti", sef, "GET", "/panel/ozet");
  esit("Bugun uretilen (tum toplar)", ozet.bugunUretilen, bugunUretilen);

  console.log(`\nSonuc: ${gecen} basarili, ${kalan} basarisiz\n`);
  await db.end();
  process.exit(kalan ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
