// Sunucuyu baslatir:  npm run dev  (dosya degisince kendini yeniden baslatir)
const env = require("./config/env");
const app = require("./app");
const { pool } = require("./config/db");

const sunucu = app.listen(env.port, () => {
  console.log(`API calisiyor: http://localhost:${env.port}/api/saglik`);
});

// Ctrl+C ile duzgun kapanis
for (const sinyal of ["SIGINT", "SIGTERM"]) {
  process.on(sinyal, () => {
    sunucu.close(() => pool.end().then(() => process.exit(0)));
  });
}
