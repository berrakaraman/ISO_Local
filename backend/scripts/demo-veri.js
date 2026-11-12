// Demo verisi (surum 2): 8 kisa hikaye, son 7 is gunune yayilmis.
// Kayitlar gercek kullanici gibi API uzerinden girilir (Ayse mal kabul yapar, Ahmet uretir, Berra ve Said onaylar);
// her miktar sistemin kurallarindan ve hesaplarindan gecer. Butun adimlar birkac saniyede kaydedilir,
// sonra kayitlarin zamanlari her adimin "sanal" saatine kaydirilir (asagida ZAMAN KAYDIRMA).
// Degisiklik izi zinciri kaydirmadan sonra yeniden hesaplanir; iz-dogrula "saglam" cikar.
//
// Normalde dogrudan calistirilmaz: scripts/demo-sifirla.js once veritabanini bosaltir, sonra bunu calistirir.
// Elle (yerelde, bos veritabaninda):  cd backend && node scripts/demo-veri.js   (API calisiyor olmali)
// Veritabaninda lot, is emri ya da sevkiyat varsa HICBIR SEY yapmadan cikar.
const path = require("path");
const crypto = require("crypto");
const KOK = path.join(__dirname, "..");
const jwt = require(require.resolve("jsonwebtoken", { paths: [KOK] }));
const env = require(path.join(KOK, "src/config/env"));
const { pool } = require(path.join(KOK, "src/config/db"));

const API = process.env.API || `http://127.0.0.1:${env.port}/api`;
const sql = async (q, p) => (await pool.query(q, p)).rows;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const yuv = (n, h = 2) => Math.round(n * 10 ** h) / 10 ** h;

// ---------------------------------------------------------------------------
// Sanal saat. Turkiye'de yaz saati yok: saat dilimi sabit +03:00.
// G[0] bugun, G[1] bir onceki is gunu ... G[7] kurulum gunu (tanimlar). Hafta sonlari atlanir.
// ---------------------------------------------------------------------------
const IST = 3 * 60 * 60 * 1000;
const tarihStr = (d) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
// DEMO_SIMDI yalnizca deneme icindir (ornek: sabah 08:30'da calismis gibi). Normalde su an.
const SIMDI = process.env.DEMO_SIMDI ? new Date(process.env.DEMO_SIMDI) : new Date();
const G = [];
{
  let d = new Date(`${tarihStr(SIMDI)}T12:00:00+03:00`);
  G.push(tarihStr(d));
  while (G.length < 8) {
    d = new Date(d.getTime() - 86400000);
    const gun = new Date(d.getTime() + IST).getUTCDay();
    if (gun !== 0 && gun !== 6) G.push(tarihStr(d));
  }
}
const YARIN = (() => {
  let d = new Date(`${G[0]}T12:00:00+03:00`);
  do d = new Date(d.getTime() + 86400000);
  while ([0, 6].includes(new Date(d.getTime() + IST).getUTCDay()));
  return tarihStr(d);
})();
const takvim = (fark) => tarihStr(new Date(new Date(`${G[0]}T12:00:00+03:00`).getTime() + fark * 86400000));
const gunEkle = (t, fark) => tarihStr(new Date(new Date(`${t}T12:00:00+03:00`).getTime() + fark * 86400000));
// Bugunun adimlari 0..285 "dakika" uzerine yazilmistir. Normalde son 5 saate yayilir; sabah erken
// calistirilirsa (ornek 08:30) 07:00 ile simdi arasina sikistirilir, boylece gece saatleri gorunmez.
// Her durumda simdiden en az 10 dk once biter (gelecek tarihli kayit olmaz).
const SABAH7 = new Date(`${tarihStr(SIMDI)}T07:00:00+03:00`).getTime();
const B = SIMDI.getTime() - 30 * 60000 > SABAH7 ? Math.max(SIMDI.getTime() - 300 * 60000, SABAH7) : SIMDI.getTime() - 300 * 60000;
const BUGUN_KAT = Math.min(1, (SIMDI.getTime() - 10 * 60000 - B) / (285 * 60000));

const NOKTALAR = []; // { g: gercek zaman (veritabani saati, mikro saniyeli metin), s: sanal zaman (Date) }
let sanalAd = "";
async function an(gi, saat) {
  const s = gi === "bugun" ? new Date(Math.floor((B + saat * 60000 * BUGUN_KAT) / 1000) * 1000) : new Date(`${G[gi]}T${saat}:00+03:00`);
  const son = NOKTALAR[NOKTALAR.length - 1];
  if (son && s <= son.s) throw new Error(`Sanal saat geri gidiyor: ${s.toISOString()} <= ${son.s.toISOString()}`);
  if (s > SIMDI) throw new Error(`Sanal saat gelecekte: ${s.toISOString()}`);
  await bekle(4);
  const g = (await sql(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS g`))[0].g;
  await bekle(4);
  NOKTALAR.push({ g, s });
  sanalAd = new Date(s.getTime() + IST).toISOString().slice(0, 16).replace("T", " ");
}

// ---------------------------------------------------------------------------
async function istek(kim, yontem, yol, govde) {
  const r = await fetch(`${API}${yol}`, {
    method: yontem,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${kim.token}` },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const veri = await r.json().catch(() => ({}));
  if (!r.ok) {
    const h = veri.hata || {};
    throw new Error(`${yontem} ${yol} -> ${r.status} ${h.kod || ""} ${h.mesaj || ""}`);
  }
  return veri;
}
const yap = async (ad, kim, yontem, yol, govde) => {
  const v = await istek(kim, yontem, yol, govde);
  console.log(`  ${sanalAd}  ${kim.kisa.padEnd(6)} ${ad}`);
  return v;
};
const baslik = (b) => console.log(`\n=== ${b}`);
const KONTROLLER = []; // matematik kontrolleri: { ad, beklenen, bulunan }
const kontrol = (ad, beklenen, bulunan) => {
  const ok = JSON.stringify(beklenen) === JSON.stringify(bulunan);
  KONTROLLER.push({ ad, ok, beklenen, bulunan });
  console.log(`      ${ok ? "✔" : "✘"} ${ad}: beklenen ${JSON.stringify(beklenen)}, bulunan ${JSON.stringify(bulunan)}`);
};

async function main() {
  // ---------------- Guvenlik: yalnizca bos veritabaninda calisir ----------------
  const dolu = (await sql("SELECT (SELECT count(*) FROM lot) + (SELECT count(*) FROM is_emri) + (SELECT count(*) FROM sevkiyat) AS n"))[0].n;
  if (Number(dolu) > 0) {
    console.log("Veritabaninda zaten lot / is emri / sevkiyat var. Demo verisi yuklenmedi, hicbir sey degismedi.");
    return { yuklendi: false };
  }
  const firmalar = await sql("SELECT id FROM firma");
  if (firmalar.length !== 1) throw new Error(`Tek firma bekleniyordu, ${firmalar.length} bulundu`);

  const kisi = async (kullaniciAdi, kisa, rol) => {
    const k = (await sql("SELECT id, firma_id, ad_soyad, sicil_no, roller FROM kullanici WHERE kullanici_adi = $1 AND aktif", [kullaniciAdi]))[0];
    if (!k) throw new Error(`'${kullaniciAdi}' kullanicisi bulunamadi ya da pasif.`);
    if (!k.roller.includes(rol) && !k.roller.includes("ADMIN")) throw new Error(`'${kullaniciAdi}' kullanicisinin ${rol} rolu yok.`);
    const token = jwt.sign({ sub: k.id, firmaId: k.firma_id, adSoyad: k.ad_soyad, sicilNo: k.sicil_no, roller: k.roller, kiosk: false }, env.jwtSecret, { expiresIn: "2h" });
    return { id: k.id, ad: k.ad_soyad, kisa, token };
  };
  const berra = await kisi("berra", "Berra", "KALITE");
  const said = await kisi("said", "Said", "KALITE");
  const mehmet = await kisi("mehmet", "Mehmet", "SEF");
  const ayse = await kisi("ayse", "Ayşe", "DEPO");
  const ahmet = await kisi("ahmet", "Ahmet", "OPERATOR");

  // Kurulum gunu: tanimlar (seed) bu gunun sabahina tasinir
  const kurulum = (await sql(`SELECT to_char(min(olusturma_zamani) AT TIME ZONE 'UTC' - interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS g FROM firma`))[0].g;
  NOKTALAR.push({ g: kurulum, s: new Date(`${G[7]}T08:00:00+03:00`) });
  await an(7, "09:00");
  console.log(`Demo verisi yukleniyor. Is gunleri: ${[...G].reverse().join(", ")} (bugun ${G[0]})`);

  const t = await istek(berra, "GET", "/tanimlar");
  const bul = (liste, f, ad) => {
    const x = liste.find(f);
    if (!x) throw new Error(`Tanim bulunamadi: ${ad}`);
    return x;
  };
  const malzeme = (kod) => bul(t.malzemeler, (x) => x.kod === kod, kod);
  const makine = (kod) => bul(t.makineler, (x) => x.kod === kod, kod);
  const tedarikci = (bas) => bul(t.tedarikciler, (x) => x.unvan.startsWith(bas), bas);
  const musteri = (bas) => bul(t.musteriler, (x) => x.unvan.startsWith(bas), bas);
  const kts = bul(t.urunler, (x) => x.kod === "KTS-PET-010", "KTS-PET-010");
  const spiral = bul(t.urunler, (x) => x.kod === "PS-PA6-012", "PS-PA6-012");
  const ARC = musteri("Ar"); // Arcelik / Arçelik
  const FORD = musteri("Ford");
  const SIE = musteri("Siemens");
  const EGE = musteri("Ege");
  const kar = (u, asama) => t.karakteristikler.filter((x) => x.urunId === u.id && x.asama === asama).sort((a, b) => a.sira - b.sira);
  const olc = (u, asama, degerler) => {
    const k = kar(u, asama);
    if (k.length !== degerler.length) throw new Error(`${u.kod} ${asama}: ${k.length} karakteristik var, ${degerler.length} deger verildi`);
    return k.map((x, i) => ({ karakteristikId: x.id, deger: degerler[i] }));
  };
  const onayla = (ad, kim, onayId) => yap(ad, kim, "POST", `/onaylar/${onayId}/karar`, { durum: "ONAYLANDI" });
  const isEmri = async (ad, makineKod, u, hedef, onaylayan, ek) => {
    const r = await yap(ad, mehmet, "POST", "/is-emirleri", { urunId: u.id, makineId: makine(makineKod).id, hedefMiktar: hedef, atananId: onaylayan.id, ...ek });
    return { no: r.isEmri.no, onayId: r.onay.id };
  };
  const kabul = (ad, kod, ted, tedLot, ambalajlar, depoYeri, kontrolcu, aciklama) =>
    yap(ad, ayse, "POST", "/hammadde/kabul", {
      malzemeId: malzeme(kod).id, tedarikciId: tedarikci(ted).id, tedarikciLot: tedLot, coaVar: true, ambalajlar, depoYeri, atananId: kontrolcu.id, aciklama,
    });
  const P = (k, i) => k.birimler[i].barkod;

  // ---------------- Kurulum gunu: olcum aletleri ve egitim kayitlari ----------------
  baslik(`Kurulum gunu (${G[7]}): olcum aletleri ve egitimler`);
  await yap("Yeni ölçüm aleti: KMP-03 dijital kumpas", berra, "POST", "/kys/aletler", { kod: "KMP-03", ad: "Dijital kumpas 0-150 mm", konum: "Ekstrüzyon", periyotAy: 12 });
  await yap("KMP-03 kalibrasyon: uygun", berra, "POST", "/kys/aletler/KMP-03/kalibrasyon", { tarih: takvim(-25), sonuc: "UYGUN", sertifikaNo: "KAL-2611-07", yapan: "Akredite kalibrasyon laboratuvarı" });
  await yap("Yeni ölçüm aleti: SM-01 çelik şerit metre", berra, "POST", "/kys/aletler", { kod: "SM-01", ad: "Çelik şerit metre 5 m", konum: "Metraj ve kesim", periyotAy: 12 });
  await yap("SM-01 kalibrasyon: uygun", berra, "POST", "/kys/aletler/SM-01/kalibrasyon", { tarih: takvim(-300), sonuc: "UYGUN", sertifikaNo: "KAL-2601-02", yapan: "İç kalibrasyon (referans metreye karşı)" });
  await an(7, "10:00");
  await yap("Eğitim: Ahmet, ilk parça ve proses ölçümü", berra, "POST", "/kys/egitimler", { kullaniciId: ahmet.id, konu: "İlk parça ve proses ölçümü", tarih: takvim(-40), egitmen: "Berra Karaman", sureSaat: 2, sonuc: "BASARILI", gecerlilikBitis: takvim(325) });
  await yap("Eğitim: Ayşe, mal kabul ve etiketleme", berra, "POST", "/kys/egitimler", { kullaniciId: ayse.id, konu: "Mal kabul, etiketleme ve depo yerleşimi", tarih: takvim(-45), egitmen: "Berra Karaman", sureSaat: 3, sonuc: "BASARILI", gecerlilikBitis: takvim(320) });
  await yap("Eğitim: Said, son kontrol ve karantina kararları", berra, "POST", "/kys/egitimler", { kullaniciId: said.id, konu: "Son kontrol, karantina kararları ve dört göz kuralı", tarih: takvim(-20), egitmen: "Berra Karaman", sureSaat: 3, sonuc: "BASARILI", gecerlilikBitis: takvim(345) });
  await yap("Eğitim: Mehmet, ISO 9001 farkındalık (süresi dolmuş)", berra, "POST", "/kys/egitimler", { kullaniciId: mehmet.id, konu: "ISO 9001 farkındalık", tarih: takvim(-400), egitmen: "Dış eğitmen", sureSaat: 8, sonuc: "BASARILI", gecerlilikBitis: takvim(-35) });

  // =====================================================================================
  // G6: mal kabul + Hikaye 1 (sorunsuz is, OR01, Arcelik)
  // =====================================================================================
  baslik(`${G[6]}: mal kabul ve Hikâye 1 (OR01, sorunsuz iş)`);
  await an(6, "08:10");
  const L1 = await kabul("Mal kabul: PET 4 x 25 kg, Teknofil TF-2611-201", "PET-025", "Teknofil", "TF-2611-201", [25, 25, 25, 25], "YR-D1-R01", berra, "İrsaliye 4471. Tedarikçi sertifikası (CoA) geldi.");
  await an(6, "08:20");
  const L2 = await kabul("Mal kabul: PA6 granül 2 x 25 kg, Anka AP-26-447", "PA6-GR", "Anka", "AP-26-447", [25, 25], "YR-D1-R02", said, "İrsaliye A-1180. Çuvallar sağlam.");
  await an(6, "08:25");
  const L3 = await kabul("Mal kabul: siyah masterbatch 1 x 5 kg, Renkpol RP-0912", "MB-SYH", "Renkpol", "RP-0912", [5], "YR-D1-R02", said, "İrsaliye RP-552.");
  await an(6, "08:30");
  const L4 = await kabul("Mal kabul: PET 2 x 25 kg, Anka AP-PET-033", "PET-025", "Anka", "AP-PET-033", [25, 25], "YR-D1-R02", berra, "İrsaliye A-1181.");
  await an(6, "08:50");
  await yap(`Giriş kontrolü ${L1.lot.no}: kabul`, berra, "POST", `/hammadde/lotlar/${L1.lot.no}/kontrol`, { karar: "KABUL", not: "Çap 0,25 mm ölçüldü, sertifikayla uyumlu." });
  await an(6, "09:00");
  await yap(`Giriş kontrolü ${L2.lot.no}: kabul`, said, "POST", `/hammadde/lotlar/${L2.lot.no}/kontrol`, { karar: "KABUL", not: "Nem ve renk kontrolü uygun." });
  await an(6, "09:05");
  await yap(`Giriş kontrolü ${L3.lot.no}: kabul`, said, "POST", `/hammadde/lotlar/${L3.lot.no}/kontrol`, { karar: "KABUL", not: "Renk numunesi standartla aynı." });
  await an(6, "09:20");
  await yap(`Giriş kontrolü ${L4.lot.no}: RET`, berra, "POST", `/hammadde/lotlar/${L4.lot.no}/kontrol`, {
    karar: "RET", not: "Monofilament çapı 0,25 mm yerine 0,29 mm ölçüldü, sertifikayla uyumsuz. Parti tedarikçiye iade edilecek.",
  });
  const b = (L, i) => L.birimler[i].barkod;

  await an(6, "09:30");
  const S1 = await isEmri("İş emri açtı: OR01, 300 m, Arçelik", "OR01", kts, 300, berra, { planlananTarih: G[6], siparisNo: "ARC-2611-031", musteriId: ARC.id, aciklama: "Arçelik çamaşır makinesi kablo demeti için" });
  await an(6, "09:40");
  await onayla(`İş emri ${S1.no} onaylandı`, berra, S1.onayId);
  await an(6, "10:00");
  await yap(`${b(L1, 0)} bobinini OR01 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L1, 0), isEmriNo: S1.no });
  await an(6, "10:05");
  await yap("İşi başlattı", ahmet, "POST", `/is-emirleri/${S1.no}/baslat`);
  await an(6, "10:07");
  await yap(`Bobini makineye okuttu: ${b(L1, 0)}`, ahmet, "POST", `/is-emirleri/${S1.no}/bagla`, { barkod: b(L1, 0) });
  await an(6, "10:20");
  await yap("İlk parça: dış çap 10,02 mm, örgü 12,1 tur/cm, uygun", berra, "POST", `/is-emirleri/${S1.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.02, 12.1]), aletKod: "KMP-01" });
  await an(6, "12:00");
  await yap("Proses ölçümü uygun", ahmet, "POST", `/is-emirleri/${S1.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.05, 12.0]), aletKod: "KMP-01" });
  await an(6, "13:40");
  await yap("Proses ölçümü uygun", ahmet, "POST", `/is-emirleri/${S1.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.03, 12.2]), aletKod: "KMP-01" });
  await an(6, "14:30");
  const T1 = (await yap("Topu bitirdi: 300 m", ahmet, "POST", `/is-emirleri/${S1.no}/top-bitir`, { metraj: 300 })).lot.no;
  await an(6, "14:40");
  const bit1 = await yap("İşi bitirdi: bobinde kalan 1 kg depoya döndü", ahmet, "POST", `/is-emirleri/${S1.no}/bitir`, { iadeler: [{ barkod: b(L1, 0), kalanMiktar: 1 }] });
  kontrol("Hikâye 1: 25 − 1 = 24 kg × 1000 / 80 g/m = beklenen 300 m, üretilen 300 m", [300, 300, "TAMAMLANDI"], [bit1.denge.beklenenMetraj, bit1.denge.uretilenToplam, bit1.durum]);
  await an(6, "15:00");
  await yap(`Şahit numune aldı (1 m): ${T1}`, berra, "POST", `/lotlar/${T1}/numune`, { arsivYeri: "YR-NUM-01" });
  await an(6, "15:20");
  const k1 = await yap("Kesti: 100 + 100 + 99 m (numuneden sonra top 299 m)", ahmet, "POST", `/lotlar/${T1}/kesim`, { parcalar: [100, 100, 99], olcumler: olc(kts, "METRAJ", [10.04]) });
  kontrol("Hikâye 1 kesim: 299 = 100 + 100 + 99, fire 0", [299, 0], [k1.hesap.topMetre, k1.hesap.fire]);
  await an(6, "15:40");
  await yap("Son kontrol: üç parça serbest", berra, "POST", "/kalite/son-kontrol", { lotNo: T1, karar: "SERBEST" });
  await an(6, "16:30");
  await yap("Planlı bakım kaydı: OR02, 30 dk", mehmet, "POST", "/kys/bakimlar", { makineId: makine("OR02").id, tur: "PLANLI", tarih: G[6], yapilan: "Yağlama, rulman ve kayış kontrolü", durusDk: 30 });

  // =====================================================================================
  // G5: Hikaye 2 (ilk parca reddi + malzeme farki), Hikaye 5 uretim, Hikaye 4 is emri acilisi
  // =====================================================================================
  baslik(`${G[5]}: Hikâye 2 (OR03, ilk parça reddi ve malzeme farkı), Hikâye 5 üretimi (OR06)`);
  await an(5, "08:05");
  const L5 = await kabul("Mal kabul: PET 4 x 25 kg, Teknofil TF-2611-215", "PET-025", "Teknofil", "TF-2611-215", [25, 25, 25, 25], "YR-D1-R01", said, "İrsaliye 4502. CoA geldi.");
  await an(5, "08:10");
  const L6 = await kabul("Mal kabul: PET 2 x 25 kg, Teknofil TF-2611-233", "PET-025", "Teknofil", "TF-2611-233", [25, 25], "YR-D1-R01", said, "İrsaliye 4503. CoA geldi.");
  await an(5, "08:30");
  await yap(`Giriş kontrolü ${L5.lot.no}: kabul`, said, "POST", `/hammadde/lotlar/${L5.lot.no}/kontrol`, { karar: "KABUL", not: "Çap 0,25 mm, uygun." });
  await an(5, "08:35");
  await yap(`Giriş kontrolü ${L6.lot.no}: kabul`, said, "POST", `/hammadde/lotlar/${L6.lot.no}/kontrol`, { karar: "KABUL", not: "Çap 0,25 mm, uygun." });
  await an(5, "08:40");
  const S2 = await isEmri("İş emri açtı: OR03, 300 m, Ford", "OR03", kts, 300, said, { planlananTarih: G[5], siparisNo: "FO-77812", musteriId: FORD.id });
  await an(5, "08:45");
  const S4 = await isEmri("İş emri açtı: OR04, 400 m, Arçelik", "OR04", kts, 400, berra, { planlananTarih: G[5], siparisNo: "ARC-2611-034", musteriId: ARC.id });
  await an(5, "08:50");
  const S5 = await isEmri("İş emri açtı: OR06, 200 m, Ege Beyaz Eşya", "OR06", kts, 200, berra, { planlananTarih: G[5], siparisNo: "EGE-5521", musteriId: EGE.id });
  await an(5, "09:00");
  await onayla(`İş emri ${S2.no} onaylandı`, said, S2.onayId);
  await an(5, "09:03");
  await onayla(`İş emri ${S4.no} onaylandı`, berra, S4.onayId);
  await an(5, "09:05");
  await onayla(`İş emri ${S5.no} onaylandı`, berra, S5.onayId);
  await an(5, "09:10");
  await yap("İşi başlattı (OR03)", ahmet, "POST", `/is-emirleri/${S2.no}/baslat`);
  await an(5, "09:12");
  await yap(`Bobini depodan doğrudan makineye okuttu: ${b(L1, 1)}`, ahmet, "POST", `/is-emirleri/${S2.no}/bagla`, { barkod: b(L1, 1) });
  await an(5, "09:25");
  await yap("İlk parça: dış çap 10,6 mm (sınır 10,3) → UYGUN DEĞİL", said, "POST", `/is-emirleri/${S2.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.6, 12.0]), aletKod: "KMP-01" });
  await an(5, "09:50");
  await yap("Ayar düzeltildi, ilk parça 2. denemede uygun (10,05 mm)", said, "POST", `/is-emirleri/${S2.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.05, 12.1]), aletKod: "KMP-01" });
  await an(5, "10:00");
  await yap(`${b(L5, 2)} bobinini OR06 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L5, 2), isEmriNo: S5.no });
  await an(5, "10:05");
  await yap("İşi başlattı (OR06)", ahmet, "POST", `/is-emirleri/${S5.no}/baslat`);
  await an(5, "10:07");
  await yap(`Bobini makineye okuttu: ${b(L5, 2)}`, ahmet, "POST", `/is-emirleri/${S5.no}/bagla`, { barkod: b(L5, 2) });
  await an(5, "10:20");
  await yap("İlk parça uygun (OR06)", berra, "POST", `/is-emirleri/${S5.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.1, 12.0]), aletKod: "KMP-01" });
  await an(5, "11:30");
  await yap("Proses ölçümü uygun (OR03)", ahmet, "POST", `/is-emirleri/${S2.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.04, 12.1]), aletKod: "KMP-01" });
  await an(5, "11:45");
  await yap("Proses ölçümü uygun (OR06, 10,22 mm; sınıra yakın)", ahmet, "POST", `/is-emirleri/${S5.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.22, 12.0]), aletKod: "KMP-01" });
  await an(5, "13:00");
  await yap("Proses ölçümü uygun (OR03)", ahmet, "POST", `/is-emirleri/${S2.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.02, 12.0]), aletKod: "KMP-01" });
  await an(5, "13:15");
  await yap("Proses ölçümü uygun (OR06, 10,26 mm)", ahmet, "POST", `/is-emirleri/${S5.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.26, 12.1]), aletKod: "KMP-01" });
  await an(5, "13:40");
  const T5 = (await yap("Topu bitirdi (OR06): 200 m", ahmet, "POST", `/is-emirleri/${S5.no}/top-bitir`, { metraj: 200 })).lot.no;
  await an(5, "13:50");
  const bit5 = await yap("İşi bitirdi (OR06): bobinde kalan 9 kg depoya döndü", ahmet, "POST", `/is-emirleri/${S5.no}/bitir`, { iadeler: [{ barkod: b(L5, 2), kalanMiktar: 9 }] });
  kontrol("Hikâye 5: 25 − 9 = 16 kg → beklenen 200 m, üretilen 200 m", [200, 200, "TAMAMLANDI"], [bit5.denge.beklenenMetraj, bit5.denge.uretilenToplam, bit5.durum]);
  await an(5, "14:20");
  const T2 = (await yap("Topu bitirdi (OR03): 280 m", ahmet, "POST", `/is-emirleri/${S2.no}/top-bitir`, { metraj: 280 })).lot.no;
  await an(5, "14:30");
  const bit2 = await yap("İşi bitirdi (OR03): bobin tamamen kullanıldı", ahmet, "POST", `/is-emirleri/${S2.no}/bitir`, {});
  kontrol("Hikâye 2: 25 kg → beklenen 312,5 m, üretilen 280 m, fark %10,4 > %3", [312.5, 280, 10.4, "TAMAMLANDI_FARK"], [bit2.denge.beklenenMetraj, bit2.denge.uretilenToplam, bit2.denge.farkYuzde, bit2.durum]);
  await an(5, "14:50");
  await yap("Farkı açıkladı", mehmet, "POST", `/is-emirleri/${S2.no}/fark-aciklamasi`, {
    aciklama: "İlk parça reddedildikten sonra ayar yapılırken bobin başından yaklaşık 2,5 kg tel atıldı ve tartılmadı. 2,5 kg = 31 m; 280 + 31 = 311 m, beklenen 312,5 m ile uyumlu. Operatöre ayar telini tartıp yazması söylendi.",
  });
  await an(5, "15:00");
  await yap(`Şahit numune aldı: ${T5}`, berra, "POST", `/lotlar/${T5}/numune`, { arsivYeri: "YR-NUM-01" });
  await an(5, "15:10");
  const k5 = await yap("Kesti (OR06 topu): 100 + 99 m", ahmet, "POST", `/lotlar/${T5}/kesim`, { parcalar: [100, 99], olcumler: olc(kts, "METRAJ", [10.25]) });
  await an(5, "15:25");
  await yap("Son kontrol: OR06 parçaları serbest", berra, "POST", "/kalite/son-kontrol", { lotNo: T5, karar: "SERBEST" });
  await an(5, "15:40");
  await yap(`Şahit numune aldı: ${T2}`, said, "POST", `/lotlar/${T2}/numune`, { arsivYeri: "YR-NUM-01" });
  await an(5, "15:55");
  const k2 = await yap("Kesti (OR03 topu): 100 + 100 + 79 m", ahmet, "POST", `/lotlar/${T2}/kesim`, { parcalar: [100, 100, 79], olcumler: olc(kts, "METRAJ", [10.03]) });
  kontrol("Hikâye 2 kesim: 279 = 100 + 100 + 79", [279, 0], [k2.hesap.topMetre, k2.hesap.fire]);
  await an(5, "16:10");
  await yap("Son kontrol: OR03 parçaları serbest", said, "POST", "/kalite/son-kontrol", { lotNo: T2, karar: "SERBEST" });
  await an(5, "16:20");
  const sv1 = await yap("Sevkiyat hazırladı: Arçelik, 2 x 100 m (Hikâye 1)", ayse, "POST", "/sevkiyat", { musteriId: ARC.id, urunId: kts.id, siparisNo: "ARC-2611-031", atananId: said.id });
  for (const bk of [P(k1, 0), P(k1, 1)]) await istek(ayse, "POST", `/sevkiyat/${sv1.no}/okut`, { barkod: bk });
  await an(5, "16:30");
  await onayla(`Sevkiyat ${sv1.no} onaylandı`, said, sv1.onay.id);
  await an(5, "16:40");
  await yap("Sevk etti (irsaliye IRS-2611-0101)", ayse, "POST", `/sevkiyat/${sv1.no}/onayla`, { irsaliyeNo: "IRS-2611-0101" });
  await an(5, "16:50");
  await yap(`99 m parçayı rafa koydu: ${P(k1, 2)} → YR-D1-R01`, ayse, "POST", `/birimler/${P(k1, 2)}/yerlestir`, { yerKodu: "YR-D1-R01" });

  // =====================================================================================
  // G4: Hikaye 3 (spiral, iki hammadde) ve Hikaye 4 (OR04: ariza, karantina kararlari)
  // =====================================================================================
  baslik(`${G[4]}: Hikâye 3 (EX01 spiral) ve Hikâye 4 (OR04: arıza ve dört karantina)`);
  await an(4, "08:00");
  await yap("Planlı bakım kaydı: EX01, 60 dk", mehmet, "POST", "/kys/bakimlar", { makineId: makine("EX01").id, tur: "PLANLI", tarih: G[4], yapilan: "Vida ve kovan temizliği, ısıtıcı rezistans ölçümü", kullanilanParca: "J tipi termokupl", durusDk: 60 });
  await an(4, "08:10");
  const S3 = await isEmri("İş emri açtı: EX01 spiral, 200 m, Siemens", "EX01", spiral, 200, said, { planlananTarih: G[4], siparisNo: "SIE-4410", musteriId: SIE.id });
  await an(4, "08:20");
  await onayla(`İş emri ${S3.no} onaylandı`, said, S3.onayId);
  await an(4, "08:30");
  await yap(`${b(L5, 0)} ve ${b(L5, 1)} bobinlerini OR04 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L5, 0), isEmriNo: S4.no });
  await istek(ayse, "POST", "/hammadde/cekis", { barkod: b(L5, 1), isEmriNo: S4.no });
  await an(4, "08:35");
  await yap("İşi başlattı (OR04, planlanan gün dündü)", ahmet, "POST", `/is-emirleri/${S4.no}/baslat`);
  await an(4, "08:37");
  await yap("İki bobini makineye okuttu", ahmet, "POST", `/is-emirleri/${S4.no}/bagla`, { barkod: b(L5, 0) });
  await istek(ahmet, "POST", `/is-emirleri/${S4.no}/bagla`, { barkod: b(L5, 1) });
  await an(4, "08:50");
  await yap("İlk parça uygun (OR04)", berra, "POST", `/is-emirleri/${S4.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [9.98, 12.2]), aletKod: "KMP-01" });
  await an(4, "09:00");
  await yap(`PA6 çuvalı ${b(L2, 0)} ve masterbatch ${b(L3, 0)} EX01 hattına çekildi`, ayse, "POST", "/hammadde/cekis", { barkod: b(L2, 0), isEmriNo: S3.no });
  await istek(ayse, "POST", "/hammadde/cekis", { barkod: b(L3, 0), isEmriNo: S3.no });
  await an(4, "09:10");
  await yap("İşi başlattı (EX01), iki hammaddeyi okuttu", ahmet, "POST", `/is-emirleri/${S3.no}/baslat`);
  await istek(ahmet, "POST", `/is-emirleri/${S3.no}/bagla`, { barkod: b(L2, 0) });
  await istek(ahmet, "POST", `/is-emirleri/${S3.no}/bagla`, { barkod: b(L3, 0) });
  await an(4, "09:30");
  await yap("İlk parça uygun (spiral iç çap 12,02, et 0,81 mm)", said, "POST", `/is-emirleri/${S3.no}/ilk-parca`, { olcumler: olc(spiral, "ILK_PARCA", [12.02, 0.81]), aletKod: "MKR-01" });
  await an(4, "10:30");
  await yap("Proses ölçümü uygun (OR04)", ahmet, "POST", `/is-emirleri/${S4.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.01, 12.0]), aletKod: "KMP-01" });
  await an(4, "10:45");
  const kr1 = await yap("Karantinaya ayırdı: 6 m, örgü sıklığı (H-04)", ahmet, "POST", `/is-emirleri/${S4.no}/karantina`, { hataKodu: "H-04", miktar: 6, not: "Örgü sıklığı 11 tur/cm'e düştü gibi göründü, kalite tekrar ölçsün." });
  await an(4, "11:00");
  await yap("Proses ölçümü uygun (EX01)", ahmet, "POST", `/is-emirleri/${S3.no}/proses-olcum`, { olcumler: olc(spiral, "PROSES", [12.05]), aletKod: "MKR-01" });
  await an(4, "11:20");
  await yap("Duraklattı (OR04): tahrik kayışı koptu", ahmet, "POST", `/is-emirleri/${S4.no}/duraklat`, { gerekce: "Tahrik kayışı koptu, makine durdu." });
  await an(4, "11:25");
  const kr2 = await yap("Karantinaya ayırdı: 5 m, tel kopması (H-05)", ahmet, "POST", `/is-emirleri/${S4.no}/karantina`, { hataKodu: "H-05", miktar: 5, not: "Kayış koptuğu anda teller koptu; makinenin durduğu yerdeki 5 m." });
  await an(4, "12:10");
  await yap("Arıza kaydı: OR04, 45 dk", mehmet, "POST", "/kys/bakimlar", {
    makineId: makine("OR04").id, tur: "ARIZA", tarih: G[4], ariza: "Tahrik kayışı koptu", yapilan: "Kayış değiştirildi, gerginlik ayarlandı, deneme çalıştırması yapıldı", kullanilanParca: "Kayış A-42", durusDk: 45,
  });
  await an(4, "12:15");
  await yap("Devam etti (OR04)", ahmet, "POST", `/is-emirleri/${S4.no}/baslat`);
  await an(4, "12:20");
  await yap("Proses ölçümü uygun (OR04, arızadan sonra)", ahmet, "POST", `/is-emirleri/${S4.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.04, 12.1]), aletKod: "KMP-01" });
  await an(4, "12:40");
  await yap("Proses ölçümü uygun (EX01)", ahmet, "POST", `/is-emirleri/${S3.no}/proses-olcum`, { olcumler: olc(spiral, "PROSES", [12.03]), aletKod: "MKR-01" });
  await an(4, "13:20");
  const T3 = (await yap("Topu bitirdi (EX01): 200 m", ahmet, "POST", `/is-emirleri/${S3.no}/top-bitir`, { metraj: 200 })).lot.no;
  await an(4, "13:30");
  const bit3 = await yap("İşi bitirdi (EX01): PA6'dan 16 kg, masterbatch'ten 4,8 kg depoya döndü", ahmet, "POST", `/is-emirleri/${S3.no}/bitir`, {
    iadeler: [{ barkod: b(L2, 0), kalanMiktar: 16 }, { barkod: b(L3, 0), kalanMiktar: 4.8 }],
  });
  kontrol("Hikâye 3: PA6 9 kg / 45 g/m = 200 m, MB 0,2 kg / 1 g/m = 200 m → beklenen 200, üretilen 200", [200, 200, "TAMAMLANDI"], [bit3.denge.beklenenMetraj, bit3.denge.uretilenToplam, bit3.durum]);
  await an(4, "13:50");
  const kr3 = await yap("Karantinaya ayırdı: 4 m, çap (H-02)", ahmet, "POST", `/is-emirleri/${S4.no}/karantina`, { hataKodu: "H-02", miktar: 4, not: "Dış çap 10,35 mm, sınırın 0,05 mm üstü." });
  await an(4, "14:00");
  await yap("Proses ölçümü uygun (OR04, ayar düzeltildi)", ahmet, "POST", `/is-emirleri/${S4.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.05, 12.0]), aletKod: "KMP-01" });
  await an(4, "14:30");
  const kr4 = await yap("Karantinaya ayırdı: 5 m, renk (H-03)", ahmet, "POST", `/is-emirleri/${S4.no}/karantina`, { hataKodu: "H-03", miktar: 5, not: "Renk tonu farklı görünüyor, ışık kabininde bakılsın." });
  await an(4, "15:10");
  const T4 = (await yap("Topu bitirdi (OR04): 380 m", ahmet, "POST", `/is-emirleri/${S4.no}/top-bitir`, { metraj: 380 })).lot.no;
  await an(4, "15:20");
  const bit4 = await yap(`İşi bitirdi (OR04): ${b(L5, 1)} bobininde kalan 18 kg depoya döndü`, ahmet, "POST", `/is-emirleri/${S4.no}/bitir`, { iadeler: [{ barkod: b(L5, 1), kalanMiktar: 18 }] });
  kontrol("Hikâye 4: 25 + 7 = 32 kg → beklenen 400 m; üretilen 380 top + 20 karantina = 400 m", [400, 400, "TAMAMLANDI"], [bit4.denge.beklenenMetraj, bit4.denge.uretilenToplam, bit4.durum]);
  await an(4, "15:40");
  await yap("Karantina kararı 6 m: olumlu (tekrar ölçüldü)", berra, "POST", `/kalite/karantina/${kr1.karantina.barkod}/karar`, { karar: "OLUMLU", not: "Tekrar ölçüldü: 12,0 tur/cm, uygun. Parça yeni numarayla stoğa girdi." });
  await an(4, "15:43");
  await yap("Karantina kararı 4 m: şartlı kabul", berra, "POST", `/kalite/karantina/${kr3.karantina.barkod}/karar`, { karar: "SARTLI_KABUL", not: "Sapma 0,05 mm. Arçelik kalite biriminin yazılı onayıyla kabul edildi." });
  await an(4, "15:46");
  await yap("Karantina kararı 5 m: hurda", berra, "POST", `/kalite/karantina/${kr2.karantina.barkod}/karar`, { karar: "HURDA", not: "Kopuk teller onarılamaz." });
  console.log(`      5 m renk farkı (${kr4.karantina.barkod}) karar bekliyor`);
  await an(4, "15:50");
  await yap(`Karar bekleyen parçayı karantina alanına koydu: ${kr4.karantina.barkod}`, ayse, "POST", `/birimler/${kr4.karantina.barkod}/yerlestir`, { yerKodu: "YR-KAR" });
  await an(4, "16:00");
  await yap(`Şahit numune aldı: ${T3}`, said, "POST", `/lotlar/${T3}/numune`, { arsivYeri: "YR-NUM-01" });
  await an(4, "16:10");
  const k3 = await yap("Kesti (spiral): 50 + 50 + 50 + 49 m", ahmet, "POST", `/lotlar/${T3}/kesim`, { parcalar: [50, 50, 50, 49], olcumler: olc(spiral, "METRAJ", [12.03, 13.6]) });
  kontrol("Hikâye 3 kesim: 199 = 50 + 50 + 50 + 49", [199, 0], [k3.hesap.topMetre, k3.hesap.fire]);
  await an(4, "16:20");
  await yap("Son kontrol: spiral parçaları serbest", said, "POST", "/kalite/son-kontrol", { lotNo: T3, karar: "SERBEST" });
  await an(4, "16:30");
  const sv2 = await yap("Sevkiyat hazırladı: Ford, 2 x 100 m (Hikâye 2)", ayse, "POST", "/sevkiyat", { musteriId: FORD.id, urunId: kts.id, siparisNo: "FO-77812", atananId: berra.id });
  for (const bk of [P(k2, 0), P(k2, 1)]) await istek(ayse, "POST", `/sevkiyat/${sv2.no}/okut`, { barkod: bk });
  await an(4, "16:40");
  await onayla(`Sevkiyat ${sv2.no} onaylandı`, berra, sv2.onay.id);
  await an(4, "16:45");
  await yap("Sevk etti (IRS-2611-0102)", ayse, "POST", `/sevkiyat/${sv2.no}/onayla`, { irsaliyeNo: "IRS-2611-0102" });
  await an(4, "16:50");
  const sv3 = await yap("Sevkiyat hazırladı: Ege Beyaz Eşya, 100 + 99 m (Hikâye 5)", ayse, "POST", "/sevkiyat", { musteriId: EGE.id, urunId: kts.id, siparisNo: "EGE-5521", atananId: said.id });
  for (const bk of [P(k5, 0), P(k5, 1)]) await istek(ayse, "POST", `/sevkiyat/${sv3.no}/okut`, { barkod: bk });
  await an(4, "17:00");
  await onayla(`Sevkiyat ${sv3.no} onaylandı`, said, sv3.onay.id);
  await an(4, "17:05");
  await yap("Sevk etti (IRS-2611-0103)", ayse, "POST", `/sevkiyat/${sv3.no}/onayla`, { irsaliyeNo: "IRS-2611-0103" });
  await yap(`79 m parçayı rafa koydu: ${P(k2, 2)} → YR-D1-R02`, ayse, "POST", `/birimler/${P(k2, 2)}/yerlestir`, { yerKodu: "YR-D1-R02" });

  // =====================================================================================
  // G3: Hikaye 6 uretimi (OR08), Hikaye 4 kesimi, Siemens sevkiyati, depo isleri
  // =====================================================================================
  baslik(`${G[3]}: Hikâye 6 üretimi (OR08), Hikâye 4 kesimi, Siemens sevkiyatı, yeniden kesim`);
  await an(3, "08:20");
  const S6 = await isEmri("İş emri açtı: OR08, 250 m, Ford", "OR08", kts, 250, berra, { planlananTarih: G[3], siparisNo: "FO-77840", musteriId: FORD.id });
  await an(3, "08:30");
  await onayla(`İş emri ${S6.no} onaylandı`, berra, S6.onayId);
  await an(3, "08:40");
  await yap(`${b(L6, 0)} bobinini OR08 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L6, 0), isEmriNo: S6.no });
  await an(3, "08:45");
  await yap("İşi başlattı (OR08), bobini okuttu", ahmet, "POST", `/is-emirleri/${S6.no}/baslat`);
  await istek(ahmet, "POST", `/is-emirleri/${S6.no}/bagla`, { barkod: b(L6, 0) });
  await an(3, "09:00");
  await yap("İlk parça uygun (OR08)", said, "POST", `/is-emirleri/${S6.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.0, 12.0]), aletKod: "KMP-01" });
  await an(3, "09:10");
  await yap(`Şahit numune aldı: ${T4}`, berra, "POST", `/lotlar/${T4}/numune`, { arsivYeri: "YR-NUM-01" });
  await an(3, "09:30");
  const k4 = await yap("Kesti (OR04 topu): 100 + 100 + 100 + 78 m, 1 m kesim firesi", ahmet, "POST", `/lotlar/${T4}/kesim`, { parcalar: [100, 100, 100, 78], kesimFiresi: 1, olcumler: olc(kts, "METRAJ", [10.02]) });
  kontrol("Hikâye 4 kesim: 379 = 100 + 100 + 100 + 78 + 1 fire", [379, 1], [k4.hesap.topMetre, k4.hesap.fire]);
  await an(3, "09:50");
  await yap("Son kontrol: üç parça serbest", berra, "POST", "/kalite/son-kontrol", { barkodlar: [P(k4, 0), P(k4, 1), P(k4, 2)], karar: "SERBEST" });
  await an(3, "09:55");
  await yap("Son kontrol: 78 m parça karantinada", berra, "POST", "/kalite/son-kontrol", { barkodlar: [P(k4, 3)], karar: "KARANTINA", not: "Yüzeyde ezik şüphesi; ikinci kontrol yapılacak." });
  await an(3, "10:30");
  await yap("Proses ölçümü uygun (OR08)", ahmet, "POST", `/is-emirleri/${S6.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.03, 12.1]), aletKod: "KMP-01" });
  await an(3, "12:10");
  await yap("Proses ölçümü uygun (OR08)", ahmet, "POST", `/is-emirleri/${S6.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.06, 12.0]), aletKod: "KMP-01" });
  await an(3, "13:30");
  const T6 = (await yap("Topu bitirdi (OR08): 250 m", ahmet, "POST", `/is-emirleri/${S6.no}/top-bitir`, { metraj: 250 })).lot.no;
  await an(3, "13:40");
  const bit6 = await yap("İşi bitirdi (OR08): bobinde kalan 5 kg depoya döndü", ahmet, "POST", `/is-emirleri/${S6.no}/bitir`, { iadeler: [{ barkod: b(L6, 0), kalanMiktar: 5 }] });
  kontrol("Hikâye 6: 25 − 5 = 20 kg → beklenen 250 m, üretilen 250 m", [250, 250, "TAMAMLANDI"], [bit6.denge.beklenenMetraj, bit6.denge.uretilenToplam, bit6.durum]);
  await an(3, "14:00");
  const sv4 = await yap("Sevkiyat hazırladı: Siemens, 4 spiral parça 199 m (Hikâye 3)", ayse, "POST", "/sevkiyat", { musteriId: SIE.id, urunId: spiral.id, siparisNo: "SIE-4410", atananId: said.id });
  for (const i of [0, 1, 2, 3]) await istek(ayse, "POST", `/sevkiyat/${sv4.no}/okut`, { barkod: P(k3, i) });
  await an(3, "14:10");
  await onayla(`Sevkiyat ${sv4.no} onaylandı`, said, sv4.onay.id);
  await an(3, "14:20");
  await yap("Sevk etti (IRS-2611-0104)", ayse, "POST", `/sevkiyat/${sv4.no}/onayla`, { irsaliyeNo: "IRS-2611-0104" });
  await an(3, "14:40");
  await yap(`Şahit numune aldı: ${T6}`, said, "POST", `/lotlar/${T6}/numune`, { arsivYeri: "YR-NUM-01" });
  await an(3, "15:00");
  const k6 = await yap("Kesti (OR08 topu): 100 + 100 + 49 m", ahmet, "POST", `/lotlar/${T6}/kesim`, { parcalar: [100, 100, 49], olcumler: olc(kts, "METRAJ", [10.05]) });
  await an(3, "15:15");
  await yap("Son kontrol: OR08 parçaları serbest", said, "POST", "/kalite/son-kontrol", { lotNo: T6, karar: "SERBEST" });
  await an(3, "15:40");
  await yap("OR08 parçalarını rafa koydu (YR-D1-R01)", ayse, "POST", `/birimler/${P(k6, 1)}/yerlestir`, { yerKodu: "YR-D1-R01" });
  await istek(ayse, "POST", `/birimler/${P(k6, 2)}/yerlestir`, { yerKodu: "YR-D1-R01" });
  await an(3, "16:00");
  const bol = await yap(`Yeniden kesim: ${P(k1, 2)} (99 m) → 50 + 49 m`, ayse, "POST", `/lotlar/birim/${P(k1, 2)}/bol`, { parcalar: [50, 49] });
  await an(3, "16:10");
  await yap(`Etiketi yeniden bastı: ${bol.yeniler[0].barkod}`, ayse, "POST", `/birimler/${bol.yeniler[0].barkod}/etiket`, { neden: "Etiket forkliftle yırtıldı." });

  // =====================================================================================
  // G2: Hikaye 6 sevkiyati, Hikaye 5 sikayet + iade + DOF, haksiz sikayet
  // =====================================================================================
  baslik(`${G[2]}: Ford sevkiyatı (Hikâye 6), Ege şikâyeti ve iade (Hikâye 5)`);
  await an(2, "09:00");
  const sv5 = await yap("Sevkiyat hazırladı: Ford, 1 x 100 m (Hikâye 6)", ayse, "POST", "/sevkiyat", { musteriId: FORD.id, urunId: kts.id, siparisNo: "FO-77840", atananId: berra.id });
  await istek(ayse, "POST", `/sevkiyat/${sv5.no}/okut`, { barkod: P(k6, 0) });
  await an(2, "09:10");
  await onayla(`Sevkiyat ${sv5.no} onaylandı`, berra, sv5.onay.id);
  await an(2, "09:20");
  await yap("Sevk etti (IRS-2611-0105)", ayse, "POST", `/sevkiyat/${sv5.no}/onayla`, { irsaliyeNo: "IRS-2611-0105" });
  await an(2, "10:00");
  const sk1 = await yap("Şikâyet açtı: Ege, çap ölçüsü", berra, "POST", "/kys/sikayetler", {
    musteriId: EGE.id, sevkiyatNo: sv3.no, lotNo: T5, konu: "Çap ölçüsü tolerans dışı",
    aciklama: `Ege giriş kontrolünde ${P(k5, 0)} numaralı makarada dış çap 10,4 mm ölçülmüş (sınır 10,3 mm).`,
  });
  await an(2, "10:20");
  await yap(`Müşteri iadesini aldı: ${P(k5, 0)} (100 m) → kendiliğinden karantinaya düştü`, ayse, "POST", "/kalite/musteri-iadesi", { sikayetNo: sk1.no, barkodlar: [P(k5, 0)], neden: "Çap sapması; müşteri makarayı geri gönderdi." });
  await an(2, "10:40");
  const dof1 = (await yap("DÖF açtı (sorumlu Mehmet)", berra, "POST", `/kys/sikayetler/${sk1.no}/dof`, { sorumluId: mehmet.id, termin: gunEkle(G[2], 10) })).dof.no;
  await an(2, "11:30");
  await yap("Kök nedeni ve faaliyeti yazdı", mehmet, "POST", `/kys/doflar/${dof1}/kok-neden`, {
    kokNeden: "OR06 çekme makarası aşınmış; makara yüzeyi teli sıkıştırıp çapı büyütüyor. Proses ölçümlerinde çap 10,22 → 10,26 mm diye yükselmişti, sınıra yaklaşıyordu.",
    faaliyet: "Makara değiştirildi. OR06 için proses ölçüm aralığı 60 dakikaya indirildi. Diğer örgü makinelerinin makaraları kontrol edildi.",
  });
  await an(2, "14:00");
  const sk3 = await yap("Şikâyet açtı: Arçelik, teslimat gecikmesi", berra, "POST", "/kys/sikayetler", { musteriId: ARC.id, konu: "Teslimat geç geldi", aciklama: "Müşteri sevkiyatın bir gün geç geldiğini bildirdi." });
  await an(2, "14:30");
  await yap("Şikâyeti haksız bularak kapattı", berra, "POST", `/kys/sikayetler/${sk3.no}/kapat`, { kapanisNotu: "Teslimat siparişteki tarihte yapılmış; irsaliye ve kargo teslim kaydı müşteriye iletildi.", hakli: false });

  // =====================================================================================
  // G1: geri cagirma (Hikaye 6), kalibrasyon, depo isleri (Hikaye 7), ertesi gunun is emirleri
  // =====================================================================================
  baslik(`${G[1]}: geri çağırma (Hikâye 6), depo işleri (Hikâye 7), kalibrasyon`);
  await an(1, "08:30");
  const S11 = await isEmri("İş emri açtı: OR11, 150 m, Arçelik", "OR11", kts, 150, berra, { planlananTarih: G[0], siparisNo: "ARC-2611-040", musteriId: ARC.id });
  await an(1, "08:40");
  await yap(`İş emri ${S11.no} iptal edildi (silinmez, gerekçesiyle durur)`, mehmet, "POST", `/is-emirleri/${S11.no}/iptal`, { gerekce: "Müşteri siparişi bir sonraki aya erteledi." });
  await an(1, "09:00");
  const cekis = await yap(`${b(L5, 3)} bobininden 10 kg OR10 hattına çekti (bobin bölündü, yeni etiket)`, ayse, "POST", "/hammadde/cekis", { barkod: b(L5, 3), miktar: 10, makineKodu: "OR10" });
  const parcaBobin = cekis.birim.barkod;
  await an(1, "09:30");
  await yap("Arıza kaydı: OR03, 20 dk", mehmet, "POST", "/kys/bakimlar", { makineId: makine("OR03").id, tur: "ARIZA", tarih: G[1], ariza: "Tel kopma sensörü çalışmıyor", yapilan: "Sensör konnektörü temizlendi, kablo yenilendi", durusDk: 20 });
  await an(1, "10:00");
  const ileri = await istek(berra, "GET", `/izlenebilirlik/${L6.lot.no}?yon=ileri`);
  const depodakiler = ileri.dugumler.filter((x) => x.tur === "FG" && ["SERBEST", "DEPODA"].includes(x.durum) && !x.bloke).map((x) => x.barkod);
  const musteride = ileri.dugumler.filter((x) => x.tur === "FG" && x.durum === "SEVK_EDILDI").map((x) => x.barkod);
  kontrol("Geri çağırma: TF-2611-233'ten yapılan parçalar (depoda / müşteride)", [[P(k6, 1), P(k6, 2)].sort(), [P(k6, 0)]], [depodakiler.sort(), musteride]);
  const bl = await yap(`Depodaki ${depodakiler.length} parçayı bloke etti`, berra, "POST", "/kalite/bloke", {
    barkodlar: depodakiler, neden: "Teknofil, TF-2611-233 partisinde lif çapı sapması olabileceğini bildirdi. İnceleme bitene kadar kullanılmayacak. Ford'a giden 100 m makara için müşteri bilgilendirildi.",
  });
  await an(1, "10:10");
  await yap(`Partinin depoda kalan bobinlerini karantinaya aldı: ${L6.lot.no}`, berra, "POST", `/hammadde/lotlar/${L6.lot.no}/kontrol`, { karar: "KARANTINA", not: "Tedarikçi uyarısı (lif çapı). İnceleme sürüyor; üretime çekilmeyecek." });
  await an(1, "10:30");
  await yap("Kalibrasyon: SM-01 uygun değil → kullanım dışı", said, "POST", "/kys/aletler/SM-01/kalibrasyon", { tarih: G[1], sonuc: "UYGUN_DEGIL", aciklama: "5 m'de 3 mm sapma. Alet kullanım dışı bırakıldı, yenisi sipariş edildi.", yapan: "İç kalibrasyon (referans metreye karşı)" });
  await an(1, "11:00");
  await yap("İç denetim DÖF'ü açtı (sorumlu Mehmet)", berra, "POST", "/kys/doflar", {
    kaynak: "IC_DENETIM", problem: "Metraj alanında kalibrasyon etiketi olmayan şerit metre (SM-01) kullanılıyor.", sorumluId: mehmet.id, termin: gunEkle(G[1], 14),
  });
  await an(1, "11:30");
  await yap(`Hattan iade: ${parcaBobin} (10 kg) OR10'da kullanılmadan depoya döndü`, ayse, "POST", "/hammadde/iade", { barkod: parcaBobin, depoYeri: "YR-D1-R02" });
  await an(1, "13:00");
  await yap(`Doğrudan hurda: ${b(L5, 3)} bobininden 2 kg`, berra, "POST", "/kalite/hurda", { barkod: b(L5, 3), miktar: 2, neden: "Ambalaj yırtılmış, bobinin dış katları nem almış." });
  await an(1, "14:00");
  await yap("DÖF'ü tamamladı", mehmet, "POST", `/kys/doflar/${dof1}/tamamla`, { not: "Makara değiştirildi; iki gündür OR06'da 60 dakikada bir ölçülüyor, çap 10,0-10,1 mm." });
  await an(1, "14:30");
  await yap(`İade parçaya karar: RET (${P(k5, 0)})`, said, "POST", "/kalite/son-kontrol", { barkodlar: [P(k5, 0)], karar: "RET", not: "Çap sapması doğrulandı (10,4 mm). Parça hurdaya ayrıldı." });
  await an(1, "16:00");
  const S8a = await isEmri("İş emri açtı: OR02, 600 m, Arçelik (yarın)", "OR02", kts, 600, berra, { planlananTarih: G[0], siparisNo: "ARC-2611-036", musteriId: ARC.id });
  await an(1, "16:05");
  const S8b = await isEmri("İş emri açtı: OR05, 500 m, Ford (yarın)", "OR05", kts, 500, said, { planlananTarih: G[0], siparisNo: "FO-77851", musteriId: FORD.id });
  await an(1, "16:10");
  const S8c = await isEmri("İş emri açtı: OR07, 250 m, Ege (yarın)", "OR07", kts, 250, berra, { planlananTarih: G[0], siparisNo: "EGE-5530", musteriId: EGE.id });
  await an(1, "16:20");
  await onayla(`İş emri ${S8a.no} onaylandı`, berra, S8a.onayId);
  await an(1, "16:22");
  await onayla(`İş emri ${S8c.no} onaylandı`, berra, S8c.onayId);
  await an(1, "16:30");
  await onayla(`İş emri ${S8b.no} onaylandı`, said, S8b.onayId);

  // =====================================================================================
  // G0 (bugun): Hikaye 8, bekleyen onaylar, DOF dogrulama, tedarikci degerlendirme
  // =====================================================================================
  baslik(`${G[0]} (bugün): Hikâye 8, bekleyen onaylar`);
  await an("bugun", 0);
  await yap(`${b(L1, 3)} ve ${b(L5, 1)} bobinlerini OR02 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L1, 3), isEmriNo: S8a.no });
  await istek(ayse, "POST", "/hammadde/cekis", { barkod: b(L5, 1), isEmriNo: S8a.no });
  await an("bugun", 5);
  await yap("İşi başlattı (OR02), iki bobini okuttu", ahmet, "POST", `/is-emirleri/${S8a.no}/baslat`);
  await istek(ahmet, "POST", `/is-emirleri/${S8a.no}/bagla`, { barkod: b(L1, 3) });
  await istek(ahmet, "POST", `/is-emirleri/${S8a.no}/bagla`, { barkod: b(L5, 1) });
  await an("bugun", 20);
  await yap("İlk parça uygun (OR02)", berra, "POST", `/is-emirleri/${S8a.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.03, 12.0]), aletKod: "KMP-01" });
  await an("bugun", 30);
  await yap(`${b(L5, 3)} bobinini (13 kg) OR05 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L5, 3), isEmriNo: S8b.no });
  await an("bugun", 35);
  await yap("İşi başlattı (OR05), bobini okuttu", ahmet, "POST", `/is-emirleri/${S8b.no}/baslat`);
  await istek(ahmet, "POST", `/is-emirleri/${S8b.no}/bagla`, { barkod: b(L5, 3) });
  await an("bugun", 50);
  await yap("İlk parça uygun (OR05)", said, "POST", `/is-emirleri/${S8b.no}/ilk-parca`, { olcumler: olc(kts, "ILK_PARCA", [10.08, 12.1]), aletKod: "KMP-01" });
  await an("bugun", 110);
  await yap("Proses ölçümü uygun (OR02)", ahmet, "POST", `/is-emirleri/${S8a.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.02, 12.1]), aletKod: "KMP-01" });
  await an("bugun", 150);
  const pr8 = await yap("Proses ölçümü (OR05): dış çap 10,5 mm, sınır 10,3 → iş kendiliğinden durdu", ahmet, "POST", `/is-emirleri/${S8b.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.5, 12.0]), aletKod: "KMP-01" });
  kontrol("Hikâye 8: sınır dışı ölçümden sonra OR05 durumu", "DURAKLATILDI", pr8.durum);
  await an("bugun", 155);
  const kr8 = await yap("Şüpheli kısmı karantinaya ayırdı: 6 m (H-02)", ahmet, "POST", `/is-emirleri/${S8b.no}/karantina`, { hataKodu: "H-02", miktar: 6, not: "Son uygun ölçümden bu yana üretilen kısım; çap 10,5 mm." });
  await an("bugun", 170);
  await yap(`${b(L1, 2)} bobinini OR07 hattına çekti`, ayse, "POST", "/hammadde/cekis", { barkod: b(L1, 2), isEmriNo: S8c.no });
  await an("bugun", 175);
  await yap("İşi başlattı (OR07), bobini okuttu → ilk parça bekleniyor", ahmet, "POST", `/is-emirleri/${S8c.no}/baslat`);
  await istek(ahmet, "POST", `/is-emirleri/${S8c.no}/bagla`, { barkod: b(L1, 2) });
  await an("bugun", 190);
  await yap("Proses ölçümü uygun (OR02)", ahmet, "POST", `/is-emirleri/${S8a.no}/proses-olcum`, { olcumler: olc(kts, "PROSES", [10.04, 12.0]), aletKod: "KMP-01" });
  await an("bugun", 200);
  const T8 = (await yap("Topu bitirdi (OR02): 200 m, iş sürüyor", ahmet, "POST", `/is-emirleri/${S8a.no}/top-bitir`, { metraj: 200 })).lot.no;
  await an("bugun", 215);
  await yap(`Şahit numune aldı: ${T8}`, berra, "POST", `/lotlar/${T8}/numune`, { arsivYeri: "YR-NUM-01" });
  await an("bugun", 230);
  const k8 = await yap("Kesti (OR02 topu): 100 + 99 m → son kontrol bekliyor", ahmet, "POST", `/lotlar/${T8}/kesim`, { parcalar: [100, 99], olcumler: olc(kts, "METRAJ", [10.03]) });
  await an("bugun", 240);
  const L8 = await kabul("Mal kabul: PET 2 x 25 kg, Teknofil TF-2611-262 (kontrol bekliyor)", "PET-025", "Teknofil", "TF-2611-262", [25, 25], "YR-D1-R01", said, "İrsaliye 4560. CoA geldi.");
  await an("bugun", 250);
  const sv6 = await yap("Sevkiyat hazırladı: Arçelik, 3 x 100 m (Hikâye 4) → onay bekliyor", ayse, "POST", "/sevkiyat", { musteriId: ARC.id, urunId: kts.id, siparisNo: "ARC-2611-034", atananId: berra.id });
  for (const i of [0, 1, 2]) await istek(ayse, "POST", `/sevkiyat/${sv6.no}/okut`, { barkod: P(k4, i) });
  await an("bugun", 260);
  const S9 = await isEmri(`İş emri açtı: OR09, 800 m, Arçelik (${YARIN}) → onay bekliyor`, "OR09", kts, 800, berra, { planlananTarih: YARIN, siparisNo: "ARC-2611-041", musteriId: ARC.id });
  await an("bugun", 270);
  await yap("DÖF etkinliğini doğruladı → DÖF kapandı", berra, "POST", `/kys/doflar/${dof1}/dogrula`, { etkili: true, etkinlikNotu: "İki gün boyunca OR06 ölçümlerinde sapma görülmedi (10,0-10,1 mm)." });
  await an("bugun", 275);
  await yap("Ege şikâyetini kapattı", berra, "POST", `/kys/sikayetler/${sk1.no}/kapat`, { kapanisNotu: "DÖF etkili bulundu; iade edilen 100 m makara hurdaya ayrıldı. Müşteriye bilgi verildi." });
  await an("bugun", 285);
  const ay = Number(G[0].slice(5, 7));
  const donem = `${G[0].slice(0, 4)}-Q${Math.ceil(ay / 3)}`;
  for (const [bas, teslimat, belge, aciklama] of [
    ["Teknofil", 95, 90, "Teslimatlar zamanında, sertifikalar eksiksiz. TF-2611-233 uyarısını kendisi bildirdi."],
    ["Anka", 80, 70, "AP-PET-033 partisi çap uygunsuzluğu nedeniyle reddedildi."],
    ["Renkpol", 85, 80, "Tek teslimat, sorunsuz."],
  ]) {
    const ted = tedarikci(bas);
    const on = await istek(berra, "GET", `/kys/tedarikci-degerlendirme/onizleme?tedarikciId=${ted.id}&donem=${donem}`);
    const r = await yap(`Tedarikçi değerlendirme ${ted.unvan}: kalite ${on.kalitePuani} (${on.kabulLot}/${on.lotSayisi} lot), teslimat ${teslimat}, belge ${belge}`, berra, "POST", "/kys/tedarikci-degerlendirme", {
      tedarikciId: ted.id, donem, teslimatPuani: teslimat, belgePuani: belge, aciklama,
    });
    console.log(`      toplam ${r.hesap.toplam} → ${r.hesap.sonuc}`);
  }

  // Ornek numaralar (Surec Akislari sayfasindaki "Demoda gormek icin" baglantilari ve sunum)
  const ornekler = {
    anaAkis: P(k1, 0),
    hammaddeRet: L4.lot.no,
    ariza: "/makineler",
    proses: "/makineler",
    karantina: T4,
    iade: P(k5, 0),
    geriCagirma: L6.lot.no,
    kalibrasyon: "/kys",
  };
  const ozet = {
    gunler: [...G].reverse(),
    hikayeler: {
      "1 Sorunsuz iş (OR01, Arçelik)": { isEmri: S1.no, top: T1, parcalar: k1.birimler.map((x) => x.barkod), yenidenKesim: bol.yeniler.map((x) => x.barkod), sevkiyat: sv1.no },
      "2 İlk parça reddi ve malzeme farkı (OR03, Ford)": { isEmri: S2.no, top: T2, sevkiyat: sv2.no },
      "3 Spiral, iki hammadde (EX01, Siemens)": { isEmri: S3.no, top: T3, sevkiyat: sv4.no },
      "4 Arıza ve dört karantina (OR04, Arçelik)": { isEmri: S4.no, top: T4, karantinalar: [kr1, kr2, kr3, kr4].map((x) => x.karantina.barkod), bekleyenSevkiyat: sv6.no },
      "5 Şikâyet, iade, DÖF (OR06, Ege)": { isEmri: S5.no, top: T5, iadeParca: P(k5, 0), sikayet: sk1.no, dof: dof1 },
      "6 Geri çağırma (OR08, Teknofil TF-2611-233)": { isEmri: S6.no, top: T6, hammaddeLotu: L6.lot.no, bloke: bl.blokeEdilen },
      "7 Depo: bölme, hattan iade, hurda": { bobin: b(L5, 3), bolunenParca: parcaBobin },
      "8 Bugün (OR02 / OR05 / OR07)": { calisan: S8a.no, duran: S8b.no, ilkParcaBekleyen: S8c.no, karantina: kr8.karantina.barkod, sonKontrolBekleyen: k8.birimler.map((x) => x.barkod) },
    },
    onayBekleyenler: { hammadde: L8.lot.no, isEmri: S9.no, sevkiyat: sv6.no },
    reddedilenHammadde: L4.lot.no,
  };
  return { yuklendi: true, ornekler, ozet, berra, mehmet };
}

// ---------------------------------------------------------------------------
// ZAMAN KAYDIRMA: her kaydin zamani, kaydedildigi adimin sanal saatine tasinir.
//   yeni = sanal(adim) + (gercek - gercek(adim))   [adim: kaydin oncesindeki en son nokta]
// Tek islemde (transaction) yapilir; bir hata olursa hicbir sey degismez.
// Yalnizca eklemeye acik tablolarin korumalari (trigger) islem suresince kapatilir, sonunda geri acilir.
// ---------------------------------------------------------------------------
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})/g;

async function zamanKaydir() {
  const noktalar = NOKTALAR.map((n) => ({ g: new Date(n.g).getTime(), gMetin: n.g, s: n.s.getTime() }));
  const ilk = noktalar[0].g;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const son = (await c.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS g`)).rows[0].g;
    const sonMs = new Date(son).getTime();
    const esle = (ms) => {
      if (ms < ilk || ms > sonMs) return null;
      let n = noktalar[0];
      for (const x of noktalar) if (x.g <= ms) n = x;
      return n.s + (ms - n.g);
    };
    await c.query("CREATE TEMP TABLE demo_nokta (g timestamptz, s timestamptz) ON COMMIT DROP");
    await c.query("INSERT INTO demo_nokta SELECT unnest($1::timestamptz[]), unnest($2::timestamptz[])", [
      noktalar.map((n) => n.gMetin), noktalar.map((n) => new Date(n.s).toISOString()),
    ]);
    const tablolar = (await c.query(
      `SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
    )).rows.map((x) => x.relname);
    for (const tb of tablolar) await c.query(`ALTER TABLE public."${tb}" DISABLE TRIGGER USER`);

    // 1) zaman sutunlari
    const sutunlar = (await c.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'timestamp with time zone' AND table_name <> '_migration'
          AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')`,
    )).rows;
    let satir = 0;
    for (const { table_name: tb, column_name: sut } of sutunlar) {
      const r = await c.query(
        `UPDATE public."${tb}" x SET "${sut}" = date_trunc('milliseconds',
            (SELECT n.s + (x."${sut}" - n.g) FROM demo_nokta n WHERE n.g <= x."${sut}" ORDER BY n.g DESC LIMIT 1))
          WHERE x."${sut}" >= $1::timestamptz AND x."${sut}" <= $2::timestamptz`,
        [noktalar[0].gMetin, son],
      );
      satir += r.rowCount;
    }
    // 2) JSON icindeki zamanlar (ornek: topun baslangic saati, karantina karar saati) ve degisiklik izindeki metinler
    const metinSutunlari = (await c.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> '_migration'
          AND (data_type = 'jsonb' OR (table_name = 'degisiklik_izi' AND column_name IN ('eski_deger','yeni_deger','gerekce')))
          AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')`,
    )).rows;
    let metin = 0;
    for (const { table_name: tb, column_name: sut, data_type: tur } of metinSutunlari) {
      const rows = (await c.query(`SELECT ctid::text AS k, "${sut}"::text AS v FROM public."${tb}" WHERE "${sut}"::text ~ '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}'`)).rows;
      for (const r of rows) {
        const yeni = r.v.replace(ISO, (m) => {
          const ms = new Date(m).getTime();
          const y = Number.isNaN(ms) ? null : esle(ms);
          return y === null ? m : new Date(y).toISOString();
        });
        if (yeni !== r.v) {
          await c.query(`UPDATE public."${tb}" SET "${sut}" = $1::${tur === "jsonb" ? "jsonb" : "text"} WHERE ctid = $2::tid`, [yeni, r.k]);
          metin++;
        }
      }
    }
    // 3) degisiklik izi zincirini yeniden hesapla (zaman ve metinler degisti)
    const iz = (await c.query("SELECT * FROM degisiklik_izi ORDER BY firma_id, id")).rows;
    const ids = [];
    const oncekiler = [];
    const ozetler = [];
    let firma = null;
    let onceki = "BASLANGIC";
    for (const x of iz) {
      if (x.firma_id !== firma) {
        firma = x.firma_id;
        onceki = "BASLANGIC";
      }
      const ozet = crypto
        .createHash("sha256")
        .update([onceki, x.firma_id, x.tablo, x.kayit_id, x.alan, x.eski_deger, x.yeni_deger, x.islem, x.kullanici_id, x.zaman.toISOString(), x.gerekce].join("|"))
        .digest("hex");
      ids.push(String(x.id));
      oncekiler.push(onceki);
      ozetler.push(ozet);
      onceki = ozet;
    }
    if (ids.length) {
      await c.query(
        `UPDATE degisiklik_izi d SET onceki_ozet = v.o, ozet = v.z
           FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS o, unnest($3::text[]) AS z) v WHERE d.id = v.id`,
        [ids, oncekiler, ozetler],
      );
    }
    for (const tb of tablolar) await c.query(`ALTER TABLE public."${tb}" ENABLE TRIGGER USER`);
    await c.query("COMMIT");
    console.log(`\nZaman kaydirma: ${satir} zaman alani, ${metin} metin/JSON alani, ${ids.length} iz satiri yeniden muhurlendi.`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function calistir() {
  const r = await main();
  if (!r.yuklendi) return r;
  await zamanKaydir();
  await pool.query(`UPDATE firma SET ayarlar = ayarlar || jsonb_build_object('demo', $1::jsonb)`, [
    JSON.stringify({ yuklendi: new Date().toISOString(), surum: 2, ornekler: r.ornekler }),
  ]);

  // ---------------- Son kontrol: denge, zincir, KPI ----------------
  const lotlar = await istek(r.mehmet, "GET", "/lotlar");
  const bozuk = lotlar.filter((x) => !x.denge.tutuyor).map((x) => x.no);
  kontrol("Bütün üretim lotlarında miktar dengesi tutuyor (giriş = dağılım)", [], bozuk);
  const iz = await istek(r.berra, "GET", "/panel/iz-dogrula");
  kontrol("Değişiklik izi zinciri sağlam", true, iz.saglam);
  const zamanlar = (await sql(
    `SELECT min(zaman) AS ilk, max(zaman) AS son, count(*) FILTER (WHERE zaman > now()) AS gelecek FROM olay`,
  ))[0];
  kontrol("Gelecek tarihli olay yok", 0, Number(zamanlar.gelecek));
  const kpi = await istek(r.mehmet, "GET", "/panel/kpi");
  console.log("\nKPI (son 30 gun):");
  for (const g of kpi.gostergeler) console.log(`  ${g.baslik}: ${g.deger ?? "-"} ${g.birim}  (${g.pay} / ${g.payda})`);

  const hatali = KONTROLLER.filter((x) => !x.ok);
  console.log(`\nMatematik kontrolleri: ${KONTROLLER.length - hatali.length} / ${KONTROLLER.length} dogru`);
  console.log("\nOrnek numaralar:");
  console.log(JSON.stringify(r.ozet, null, 2));
  if (hatali.length) throw new Error(`${hatali.length} kontrol tutmadi: ${hatali.map((x) => x.ad).join("; ")}`);
  console.log("\n================ DEMO VERISI YUKLENDI ================");
  return r;
}

module.exports = { calistir };

if (require.main === module) {
  calistir()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(`\nHATA: ${e.message}\nBu ekrani oldugu gibi gonderin.`);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
