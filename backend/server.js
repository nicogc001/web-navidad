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

// Frontend estático (opcional si lo sirves desde backend)
app.use(express.static(FRONTEND_DIR));

// Sirve imágenes subidas
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Solo se permiten imágenes"));
    }
    cb(null, true);
  },
});

function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  return res.status(400).json({ error: err.message || "Error subiendo archivo" });
}

// ====================
// Auth middleware
// ====================
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET no configurado" });
    }
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
      "SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (!r.rowCount) return res.status(401).json({ error: "Credenciales inválidas" });

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
    console.error("Error login:", e);
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
    console.error("Error GET /api/productos:", e);
    res.status(500).json({ error: "Error cargando productos" });
  }
});

// ====================
// PRODUCTOS (ADMIN)
// ====================
app.get("/api/admin/productos", requireAuth, requireAdmin, async (_, res) => {
  try {
    // incluye activos e inactivos
    const r = await pool.query("SELECT * FROM productos ORDER BY id DESC");
    res.json(r.rows);
  } catch (e) {
    console.error("Error GET /api/admin/productos:", e);
    res.status(500).json({ error: "Error cargando productos admin" });
  }
});

// Crear producto (ADMIN + multipart)
app.post(
  "/api/productos",
  requireAuth,
  requireAdmin,
  uploadProducto.single("imagen"),
  multerErrorHandler,
  async (req, res) => {
    try {
      const { nombre, descripcion, precio, categoria, stock } = req.body || {};

      if (!nombre || !precio || !categoria) {
        return res.status(400).json({ error: "nombre, precio y categoria obligatorios" });
      }

      const imagenUrl = req.file ? `/uploads/productos/${req.file.filename}` : null;

      const precioNum = Number(precio);
      if (!Number.isFinite(precioNum) || precioNum < 0) {
        return res.status(400).json({ error: "Precio inválido" });
      }

      const stockNum = Number(stock);
      const stockFinal = Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : 0;

      const r = await pool.query(
        `INSERT INTO productos
         (nombre, descripcion, precio, imagen_url, categoria, stock, activo)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE)
         RETURNING *`,
        [nombre, descripcion || null, precioNum, imagenUrl, categoria, stockFinal]
      );

      res.status(201).json({ ok: true, producto: r.rows[0] });
    } catch (e) {
      console.error("Error POST /api/productos:", e);
      res.status(500).json({ error: "Error creando producto" });
    }
  }
);

// Actualizar stock (ADMIN)
app.patch("/api/productos/:id/stock", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { stock } = req.body || {};

    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

    const s = Number(stock);
    if (!Number.isFinite(s) || s < 0) return res.status(400).json({ error: "Stock inválido" });

    const r = await pool.query(
      "UPDATE productos SET stock = $1 WHERE id = $2 RETURNING *",
      [Math.floor(s), id]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Producto no encontrado" });

    res.json({ ok: true, producto: r.rows[0] });
  } catch (e) {
    console.error("Error PATCH /api/productos/:id/stock:", e);
    res.status(500).json({ error: "Error actualizando stock" });
  }
});

// “Eliminar” producto (soft delete: activo=false)
app.delete("/api/productos/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

    const r = await pool.query(
      "UPDATE productos SET activo = false WHERE id = $1 RETURNING id",
      [id]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Producto no encontrado" });

    res.json({ ok: true, deletedId: r.rows[0].id });
  } catch (e) {
    console.error("Error DELETE /api/productos/:id:", e);
    res.status(500).json({ error: "Error eliminando producto" });
  }
});

// ====================
// PEDIDOS (PÚBLICO) -> crea pedido y devuelve enlace WhatsApp
// ====================
app.post("/api/pedidos/publico", async (req, res) => {
  const { nombreCliente, telefono, fechaRecogida, observaciones, items } = req.body || {};

  if (!nombreCliente || !telefono) {
    return res.status(400).json({ error: "nombreCliente y telefono son obligatorios" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El pedido debe incluir items" });
  }

  // Validación items
  for (const it of items) {
    const qty = Number(it?.cantidad);
    const id = Number(it?.productoId);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: "Item inválido (productoId/cantidad)" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) crear cabecera
    const pedidoRes = await client.query(
      `INSERT INTO pedidos (nombre_cliente, telefono, fecha_recogida, observaciones, estado, total, creado_por)
       VALUES ($1,$2,$3,$4,'pendiente',0,NULL)
       RETURNING id`,
      [nombreCliente, telefono, fechaRecogida || null, observaciones || null]
    );

    const pedidoId = pedidoRes.rows[0].id;

    // 2) items y total desde DB (precio real)
    let total = 0;
    const lineas = [];

    for (const it of items) {
      const productoId = Number(it.productoId);
      const cantidad = Number(it.cantidad);

      const pr = await client.query(
        `SELECT id, nombre, precio, categoria, stock, activo
         FROM productos
         WHERE id = $1`,
        [productoId]
      );

      if (!pr.rowCount) throw new Error(`Producto no encontrado (id=${productoId})`);
      const p = pr.rows[0];
      if (!p.activo) throw new Error(`Producto inactivo (id=${productoId})`);

      // Stock: si quieres bloquear pedidos con stock insuficiente:
      if (Number(p.stock) < cantidad) {
        throw new Error(`Stock insuficiente para "${p.nombre}" (stock=${p.stock})`);
      }

      const precioUnitario = Number(p.precio);
      total += precioUnitario * cantidad;

      await client.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES ($1,$2,$3,$4)`,
        [pedidoId, productoId, cantidad, precioUnitario]
      );

      lineas.push({ nombre: p.nombre, cantidad, precioUnitario });
    }

    // 3) actualizar total
    await client.query("UPDATE pedidos SET total = $1 WHERE id = $2", [total, pedidoId]);

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      pedidoId,
      total,
      lineas,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("POST /api/pedidos/publico:", e);
    res.status(500).json({ error: e.message || "Error creando pedido" });
  } finally {
    client.release();
  }
});

// ====================
// PEDIDOS (ADMIN)
// ====================
app.post("/api/pedidos", requireAuth, requireAdmin, async (req, res) => {
  const { nombreCliente, telefono, fechaRecogida, observaciones, items } = req.body || {};

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

      const precioUnit = Number(pr.rows[0].precio);
      total += precioUnit * it.cantidad;

      await client.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES ($1,$2,$3,$4)`,
        [p.rows[0].id, it.productoId, it.cantidad, precioUnit]
      );
    }

    await client.query("UPDATE pedidos SET total=$1 WHERE id=$2", [total, p.rows[0].id]);
    await client.query("COMMIT");

    res.json({ ok: true, pedidoId: p.rows[0].id, total });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error POST /api/pedidos:", e);
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
// START (init + parche schema)
// ====================
(async () => {
  try {
    await initDb(pool);

    // Asegurar columna stock (si tu tabla se creó sin stock antes)
    await pool.query(`
      ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;
    `);

    console.log("✅ BD inicializada y esquema actualizado (stock)");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 API Navidad escuchando en ${PORT}`);
    });
  } catch (e) {
    console.error("❌ Error inicializando BD:", e);
    process.exit(1);
  }
})();
