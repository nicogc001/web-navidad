const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// --- Healthcheck ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// --- DB check (útil para verificar conexión en Render) ---
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

// --- Productos (filtrable por categoria) ---
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

// --- Ofertas activas por fecha ---
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

// --- Crear pedido (cabecera + items) ---
app.post("/api/pedidos", async (req, res) => {
  const { nombre, telefono, fechaRecogida, observaciones, items } = req.body || {};

  // Validaciones mínimas
  if (!nombre || !telefono) {
    return res.status(400).json({ error: "Nombre y teléfono son obligatorios" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El pedido debe incluir al menos un item" });
  }

  // Validar items (mínimo)
  for (const it of items) {
    if (!it?.productoId || !Number.isInteger(it?.cantidad) || it.cantidad <= 0) {
      return res.status(400).json({ error: "Item inválido: productoId y cantidad (>0) obligatorios" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Insert cabecera pedido
    const pedidoRes = await client.query(
      `INSERT INTO pedidos (nombre_cliente, telefono, fecha_recogida, observaciones)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [nombre, telefono, fechaRecogida || null, observaciones || null]
    );

    const pedidoId = pedidoRes.rows[0].id;

    // 2) Insert items. Si no viene precio desde frontend, lo sacamos de DB
    //    (mejor práctica: el precio lo define el servidor)
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
    await client.query(
      "UPDATE pedidos SET total = $1 WHERE id = $2",
      [total, pedidoId]
    );

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      pedidoId,
      total,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error POST /api/pedidos:", e);
    res.status(500).json({ error: e.message || "Error creando pedido" });
  } finally {
    client.release();
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Navidad escuchando en ${PORT}`);
});
