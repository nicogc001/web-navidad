const pool = require("../db");

async function getProductos({ categoria }) {
  const params = [];
  let sql = "SELECT * FROM productos WHERE activo = true";

  if (categoria) {
    params.push(categoria);
    sql += ` AND categoria = $${params.length}`;
  }

  sql += " ORDER BY id DESC";
  const r = await pool.query(sql, params);
  return r.rows;
}

module.exports = {
  getProductos,
};
