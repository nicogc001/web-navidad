const pool = require("../db");

async function getOfertasActivas() {
  const r = await pool.query(`
    SELECT *
    FROM ofertas
    WHERE activo = true
      AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)
      AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
    ORDER BY id DESC
  `);
  return r.rows;
}

module.exports = {
  getOfertasActivas,
};
