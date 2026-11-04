// PostgreSQL baglantisi ve transaction yardimcisi.
const { Pool, types } = require("pg");
const env = require("./env");

// numeric kolonlar JS sayisi olarak gelsin (varsayilan: string)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// bigint (count, bigserial) sayi olarak gelsin
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

pool.on("error", (err) => console.error("[DB] beklenmeyen hata:", err.message));

// Bir islemi tek transaction icinde calistirir. Hata olursa her sey geri alinir.
// Ornek: await tx(async (c) => { await c.query(...); await c.query(...); })
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sonuc = await fn(client);
    await client.query("COMMIT");
    return sonuc;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Tek satir donduren kisa yol
async function bir(client, sql, params) {
  const r = await client.query(sql, params);
  return r.rows[0] || null;
}

module.exports = { pool, tx, bir };
