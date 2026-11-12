// Demo verisini silip yeniden yukler. YALNIZCA bu projenin veritabanina dokunur.
//
//   node scripts/demo-sifirla.js          -> KURU CALISMA: ne silinecegini ve neyin korunacagini gosterir, hicbir sey degistirmez
//   node scripts/demo-sifirla.js --evet   -> siler, semayi bastan kurar, tanimlari (seed) yukler, demo verisini yukler
//
// Korunanlar: butun kullanicilar (sifreleri, PIN'leri, rolleri, aktif/pasif durumu aynen geri yazilir),
//             firma kodu, unvani ve firma ayarlari.
// Silinenler: hammadde, is emri, lot, sevkiyat, KYS kayitlari ve gecmisleri (yani demo verisi).
// Yeni eklenen ornek kisiler (ornek: Said) icin yeni sifre uretilir ve bir kez ekrana yazilir.
//
// Guvenlik: Tanimlar ekranindan ornek olmayan bir makine / urun / malzeme / tedarikci / musteri vb. eklenmisse
// (yani gercek tanim girilmisse) hicbir sey yapmadan durur ve bunlari listeler.
// Sunucuda sunucu/demo-sifirla.sh bunu calistirmadan once veritabaninin yedegini alir.
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const KOK = path.join(__dirname, "..");
const bcrypt = require(require.resolve("bcryptjs", { paths: [KOK] }));
const { pool } = require(path.join(KOK, "src/config/db"));
const { sifirlaSema } = require(path.join(KOK, "src/db/migrate"));

const EVET = process.argv.includes("--evet");
const URETIM = process.env.NODE_ENV === "production";
const sql = async (q, p) => (await pool.query(q, p)).rows;

// Ornek tanimlar (seed ve demo bunlari olusturur). Bunlarin disinda bir kayit varsa gercek veri girilmis demektir.
const ORNEK = {
  makine: { alan: "kod", degerler: [...Array.from({ length: 16 }, (_, i) => `OR${String(i + 1).padStart(2, "0")}`), "MS01", "EX01", "MT01"] },
  malzeme: { alan: "kod", degerler: ["PET-025", "PA6-GR", "MB-SYH"] },
  urun: { alan: "kod", degerler: ["KTS-PET-010", "PS-PA6-012"] },
  depo_yeri: { alan: "kod", degerler: ["YR-D1-R01", "YR-D1-R02", "YR-KAR", "YR-NUM-01"] },
  hata_kodu: { alan: "kod", degerler: ["H-01", "H-02", "H-03", "H-04", "H-05", "H-06", "H-07", "H-08"] },
  olcum_aleti: { alan: "kod", degerler: ["KMP-01", "MKR-01", "KMP-02", "KMP-03", "SM-01"] },
  tedarikci: { alan: "unvan", degerler: ["Teknofil Lif", "Anka Polimer", "Renkpol Kimya"] },
  musteri: {
    alan: "unvan",
    degerler: ["Ege Beyaz Esya A.S.", "Siemens Sanayi ve Ticaret A.S.", "Ford Otosan", "Arcelik A.S.", "Ege Beyaz Eşya A.Ş.", "Siemens Sanayi ve Ticaret A.Ş.", "Arçelik A.Ş."],
  },
};
const GEREKLI = { berra: "KALITE", mehmet: "SEF", ayse: "DEPO", ahmet: "OPERATOR" };

function rastgeleSifre() {
  const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (;;) {
    const h = [...crypto.randomBytes(12)].map((x) => A[x % A.length]).join("");
    const s = `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s)) return s;
  }
}
const anahtar = (k) => (k.kullanici_adi ? `ad:${k.kullanici_adi}` : `sicil:${k.sicil_no}`);
const dur = (m) => {
  throw new Error(m);
};

async function main() {
  const db = (await sql("SELECT current_database() AS d, current_user AS u"))[0];
  console.log(`Veritabani: ${db.d} (kullanici ${db.u})`);

  // ---------------- 1) Mevcut durumu oku ----------------
  const firmalar = await sql("SELECT id, kod, unvan, ayarlar FROM firma");
  if (firmalar.length !== 1) dur(`Tek firma bekleniyordu, ${firmalar.length} firma var. Hicbir sey yapilmadi.`);
  const firma = firmalar[0];
  const kisiler = await sql("SELECT kullanici_adi, ad_soyad, sicil_no, sifre_ozeti, pin_ozeti, roller, aktif FROM kullanici WHERE firma_id = $1 ORDER BY olusturma_zamani", [firma.id]);
  const sayilar = (await sql(
    `SELECT (SELECT count(*) FROM lot WHERE tip = 'RM') AS hammadde_lotu, (SELECT count(*) FROM lot WHERE tip = 'FG') AS uretim_lotu,
            (SELECT count(*) FROM is_emri) AS is_emri, (SELECT count(*) FROM sevkiyat) AS sevkiyat, (SELECT count(*) FROM olay) AS olay,
            (SELECT count(*) FROM sikayet) AS sikayet, (SELECT count(*) FROM dof) AS dof, (SELECT count(*) FROM degisiklik_izi) AS degisiklik_izi`,
  ))[0];

  // ---------------- 2) Guvenlik kontrolleri ----------------
  const fazlalar = [];
  for (const [tablo, { alan, degerler }] of Object.entries(ORNEK)) {
    const r = await sql(`SELECT ${alan} AS d FROM ${tablo} WHERE firma_id = $1`, [firma.id]);
    for (const x of r) if (!degerler.includes(x.d)) fazlalar.push(`${tablo}: ${x.d}`);
  }
  for (const [ad, rol] of Object.entries(GEREKLI)) {
    const k = kisiler.find((x) => x.kullanici_adi === ad);
    if (!k) dur(`'${ad}' kullanicisi yok; demo bu kisiyle kayit girer. Hicbir sey yapilmadi.`);
    if (!k.aktif) dur(`'${ad}' kullanicisi pasif; demo bu kisiyle kayit girer. Hicbir sey yapilmadi.`);
    if (!k.roller.includes(rol) && !k.roller.includes("ADMIN")) dur(`'${ad}' kullanicisinin ${rol} rolu yok; demo icin gerekli. Hicbir sey yapilmadi.`);
  }
  const said = kisiler.find((x) => x.kullanici_adi === "said");
  if (said && (!said.aktif || !said.roller.includes("KALITE"))) dur("'said' kullanicisi pasif ya da KALITE rolu yok; demo icin gerekli. Hicbir sey yapilmadi.");

  console.log(`\nFirma: ${firma.kod} - ${firma.unvan}`);
  console.log("\nKORUNACAK kisiler (sifre, PIN, rol ve aktiflik aynen geri yazilir):");
  for (const k of kisiler) console.log(`  ${(k.kullanici_adi || "(kiosk)").padEnd(10)} ${k.ad_soyad.padEnd(18)} [${k.roller.join(", ")}]${k.aktif ? "" : "  (pasif)"}`);
  if (!said) console.log("  + said       Said Kalite        [KALITE]  (YENI; sifresi uretilip asagida yazilacak)");
  console.log("\nKORUNACAK firma ayarlari:", JSON.stringify(Object.fromEntries(Object.entries(firma.ayarlar).filter(([k]) => k !== "demo"))));
  console.log("\nSILINECEK kayitlar (bugunku demo verisi):");
  for (const [k, v] of Object.entries(sayilar)) console.log(`  ${k.padEnd(14)} ${v}`);
  if (fazlalar.length) {
    console.log("\nDURDU: Ornek olmayan tanimlar var (gercek veri girilmis olabilir):");
    for (const f of fazlalar) console.log(`  - ${f}`);
    dur("Bu tanimlar silinmesin diye hicbir sey yapilmadi. Bu listeyi gonderin, birlikte karar verelim.");
  }
  if (!EVET) {
    console.log("\nKURU CALISMA: hicbir sey degismedi. Uygulamak icin ayni komutu --evet ile calistirin.");
    return;
  }

  // ---------------- 3) Sil ve bastan kur ----------------
  console.log("\n1/4 Tablolar siliniyor ve bastan kuruluyor...");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await sifirlaSema(c);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  const calis = (ad, dosya, envEk = {}) => {
    const r = spawnSync(process.execPath, [path.join(KOK, dosya)], { cwd: KOK, env: { ...process.env, ...envEk }, encoding: "utf8" });
    if (r.status !== 0) {
      console.log(r.stdout || "");
      console.error(r.stderr || "");
      dur(`${ad} basarisiz oldu (yukaridaki cikti). Yedekten geri donulebilir.`);
    }
    return r.stdout;
  };
  console.log(calis("Migration", "src/db/migrate.js").trim().split("\n").map((x) => `    ${x}`).join("\n"));
  console.log("2/4 Tanimlar (seed) yukleniyor...");
  // Seed'in yazdigi ornek sifreler kullanilmaz (kisiler asagida eski sifreleriyle geri yazilir); ekrana basilmaz.
  calis("Seed", "src/db/seed.js", { SEED_FIRMA_KODU: firma.kod, SEED_FIRMA_UNVANI: firma.unvan });

  // ---------------- 4) Kisileri geri yaz ----------------
  console.log("3/4 Kisiler eski sifre, PIN ve rolleriyle geri yaziliyor...");
  const yeniFirma = (await sql("SELECT id FROM firma"))[0];
  const yeniKisiler = await sql("SELECT id, kullanici_adi, sicil_no FROM kullanici WHERE firma_id = $1", [yeniFirma.id]);
  const eskiler = new Map(kisiler.map((k) => [anahtar(k), k]));
  for (const k of kisiler) {
    const var_ = yeniKisiler.find((y) => anahtar(y) === anahtar(k));
    if (var_) {
      await pool.query(
        "UPDATE kullanici SET ad_soyad = $1, sicil_no = $2, sifre_ozeti = $3, pin_ozeti = $4, roller = $5, aktif = $6 WHERE id = $7",
        [k.ad_soyad, k.sicil_no, k.sifre_ozeti, k.pin_ozeti, k.roller, k.aktif, var_.id],
      );
    } else {
      await pool.query(
        `INSERT INTO kullanici (firma_id, kullanici_adi, ad_soyad, sicil_no, sifre_ozeti, pin_ozeti, roller, aktif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [yeniFirma.id, k.kullanici_adi, k.ad_soyad, k.sicil_no, k.sifre_ozeti, k.pin_ozeti, k.roller, k.aktif],
      );
    }
  }
  const yeniEklenenler = [];
  for (const y of yeniKisiler) {
    if (eskiler.has(anahtar(y))) continue;
    if (URETIM && y.kullanici_adi) {
      const sifre = rastgeleSifre();
      const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
      await pool.query("UPDATE kullanici SET sifre_ozeti = $1, pin_ozeti = $2 WHERE id = $3", [await bcrypt.hash(sifre, 10), await bcrypt.hash(pin, 10), y.id]);
      yeniEklenenler.push({ ad: y.kullanici_adi, sifre, pin, sicil: y.sicil_no });
    } else {
      yeniEklenenler.push({ ad: y.kullanici_adi, sifre: "(seed'deki ornek sifre)", pin: "-", sicil: y.sicil_no });
    }
  }
  const kontrolSayi = (await sql("SELECT count(*)::int AS n FROM kullanici"))[0].n;
  if (kontrolSayi !== kisiler.length + yeniEklenenler.length) dur(`Kisi sayisi tutmadi: ${kontrolSayi} != ${kisiler.length} + ${yeniEklenenler.length}`);

  // ---------------- 5) Demo verisi ----------------
  console.log("4/4 Demo verisi yukleniyor (API uzerinden, birkac dakika surebilir)...");
  const demo = require("./demo-veri");
  await demo.calistir();

  // Firma ayarlari: demo varsayilan ayarlarla yuklenir, sonra onceki ayarlar geri yazilir (demo bilgisi korunur)
  const eskiAyar = Object.fromEntries(Object.entries(firma.ayarlar).filter(([k]) => k !== "demo"));
  await pool.query("UPDATE firma SET ayarlar = ayarlar || $1::jsonb", [JSON.stringify(eskiAyar)]);

  console.log("\nKisiler eski sifreleriyle korundu. Herkes bir kez yeniden giris yapmali (eski oturumlar gecersiz).");
  if (yeniEklenenler.length) {
    console.log("\nYENI KISI(LER) - bu sifreyi simdi kaydedin, bir daha gosterilmez:");
    for (const y of yeniEklenenler) console.log(`YENI_KISI  ${y.ad}  sifre: ${y.sifre}  sicil: ${y.sicil || "-"}  PIN: ${y.pin}`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(`\nHATA: ${e.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
