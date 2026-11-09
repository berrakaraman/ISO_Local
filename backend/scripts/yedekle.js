// Veritabani yedegi.
//   npm run yedekle                 -> backend/yedekler/iso_YYYYAAGG_SSDD.dump olusturur, son 30 yedegi tutar
//   YEDEK_KLASORU=/Volumes/USB npm run yedekle   -> baska bir klasore (harici disk / ag surucusu)
//
// Once bilgisayardaki pg_dump denenir; yoksa docker'daki iso_postgres konteynerinin pg_dump'i kullanilir.
// Yedek alindiktan sonra "pg_restore --list" ile okunabilirligi dogrulanir; bozuk yedek "basarili" sayilmaz.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const URL_ = process.env.DATABASE_URL;
if (!URL_) {
  console.error("DATABASE_URL tanimli degil (.env)");
  process.exit(1);
}
const KLASOR = path.resolve(process.env.YEDEK_KLASORU || path.join(__dirname, "../yedekler"));
const SAKLA = Number(process.env.YEDEK_SAYISI || 30);
const KONTEYNER = process.env.DB_KONTEYNER || "iso_postgres";

const var_ = (komut) => spawnSync(komut, ["--version"], { stdio: "ignore" }).status === 0;
const iki = (n) => String(n).padStart(2, "0");

function main() {
  fs.mkdirSync(KLASOR, { recursive: true });
  const t = new Date();
  const ad = `iso_${t.getFullYear()}${iki(t.getMonth() + 1)}${iki(t.getDate())}_${iki(t.getHours())}${iki(t.getMinutes())}${iki(t.getSeconds())}.dump`;
  let dosya = path.join(KLASOR, ad);
  // Ayni saniyede ikinci yedek (ornek: geri yuklemeden hemen once) eskisinin uzerine yazmasin
  for (let i = 2; fs.existsSync(dosya); i++) dosya = path.join(KLASOR, ad.replace(".dump", `_${i}.dump`));

  let r;
  if (var_("pg_dump")) {
    r = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--file", dosya, URL_], { stdio: ["ignore", "inherit", "inherit"] });
  } else if (var_("docker")) {
    // Konteyner icinde calistigi icin adres konteynerin kendisidir
    const u = new URL(URL_);
    const ic = `postgres://${u.username}:${u.password}@localhost:5432${u.pathname}`;
    const out = fs.openSync(dosya, "w");
    r = spawnSync("docker", ["exec", KONTEYNER, "pg_dump", "--format=custom", "--no-owner", ic], { stdio: ["ignore", out, "inherit"] });
    fs.closeSync(out);
  } else {
    console.error("pg_dump bulunamadi ve docker yok. PostgreSQL istemci araclarini kurun (Mac: brew install libpq).");
    process.exit(1);
  }
  if (r.status !== 0) {
    if (fs.existsSync(dosya)) fs.renameSync(dosya, `${dosya}.HATALI`);
    console.error("Yedek alinamadi.");
    process.exit(1);
  }

  // Dogrulama: yedek okunabiliyor mu, tablolar icinde mi?
  const liste = var_("pg_restore")
    ? spawnSync("pg_restore", ["--list", dosya], { encoding: "utf8" })
    : spawnSync("docker", ["exec", "-i", KONTEYNER, "pg_restore", "--list"], { input: fs.readFileSync(dosya), encoding: "utf8" });
  const tablolar = (liste.stdout || "").split("\n").filter((x) => / TABLE DATA /.test(x)).length;
  if (liste.status !== 0 || tablolar < 10) {
    fs.renameSync(dosya, `${dosya}.HATALI`);
    console.error(`Yedek dogrulanamadi (tablo verisi: ${tablolar}).`);
    process.exit(1);
  }
  const boyut = (fs.statSync(dosya).size / 1024 / 1024).toFixed(2);
  console.log(`Yedek alindi: ${dosya}  (${boyut} MB, ${tablolar} tablo verisi dogrulandi)`);

  // Eski yedekleri temizle (yalnizca bu scriptin olusturdugu iso_*.dump dosyalari)
  const eski = fs.readdirSync(KLASOR).filter((f) => /^iso_\d{8}_\d{6}(_\d+)?\.dump$/.test(f)).sort().reverse().slice(SAKLA);
  for (const f of eski) fs.unlinkSync(path.join(KLASOR, f));
  if (eski.length) console.log(`${eski.length} eski yedek silindi (son ${SAKLA} yedek tutulur).`);
}

main();
