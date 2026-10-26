const express = require("express");
const cors = require("cors");
require("dotenv").config();

const excelRoutes = require("./routes/excelRoutes");

const app = express();
app.use(express.json());
app.use(cors());

let auditLogs = [];
let users = [
  {
    id: 1,
    username: "said",
    password: "123",
    name: "Said (Kalite Sorumlusu)",
    role: "Kalite Sorumlusu",
  },
  {
    id: 2,
    username: "ahmet",
    password: "123",
    name: "Ahmet Emir Kayhan (Üretim Sorumlusu)",
    role: "Üretim Sorumlusu",
  },
  {
    id: 3,
    username: "operator",
    password: "123",
    name: "Mehmet Yılmaz (Operatör)",
    role: "Operatör",
  },
];

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(
    (u) => u.username === username && u.password === password,
  );
  if (!user)
    return res
      .status(401)
      .json({ error: "Geçersiz kullanıcı adı veya şifre!" });
  res.json({ message: "Giriş başarılı", user });
});

app.use("/api/excel-data", excelRoutes);

app.get("/api/logs", (req, res) => {
  res.json(auditLogs);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`UNELSIS ISO MES Backend ${PORT} portunda çalışıyor.`);
});
