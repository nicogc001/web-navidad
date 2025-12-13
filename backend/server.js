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
const FRONTEND_DIR = path.join(__dirname, "../frontend");

// ====================
// Middlewares
// ====================
app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====================
// Ensure uploads dir (Render-safe)
// ====================
const UPLOADS_ROOT = path.join(__dirname, "uploads");
const UPLOADS_PRODUCTOS = path.join(UPLOADS_ROOT, "productos");

if (!fs.existsSync(UPLOADS_PRODUCTOS)) {
  fs.mkdirSync(UPLOADS_PRODUCTOS, { recursive: true });
}

// ====================
// Multer (productos)
// ====================
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_PRODUCTOS),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, name + ext);
  },
});

const uploadProducto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Solo se permiten imágenes"));
    }
    cb(null, true);
  },
});

function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  return res.status(400).json({ error: err.message });
}

// ====================
// Auth middleware
// ====================
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Solo administrador" });
  }
  next();
}

// ====================
// Health
// ====================
app.get("/api/health", (_, res) => res.json({ ok: true }));

// ====================
// AUTH
// ====================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email y password obligatorios" });
    }

    const r = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (!r.rowCount) return res.status(401).json({ error: "Credenciales inválidas" });

    const u = r.rows[0];
    if (!u.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

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
    console.error(e);
    res.status(500).json({ error: "Error en login" });
  }
});

// ====================
// PRODUCTOS (PÚBLICO)
// ====================
app.get("/api/productos", async (_, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM productos WHERE activo = true ORDER BY id DESC"
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Error cargando productos" });
  }
});

// ====================
// PRODUCTOS (ADMIN)
// ====================
app.get("/api/admin/productos", requireAuth, requireAdmin, async (_, res) => {
  try {
    const r = await pool.query("SELECT * FROM productos ORDER BY id DESC");
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Error cargando productos admin" });
  }
});

// Crear producto
app.post(
  "/api/productos",
  requireAuth,
  requireAdmin,
  uploadProducto.single("imagen"),
  multerErrorHandler,
  async (req, res) => {
    try {
      const { nombre, descripcion, precio, categoria, stock } = req.body;

      if (!nombre || !precio || !categoria) {
        return res.status(400).json({ error: "nombre, precio y categoria obligatorios" });
      }

      const imagenUrl = req.file ? `/uploads/productos/${req.file.filename}` : null;
      const stockNum = Number.isFinite(Number(stock)) ? Number(stock) : 0;

      const r = await pool.query(
        `INSERT INTO productos
         (nombre, descripcion, precio, imagen_url, categoria, stock, activo)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE)
         RETURNING *`,
        [nombre, descripcion || null, precio, imagenUrl, categoria, stockNum]
      );

      res.status(201).json({ ok: true, producto: r.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error creando producto" });
    }
  }
);

// Eliminar producto
app.delete("/api/productos/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const r = await pool.query(
      "DELETE FROM productos WHERE id = $1 RETURNING id",
      [id]
    );

    if (!r.rowCount) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({ ok: true, deletedId: r.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error eliminando producto" });
  }
});

// ====================
// PEDIDOS (ADMIN)
// ====================
app.post("/api/pedidos", requireAuth, requireAdmin, async (req, res) => {
  const { nombreCliente, telefono, fechaRecogida, observaciones, items } = req.body;

  if (!nombreCliente || !telefono || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Datos de pedido incompletos" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const p = await client.query(
      `INSERT INTO pedidos
       (nombre_cliente, telefono, fecha_recogida, observaciones, creado_por)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [nombreCliente, telefono, fechaRecogida || null, observaciones || null, req.user.id]
    );

    let total = 0;
    for (const it of items) {
      const pr = await client.query(
        "SELECT precio FROM productos WHERE id=$1 AND activo=true",
        [it.productoId]
      );
      if (!pr.rowCount) throw new Error("Producto inválido");

      total += pr.rows[0].precio * it.cantidad;

      await client.query(
        `INSERT INTO pedido_items
         (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES ($1,$2,$3,$4)`,
        [p.rows[0].id, it.productoId, it.cantidad, pr.rows[0].precio]
      );
    }

    await client.query("UPDATE pedidos SET total=$1 WHERE id=$2", [
      total,
      p.rows[0].id,
    ]);

    await client.query("COMMIT");
    res.json({ ok: true, pedidoId: p.rows[0].id, total });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Error creando pedido" });
  } finally {
    client.release();
  }
});

// ====================
// ROOT + 404
// ====================
app.get("/", (_, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((_, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ====================
// START
// ====================
(async () => {
  try {
    await initDb(pool);
    console.log("✅ BD inicializada");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 API Navidad escuchando en ${PORT}`);
    });
  } catch (e) {
    console.error("❌ Error inicializando BD:", e);
    process.exit(1);
  }
})();
