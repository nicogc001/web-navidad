import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  const r = await pool.query(
    "SELECT * FROM usuarios WHERE email = $1",
    [email]
  );

  if (r.rowCount === 0) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const u = r.rows[0];
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const token = jwt.sign(
    { id: u.id, rol: u.rol },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token });
});

export default router;
