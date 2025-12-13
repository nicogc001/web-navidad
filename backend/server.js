const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const { initDb } = require("./initDb");


const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// --------------------
// Auth middleware
// --------------------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, rol, email, nombre }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== "admin") return res.status(403).json({ error: "Solo administrador" });
  next();
}

// --------------------
// Health & DB check
// --------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/db-check", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
    });
  }
});

// --------------------
// Auth routes
// --------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email y password son obligatorios" });
    }

    const r = await pool.query(
      "SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1",
      [email]
    );

    if (r.rowCount === 0) return res.status(401).json({ error: "Credenciales inválidas" });

    const u = r.rows[0];
    if (!u.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET no configurado en el servidor" });
    }

    const token = jwt.sign(
      { id: u.id, rol: u.rol, email: u.email, nombre: u.nombre },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      ok: true,
      token,
      user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
    });
  } catch (e) {
    console.error("Error /api/auth/login:", e);
    res.status(500).json({ error: "Error en login" });
  }
});

// (Opcional) quién soy
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// --------------------
// Productos y ofertas (pueden ser públicos)
// --------------------
app.get("/api/productos", async (req, res) => {
  try {
    const { categoria } = req.query;

    const params = [];
    let sql = "SELECT * FROM productos WHERE activo = true";

    if (categoria) {
      params.push(categoria);
      sql += ` AND categoria = $${params.length}`;
    }

    sql += " ORDER BY id DESC";

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    console.error("Error /api/productos:", e);
    res.status(500).json({ error: "Error cargando productos" });
  }
});

app.get("/api/ofertas", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT *
      FROM ofertas
      WHERE activo = true
        AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY id DESC
    `);

    res.json(r.rows);
  } catch (e) {
    console.error("Error /api/ofertas:", e);
    res.status(500).json({ error: "Error cargando ofertas" });
  }
});

// --------------------
// Pedidos (solo admin)
// --------------------
app.post("/api/pedidos", requireAuth, requireAdmin, async (req, res) => {
  const { nombreCliente, telefono, fechaRecogida, observaciones, items } = req.body || {};

  // Validaciones mínimas
  if (!nombreCliente || !telefono) {
    return res.status(400).json({ error: "nombreCliente y telefono son obligatorios" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El pedido debe incluir al menos un item" });
  }

  for (const it of items) {
    if (!it?.productoId || !Number.isInteger(it?.cantidad) || it.cantidad <= 0) {
      return res.status(400).json({ error: "Item inválido: productoId y cantidad (>0) obligatorios" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Insert cabecera pedido (con creado_por)
    const pedidoRes = await client.query(
      `INSERT INTO pedidos (nombre_cliente, telefono, fecha_recogida, observaciones, creado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [nombreCliente, telefono, fechaRecogida || null, observaciones || null, req.user.id]
    );

    const pedidoId = pedidoRes.rows[0].id;

    // 2) Insert items (precio desde DB)
    let total = 0;

    for (const it of items) {
      const prodRes = await client.query(
        "SELECT precio FROM productos WHERE id = $1 AND activo = true",
        [it.productoId]
      );

      if (prodRes.rowCount === 0) {
        throw new Error(`Producto no válido o inactivo (id=${it.productoId})`);
      }

      const precioUnitario = Number(prodRes.rows[0].precio);
      total += precioUnitario * it.cantidad;

      await client.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4)`,
        [pedidoId, it.productoId, it.cantidad, precioUnitario]
      );
    }

    // 3) Actualizar total
    await client.query("UPDATE pedidos SET total = $1 WHERE id = $2", [total, pedidoId]);

    await client.query("COMMIT");

    res.status(201).json({ ok: true, pedidoId, total });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error POST /api/pedidos:", e);
    res.status(500).json({ error: e.message || "Error creando pedido" });
  } finally {
    client.release();
  }
});

// (Opcional recomendado) listar pedidos para el panel admin
app.get("/api/pedidos", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nombre_cliente, telefono, fecha_recogida, estado, total, creado_en
       FROM pedidos
       ORDER BY id DESC
       LIMIT 200`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Error GET /api/pedidos:", e);
    res.status(500).json({ error: "Error cargando pedidos" });
  }
});

// --- Raíz simple ---
app.get("/", (req, res) => {
  res.send("Backend Navidad funcionando");
});

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Start
(async () => {
    try {
      await initDb(pool);
      console.log("Tablas verificadas/creadas correctamente");
  
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`API Navidad escuchando en ${PORT}`);
      });
    } catch (e) {
      console.error("❌ Error inicializando BD:", e);
      process.exit(1);
    }
  })();
