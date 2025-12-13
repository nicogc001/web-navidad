const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const pool = require("./db");
const { initDb } = require("./initDb");

const app = express();

// Si sirves el frontend desde el backend (opcional)
const FRONTEND_DIR = path.join(__dirname, "../frontend");

// --------------------
// Middlewares
// --------------------
app.use(cors());
app.use(express.json());

// Sirve frontend estático (opcional)
app.use(express.static(FRONTEND_DIR));

// Sirve imágenes subidas
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --------------------
// Ensure uploads dir exists (Render-safe)
// --------------------
const UPLOADS_ROOT = path.join(__dirname, "uploads");
const UPLOADS_PRODUCTOS = path.join(UPLOADS_ROOT, "productos");

// Render / Docker: si la carpeta no existe, multer rompe con ENOENT
if (!fs.existsSync(UPLOADS_PRODUCTOS)) {
  fs.mkdirSync(UPLOADS_PRODUCTOS, { recursive: true });
}

// --------------------
// Upload config (productos)
// --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PRODUCTOS);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, name + ext);
  },
});

const uploadProducto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Solo se permiten imágenes"));
    }
    cb(null, true);
  },
});

// Manejo de errores de multer (recomendable)
function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  return res.status(400).json({ error: err.message || "Error subiendo archivo" });
}

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
      [email.trim().toLowerCase()]
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

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// --------------------
// Productos y ofertas (GET públicos)
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
// Crear producto (ADMIN + subida de imagen)
// Content-Type: multipart/form-data
// Fields: nombre, descripcion, precio, categoria, imagen(file)
// --------------------
app.post(
  "/api/productos",
  requireAuth,
  requireAdmin,
  uploadProducto.single("imagen"),
  multerErrorHandler,
  async (req, res) => {
    try {
      const { nombre, descripcion, precio, categoria } = req.body || {};

      if (!nombre || !precio || !categoria) {
        return res.status(400).json({ error: "nombre, precio y categoria son obligatorios" });
      }

      // Guardar ruta pública (NO path del sistema)
      const imagenUrl = req.file ? `/uploads/productos/${req.file.filename}` : null;

      const r = await pool.query(
        `INSERT INTO productos (nombre, descripcion, precio, imagen_url, categoria, activo)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING *`,
        [nombre, descripcion || null, precio, imagenUrl, categoria]
      );

      res.status(201).json({ ok: true, producto: r.rows[0] });
    } catch (e) {
      console.error("Error POST /api/productos:", e);
      res.status(500).json({ error: "Error creando producto" });
    }
  }
);

// --------------------
// Pedidos (solo admin)
// --------------------
app.post("/api/pedidos", requireAuth, requireAdmin, async (req, res) => {
  const { nombreCliente, telefono, fechaRecogida, observaciones, items } = req.body || {};

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

    const pedidoRes = await client.query(
      `INSERT INTO pedidos (nombre_cliente, telefono, fecha_recogida, observaciones, creado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [nombreCliente, telefono, fechaRecogida || null, observaciones || null, req.user.id]
    );

    const pedidoId = pedidoRes.rows[0].id;

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

// --------------------
// Raíz (si sirves frontend desde backend)
// --------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// --------------------
// 404
// --------------------
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// --------------------
// Start
// --------------------
(async () => {
  try {
    await initDb(pool);
    console.log("✅ Tablas verificadas/creadas correctamente");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`API Navidad escuchando en ${PORT}`);
    });
  } catch (e) {
    console.error("❌ Error inicializando BD:", e);
    process.exit(1);
  }
})();
