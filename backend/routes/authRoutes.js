const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email y password son obligatorios" });
    }

    const r = await pool.query(
      "SELECT id, email, password_hash, rol, activo, nombre FROM usuarios WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (r.rowCount === 0) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const u = r.rows[0];

    if (!u.activo) {
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "JWT_SECRET no configurado" });
    }

    const token = jwt.sign(
      { id: u.id, rol: u.rol, email: u.email },
      secret,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol }
    });
  } catch (e) {
    console.error("Error login:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;
