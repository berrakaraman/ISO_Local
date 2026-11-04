// Uctan uca akis testi: mal kabulden sevkiyata ve soy agacina kadar tum sureci API uzerinden calistirir.
// Once API calisiyor olmali (npm run dev). Sonra baska bir terminalde:  npm run test:akis
// Bos bir veritabaninda calistirin: npm run db:reset
const API = process.env.API || "http://localhost:5001/api";

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

  console.log("\n2) Tanimlar");
  const t = await ok("Tanimlar listesi", depo, "GET", "/tanimlar");
  const pet = t.malzemeler.find((x) => x.kod === "PET-025");
  const ted = t.tedarikciler[0];
  const urun = t.urunler.find((x) => x.kod === "KTS-PET-010");
  const or3 = t.makineler.find((x) => x.kod === "OR03");
  const musteri = t.musteriler[0];
  const karIlk = t.karakteristikler.filter((x) => x.urunId === urun.id && x.asama === "ILK_PARCA");
  const karMetraj = t.karakteristikler.filter((x) => x.urunId === urun.id && x.asama === "METRAJ");
  await engel("Turkce karakterli makine kodu", "GECERSIZ_ISTEK", (await giris("berra", "Berra.1234")), "POST", "/tanimlar/makineler", { kod: "Ö04", ad: "x", tip: "ORGU" });

  console.log("\n3) Mal kabul ve giris kontrolu");
  const kabul = await ok("Mal kabul: 4 bobin x 25 kg", depo, "POST", "/hammadde/kabul", {
    malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-2610-77", coaVar: true, ambalajlar: [25, 25, 25, 25], depoYeri: "YR-D1-R01",
  });
  const lotNo = kabul.lot.no;
  const [b1, b2, b3, b4] = kabul.birimler.map((b) => b.barkod);
  esit("Etiket sayisi", kabul.etiketler.length, 4);
  esit("Ilk ambalaj barkodu lot + -01", b1, `${lotNo}-01`);
  if (kabul.etiketler[0].zpl.includes("^BC") && kabul.etiketler[0].zpl.includes("^BQ")) tamam("Etikette Code 128 ve QR var");
  else hata("Etiket ZPL", kabul.etiketler[0].zpl);

  const ie = (await ok("Is emri ac (1250 m, OR03)", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 1250 })).isEmri.no;
  await ok("Is emrini baslat", op, "POST", `/is-emirleri/${ie}/baslat`);
  await engel("Kontrol edilmemis bobin makineye", "ONAYSIZ_MALZEME", op, "POST", `/is-emirleri/${ie}/bagla`, { barkod: b1 });
  await ok("Kalite lotu kabul eder", kalite, "POST", `/hammadde/lotlar/${lotNo}/kontrol`, { karar: "KABUL" });

  console.log("\n4) Cekis ve makineye yukleme");
  const cekis = await ok("Kismi cekis: 01'den 20 kg (bolunur)", depo, "POST", "/hammadde/cekis", { barkod: b1, miktar: 20, isEmriNo: ie });
  esit("Bolunen yeni barkod", cekis.birim.barkod, `${lotNo}-05`);
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
  const onay = await ok("Ilk parca: uygun olcum", kalite, "POST", `/is-emirleri/${ie}/ilk-parca`, {
    olcumler: karIlk.map((k) => ({ karakteristikId: k.id, deger: k.nominal })),
  });
  esit("Ilk parca onaylandi", onay.onaylandi, true);
  const kr1 = await ok("Karantina: tel kopmasi 10 m", op, "POST", `/is-emirleri/${ie}/karantina`, { hataKodu: "H-05", miktar: 10 });
  await ok("Karantina: 12 m", op, "POST", `/is-emirleri/${ie}/karantina`, { hataKodu: "H-04", miktar: 12 });
  const kr3 = await ok("Karantina: 5 m", op, "POST", `/is-emirleri/${ie}/karantina`, { hataKodu: "H-07", miktar: 5 });
  esit("Kiosk karantina toplami", kr3.sayaclar.karantina, 27);
  if (kr1.etiket.zpl.includes("KARANTINA")) tamam("Karantina etiketi basildi");
  else hata("Karantina etiketi", kr1.etiket.zpl);

  console.log("\n6) Topu bitir, bitir, miktar dengesi");
  const top = await ok("Topu bitir: 1000 m", op, "POST", `/is-emirleri/${ie}/top-bitir`, { metraj: 1000 });
  const fgLot = top.lot.no;
  esit("Karantina parcalari lota baglandi", top.karantinaBaglanan, 3);
  const bitir = await ok("Isi bitir (03'ten 5 kg iade)", op, "POST", `/is-emirleri/${ie}/bitir`, { iadeler: [{ barkod: b3, kalanMiktar: 5 }] });
  // Tuketilen: 20 + 25 + 20 + 25 = 90 kg -> 90000/80 = 1125 m beklenen; uretilen 1000 + 27 = 1027; fark 98 m = %8,71
  esit("Tuketilen kg", bitir.denge.kalemler[0].tuketilenKg, 90);
  esit("Beklenen metraj", bitir.denge.beklenenMetraj, 1125);
  esit("Fark %", bitir.denge.farkYuzde, 8.71);
  esit("Durum (tolerans %3 asildi)", bitir.durum, "TAMAMLANDI_FARK");
  await ok("Sef farki aciklar", sef, "POST", `/is-emirleri/${ie}/fark-aciklamasi`, { aciklama: "Bobin sonlarinda tel kopmasi, tartilmadan atildi" });

  console.log("\n7) Kesim, numune, son kontrol");
  const kesim = await ok("Kesim: 9 x 100 m + 95 m + 5 m fire", op, "POST", `/lotlar/${fgLot}/kesim`, {
    parcalar: [100, 100, 100, 100, 100, 100, 100, 100, 100, 95], kesimFiresi: 5,
    olcumler: karMetraj.map((k) => ({ karakteristikId: k.id, deger: k.nominal })),
  });
  esit("Parca sayisi", kesim.birimler.length, 10);
  esit("Ilk parca barkodu", kesim.birimler[0].barkod, `${fgLot}-01`);
  await ok("Sahit numune", kalite, "POST", `/lotlar/${fgLot}/numune`, { arsivYeri: "YR-NUM-01" });
  await engel("Ayni lottan ikinci numune", "ZATEN_VAR", kalite, "POST", `/lotlar/${fgLot}/numune`, {});
  await ok("Son kontrol: lot serbest", kalite, "POST", "/kalite/son-kontrol", { lotNo: fgLot, karar: "SERBEST" });

  console.log("\n8) Karantina kararlari");
  const olumlu = await ok("10 m parca: olumlu", kalite, "POST", `/kalite/karantina/${kr1.karantina.barkod}/karar`, { karar: "OLUMLU" });
  esit("Olumlu parcaya yeni FG numarasi", olumlu.yeniBirim.barkod, `${fgLot}-11`);
  const bek = await ok("Kalite bekleyenler", kalite, "GET", "/kalite/bekleyenler");
  esit("Karar bekleyen karantina", bek.karantina.length, 2);
  await ok("12 m parca: hurda", kalite, "POST", `/kalite/karantina/${bek.karantina[0].barkod}/karar`, { karar: "HURDA", not: "Orgu sikligi duzeltilemez" });

  console.log("\n9) Sevkiyat ve bloke");
  const sv = (await ok("Sevkiyat ac", depo, "POST", "/sevkiyat", { musteriId: musteri.id, urunId: urun.id, siparisNo: "S-4587" })).no;
  await ok("Parca 01 okut", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[0].barkod });
  await ok("Parca 02 okut", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[1].barkod });
  await engel("Ayni parca ikinci kez", "ZATEN_EKLI", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[1].barkod });
  await engel("Karantina etiketi sevkiyatta okutulur", "YANLIS_BIRIM", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kr3.karantina.barkod });
  const bl = await ok("Parca 03 bloke", kalite, "POST", "/kalite/bloke", { barkodlar: [kesim.birimler[2].barkod], neden: "Musteri sikayeti incelemesi" });
  await engel("Bloke parca sevkiyata", "BLOKE", depo, "POST", `/sevkiyat/${sv}/okut`, { barkod: kesim.birimler[2].barkod });
  await ok("Sevkiyati onayla", depo, "POST", `/sevkiyat/${sv}/onayla`, { irsaliyeNo: "IRS-00024" });
  await ok("Blokeyi kaldir", kalite, "POST", `/kalite/bloke/${bl.bloke.id}/kaldir`, { gerekce: "Inceleme tamamlandi, sorun yok" });

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
  esit("Karantina kararlari", bk.karantinaKararlari.map((x) => x.durum), ["OLUMLU", "HURDA", "KARAR_BEKLIYOR"]);
  console.log("     Tuketilen dagilimi (kg):", JSON.stringify(bk.bakiye.tuketilenDagilimi));

  console.log("\n12) Onay akisi, iptal ve silmeme kurali");
  const kaliteKisiler = await ok("Onaya atanabilecek kalite kisileri", depo, "GET", "/onaylar/kisiler?rol=KALITE");
  const kaliteKisi = kaliteKisiler.find((x) => x.roller.includes("KALITE"));
  const depoKisi = (await istek(depo, "GET", "/onaylar/kisiler")).veri.find((x) => x.roller.includes("DEPO") && !x.roller.includes("ADMIN"));
  esit("Kalite kisisi listede", !!kaliteKisi, true);
  await engel("Depocuya hammadde onayi atanir", "GECERSIZ_ISTEK", depo, "POST", "/hammadde/kabul", {
    malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-X", ambalajlar: [10], atananId: depoKisi.id,
  });
  const k2 = await ok("Mal kabul + kaliteye onay gorevi", depo, "POST", "/hammadde/kabul", {
    malzemeId: pet.id, tedarikciId: ted.id, tedarikciLot: "TF-2610-90", coaVar: true, ambalajlar: [25, 25], depoYeri: "YR-D1-R02", atananId: kaliteKisi.id,
  });
  esit("Onay durumu", k2.onay.durum, "BEKLIYOR");
  const gorev = await ok("Gorevlerim (kalite)", kalite, "GET", "/onaylar?benim=1&durum=BEKLIYOR,ASKIDA");
  esit("Gorev listede", gorev.some((x) => x.kayitNo === k2.lot.no), true);
  await engel("Atanmamis kisi karar verir", "YETKI_YOK", depo, "POST", `/onaylar/${k2.onay.id}/karar`, { durum: "ONAYLANDI" });
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

  const sv2 = (await ok("Ikinci sevkiyat", depo, "POST", "/sevkiyat", { musteriId: musteri.id, urunId: urun.id })).no;
  const p4 = kesim.birimler[3].barkod;
  await ok("Parca 04 okut", depo, "POST", `/sevkiyat/${sv2}/okut`, { barkod: p4 });
  await ok("Parca 04 cikar (silinmez, isaretlenir)", depo, "POST", `/sevkiyat/${sv2}/cikar`, { barkod: p4 });
  await ok("Parca 04 tekrar okutulur", depo, "POST", `/sevkiyat/${sv2}/okut`, { barkod: p4 });

  console.log("\n13) Form listeleri, onay ve iptal (F-02 ... F-06)");
  const lotlar = await ok("F-03 uretim lotlari", sef, "GET", "/lotlar");
  const L = lotlar.find((x) => x.no === fgLot);
  esit("F-03 toplam / uygun / karantina / bekleyen / hurda / fire", [L.topMetraji, L.uygun, L.karantina, L.karantinaBekleyen, L.karantinaHurda, L.kesimFiresi], [1000, 1005, 27, 5, 12, 5]);
  esit("F-03 hammadde lotu ve operator", [L.hammaddeLotlari, L.operatorAd], [lotNo, "Ahmet Yılmaz"]);
  const lotDetay = await ok("F-03 lot ayrintisi", sef, "GET", `/lotlar/${fgLot}`);
  esit("Lot parcalarinda numune var", lotDetay.birimler.some((x) => x.tip === "NM"), true);
  const krListe = await ok("F-04 karantina listesi", kalite, "GET", "/kalite/karantinalar");
  const krOlumlu = krListe.find((x) => x.barkod === kr1.karantina.barkod);
  esit("F-04 karar, karar veren, yeni barkod", [krOlumlu.durum, krOlumlu.kararVerenAd, krOlumlu.yeniBarkod], ["OLUMLU", "Berra Karaman", `${fgLot}-11`]);
  const kontroller = await ok("F-05 kontrol listesi", kalite, "GET", "/kalite/kontroller");
  esit("F-05 ilk parca, metraj ve son kontrol var", ["ILK_PARCA", "METRAJ", "SON_KONTROL"].every((x) => kontroller.some((k) => k.tur === x)), true);

  const kisiler = (await istek(sef, "GET", "/onaylar/kisiler")).veri;
  const mehmetKisi = kisiler.find((x) => x.roller.includes("SEF"));
  const ie2 = await ok("F-02 is emri + onaya gonder", sef, "POST", "/is-emirleri", { urunId: urun.id, makineId: or3.id, hedefMiktar: 500, atananId: kaliteKisi.id });
  esit("Is emri onayi", ie2.onay.durum, "BEKLIYOR");
  await engel("Onaysiz is emri baslatilir", "ONAY_BEKLIYOR", sef, "POST", `/is-emirleri/${ie2.isEmri.no}/baslat`);
  await engel("Kisa gerekceyle is emri iptali", "GECERSIZ_ISTEK", sef, "POST", `/is-emirleri/${ie2.isEmri.no}/iptal`, { gerekce: "x" });
  await ok("Is emri iptal (silinmez)", sef, "POST", `/is-emirleri/${ie2.isEmri.no}/iptal`, { gerekce: "Musteri siparisi erteledi" });
  const ieListe = await ok("F-02 listesi", sef, "GET", "/is-emirleri");
  const ie2Satir = ieListe.find((x) => x.no === ie2.isEmri.no);
  esit("F-02 iptal eden ve kaydeden", [ie2Satir.durum, ie2Satir.iptalEdenAd, ie2Satir.olusturanAd], ["IPTAL", mehmetKisi.adSoyad, mehmetKisi.adSoyad]);
  const ieGecmis = await ok("F-02 kayit gecmisi", sef, "GET", `/gecmis/IS_EMRI/${ie2.isEmri.no}`);
  esit("Is emri gecmisinde kayit, onay, iptal", ["EKLEME", "IPTAL"].every((x) => ieGecmis.some((g) => g.islem === x)), true);

  const sv3 = await ok("F-06 sevkiyat + onaya gonder", depo, "POST", "/sevkiyat", { musteriId: musteri.id, atananId: kaliteKisi.id });
  await ok("Parca 05 okut", depo, "POST", `/sevkiyat/${sv3.no}/okut`, { barkod: kesim.birimler[4].barkod });
  await engel("Onaysiz sevkiyat sevk edilir", "ONAY_BEKLIYOR", depo, "POST", `/sevkiyat/${sv3.no}/onayla`, { irsaliyeNo: "IRS-1" });
  await ok("Sevkiyat onayi (kalite)", kalite, "POST", `/onaylar/${sv3.onay.id}/karar`, { durum: "ONAYLANDI" });
  await ok("Onayli sevkiyat sevk edilir", depo, "POST", `/sevkiyat/${sv3.no}/onayla`, { irsaliyeNo: "IRS-00025" });
  await ok("Hazirlanan sevkiyat iptal", depo, "POST", `/sevkiyat/${sv2}/iptal`, { gerekce: "Musteri teslimati iptal etti" });
  const svListe = await ok("F-06 listesi", depo, "GET", "/sevkiyat");
  const sv3Satir = svListe.find((x) => x.no === sv3.no);
  const sv2Satir = svListe.find((x) => x.no === sv2);
  esit("F-06 hazirlayan / onaylayan / lot", [sv3Satir.olusturanAd, sv3Satir.onaylayanAd, sv3Satir.lotlar], [depoKisi.adSoyad, depoKisi.adSoyad, fgLot]);
  esit("Iptal edilen sevkiyat duruyor", [sv2Satir.durum, sv2Satir.iptalEdenAd], ["IPTAL", depoKisi.adSoyad]);
  esit("Iptalle parca 04 serbest", (await istek(depo, "GET", `/barkod/${kesim.birimler[3].barkod}`)).veri.birim.durum, "SERBEST");
  for (const [tur, no] of [["URETIM_LOT", fgLot], ["KARANTINA", kr1.karantina.barkod], ["SEVKIYAT", sv3.no]]) {
    const g = await ok(`${tur} gecmisi`, kalite, "GET", `/gecmis/${tur}/${no}`);
    if (!g.length || g.some((x) => !x.kim)) hata(`${tur} gecmisinde isim`, JSON.stringify(g.slice(0, 2)));
  }

  console.log("\n14) Kayit guvenligi");
  const dogrula = await ok("Degisiklik izi zinciri", denetci, "GET", "/panel/iz-dogrula");
  esit("Zincir saglam", dogrula.saglam, true);
  const ozet = await ok("Panel ozeti", sef, "GET", "/panel/ozet");
  esit("Bugun uretilen", ozet.bugunUretilen, 1000);

  console.log(`\nSonuc: ${gecen} basarili, ${kalan} basarisiz\n`);
  process.exit(kalan ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
