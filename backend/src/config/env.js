// Ortam degiskenlerini tek yerden okur ve eksikse uygulamayi baslatmaz.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

function zorunlu(ad) {
  const deger = process.env[ad];
  if (!deger) {
    console.error(`\n[HATA] .env dosyasinda ${ad} tanimli degil. .env.example dosyasina bakin.\n`);
    process.exit(1);
  }
  return deger;
}

const env = {
  port: Number(process.env.PORT || 5001),
  databaseUrl: zorunlu("DATABASE_URL"),
  jwtSecret: zorunlu("JWT_SECRET"),
  jwtSure: process.env.JWT_SURE || "12h",
  kioskJwtSure: process.env.KIOSK_JWT_SURE || "10m",
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),
  etiketUrl: process.env.ETIKET_URL || "http://localhost:5173/b",
};

if (env.jwtSecret.length < 32) {
  console.error("\n[HATA] JWT_SECRET en az 32 karakter olmali.\n");
  process.exit(1);
}

module.exports = env;
