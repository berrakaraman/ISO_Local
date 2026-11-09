// Yedekten geri yukleme. MEVCUT VERININ YERINE yedekteki veri gelir.
//   npm run geri-yukle -- yedekler/iso_20261106_230000.dump --evet
//
// Adimlar: 1) once mevcut durumun yedegi alinir (geri donus icin)  2) yedek geri yuklenir
//          3) degisiklik izi zinciri ve tablo sayilari kontrol edilir.
// API calisiyorsa once durdurun.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const URL_ = process.env.DATABASE_URL;
const KONTEYNER = process.env.DB_KONTEYNER || "iso_postgres";
const dosya = process.argv[2] && path.resolve(process.argv[2]);
const onay = process.argv.includes("--evet");
const var_ = (komut) => spawnSync(komut, ["--version"], { stdio: "ignore" }).status === 0;

if (!dosya || !fs.existsSync(dosya)) {
  console.error("Kullanim: npm run geri-yukle -- <yedek-dosyasi.dump> --evet");
  process.exit(1);
}
if (!onay) {
  console.error(`Bu islem veritabanindaki tum veriyi ${path.basename(dosya)} icindekiyle degistirir.\nEmin iseniz komutun sonuna --evet ekleyin.`);
  process.exit(1);
}

console.log("1) Mevcut durumun yedegi aliniyor...");
const y = spawnSync(process.execPath, [path.join(__dirname, "yedekle.js")], { stdio: "inherit" });
if (y.status !== 0) {
  console.error("Mevcut durum yedeklenemedi, geri yukleme yapilmadi.");
  process.exit(1);
}

console.log("2) Geri yukleniyor...");
const arg = ["--clean", "--if-exists", "--no-owner", "--single-transaction"];
let r;
if (var_("pg_restore")) {
  r = spawnSync("pg_restore", [...arg, "--dbname", URL_, dosya], { stdio: "inherit" });
} else {
  const u = new URL(URL_);
  const ic = `postgres://${u.username}:${u.password}@localhost:5432${u.pathname}`;
  r = spawnSync("docker", ["exec", "-i", KONTEYNER, "pg_restore", ...arg, "--dbname", ic], { input: fs.readFileSync(dosya), stdio: ["pipe", "inherit", "inherit"] });
}
if (r.status !== 0) {
  console.error("Geri yukleme basarisiz. Tek transaction kullanildigi icin veritabani degismedi.");
  process.exit(1);
}

console.log("3) Kontrol ediliyor...");
const { Pool } = require("pg");
const pool = new Pool({ connectionString: URL_ });
(async () => {
  const r1 = await pool.query("SELECT (SELECT count(*) FROM olay) AS olay, (SELECT count(*) FROM birim) AS birim, (SELECT count(*) FROM degisiklik_izi) AS iz");
  console.log(`   olay: ${r1.rows[0].olay}, birim: ${r1.rows[0].birim}, degisiklik izi: ${r1.rows[0].iz}`);
  console.log("Tamam. API'yi baslatin ve Genel Bakis > 'Iz zinciri' kontrolunu calistirin (GET /api/panel/iz-dogrula).");
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
