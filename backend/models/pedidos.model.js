const pool = require("../db");

async function crearPedido({ nombre, telefono, fechaRecogida, observaciones, items }) {
  if (!nombre || !telefono || !items || items.length === 0) {
    throw new Error("Datos de pedido incompletos");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Crear pedido
    const pedidoRes = await client.query(
      `INSERT INTO pedidos (nombre_cliente, telefono, fecha_recogida, observaciones)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [nombre, telefono, fechaRecogida || null, observaciones || null]
    );

    const pedidoId = pedidoRes.rows[0].id;

    // 2️⃣ Insertar líneas (ItemPedido)
    for (const item of items) {
      if (!item.productoId || !item.cantidad || !item.precio) {
        throw new Error("Item de pedido inválido");
      }

      await client.query(
        `INSERT INTO pedido_items
         (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4)`,
        [pedidoId, item.productoId, item.cantidad, item.precio]
      );
    }

    await client.query("COMMIT");
    return pedidoId;

  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  crearPedido,
};
