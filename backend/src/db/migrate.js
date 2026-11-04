// Migration calistirici.
//   npm run db:migrate           -> uygulanmamis .sql dosyalarini sirayla uygular
//   node src/db/migrate.js --sifirla  -> TUM VERIYI SILER ve semayi bastan kurar (yalnizca yerelde)
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

const KLASOR = path.join(__dirname, "migrations");

// Yalnizca bu kullanicinin (iso) public semasinda olusturdugu tablo, view ve fonksiyonlari siler.
// Semanin kendisine dokunmaz: Homebrew PostgreSQL'de public semasinin sahibi Mac kullanicisidir
// ve "DROP SCHEMA public" yetki hatasi verir. Baska kullanicilarin nesneleri etkilenmez.
async function sifirlaSema(client) {
  await client.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'v'
                  AND pg_get_userbyid(c.relowner) = current_user LOOP
        EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
      END LOOP;
      FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
                  AND pg_get_userbyid(c.relowner) = current_user LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
      END LOOP;
      FOR r IN SELECT p.oid::regprocedure AS imza FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
                WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = current_user AND d.objid IS NULL LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.imza);
      END LOOP;
      FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) = current_user LOOP
        EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.relname);
      END LOOP;
    END $$;`);
}

async function main() {
  const sifirla = process.argv.includes("--sifirla");
  const client = await pool.connect();
  try {
    if (sifirla) {
      if (process.env.NODE_ENV === "production") throw new Error("Uretimde --sifirla kullanilamaz.");
      console.log("! Bu projenin tablolari siliniyor ve bastan kuruluyor...");
      await sifirlaSema(client);
    }

    await client.query(`CREATE TABLE IF NOT EXISTS _migration (
      ad text PRIMARY KEY, uygulama_zamani timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query("SELECT ad FROM _migration");
    const uygulanmis = new Set(rows.map((r) => r.ad));

    const dosyalar = fs.readdirSync(KLASOR).filter((f) => f.endsWith(".sql")).sort();
    let sayi = 0;
    for (const dosya of dosyalar) {
      if (uygulanmis.has(dosya)) continue;
      const sql = fs.readFileSync(path.join(KLASOR, dosya), "utf8");
      process.stdout.write(`-> ${dosya} ... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migration (ad) VALUES ($1)", [dosya]);
        await client.query("COMMIT");
        console.log("tamam");
        sayi++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("HATA");
        throw err;
      }
    }
    console.log(sayi ? `${sayi} migration uygulandi.` : "Veritabani guncel.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n[MIGRATION HATASI]", err.message);
  process.exit(1);
});
