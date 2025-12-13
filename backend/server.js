require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const pool = require("./db");

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Navidad escuchando en ${PORT}`);
});

app.get("/api/db-check", async (req, res) => {
    try {
      const r = await pool.query("SELECT NOW() as now");
      res.json({ ok: true, now: r.rows[0].now });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  