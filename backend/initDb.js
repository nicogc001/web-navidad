import bcrypt from "bcrypt";

export async function initDb(pool) {
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
  stock INT NOT NULL DEFAULT 0,
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

  await ensureAdmin(pool);
}

async function ensureAdmin(pool) {
  const email = process.env.ADMIN_EMAIL || "admin@webnavidad.com";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  const r = await pool.query("SELECT id FROM usuarios WHERE email = $1", [
    email,
  ]);
  if (r.rowCount > 0) return;

  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, 'admin')`,
    ["Administrador", email, hash]
  );

  console.log("✅ Admin creado:", email);
}
