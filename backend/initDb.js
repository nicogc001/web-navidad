async function initDb(pool) {
    // Importante: orden por FKs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'admin',
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio NUMERIC(10,2) NOT NULL,
        imagen_url TEXT,
        categoria TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        creado_en TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ofertas (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        descuento_pct NUMERIC(5,2),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        fecha_inicio DATE,
        fecha_fin DATE,
        creado_en TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        nombre_cliente TEXT NOT NULL,
        telefono TEXT NOT NULL,
        fecha_recogida DATE,
        observaciones TEXT,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        total NUMERIC(10,2) NOT NULL DEFAULT 0,
        creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
        creado_por INT REFERENCES usuarios(id)
      );
    `);
  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedido_items (
        id SERIAL PRIMARY KEY,
        pedido_id INT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        producto_id INT NOT NULL REFERENCES productos(id),
        cantidad INT NOT NULL CHECK (cantidad > 0),
        precio_unitario NUMERIC(10,2) NOT NULL
      );
    `);
  }
  
  module.exports = { initDb };
  