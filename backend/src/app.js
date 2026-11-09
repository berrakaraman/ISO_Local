// Express uygulamasi: tum uclar burada baglanir.
const express = require("express");
const cors = require("cors");
const env = require("./config/env");
const { pool } = require("./config/db");
const { oturum } = require("./middleware/auth");
const { bulunamadi, hataYakala } = require("./middleware/hata");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: env.corsOrigin }));
app.use(require("./lib/deve").deveMiddleware); // cevaplar camelCase

// Saglik kontrolu (oturum gerektirmez)
app.get("/api/saglik", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ durum: "ok", veritabani: "ok", zaman: new Date().toISOString() });
  } catch {
    res.status(503).json({ durum: "hata", veritabani: "baglanamadi" });
  }
});

app.use("/api/auth", require("./routes/auth.routes"));

// Bundan sonraki tum uclar oturum ister
app.use("/api", oturum);
app.use("/api/tanimlar", require("./routes/tanim.routes"));
app.use("/api/hammadde", require("./routes/hammadde.routes"));
app.use("/api/is-emirleri", require("./routes/isemri.routes"));
app.use("/api/lotlar", require("./routes/lot.routes"));
app.use("/api/kalite", require("./routes/kalite.routes"));
app.use("/api/sevkiyat", require("./routes/sevkiyat.routes"));
app.use("/api", require("./routes/izlenebilirlik.routes"));
app.use("/api/panel", require("./routes/panel.routes"));
app.use("/api/onaylar", require("./routes/onay.routes"));
app.use("/api/gecmis", require("./routes/gecmis.routes"));
app.use("/api/kys", require("./routes/kys.routes").router);

app.use(bulunamadi);
app.use(hataYakala);

module.exports = app;
