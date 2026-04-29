const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function initDB() {
  const c = await pool.connect();
  try {
    await c.query("CREATE TABLE IF NOT EXISTS participantes (dni VARCHAR(8) PRIMARY KEY, nombre VARCHAR(200) NOT NULL, telefono VARCHAR(20) NOT NULL, correo VARCHAR(200) NOT NULL, canal VARCHAR(20) DEFAULT 'totem', fecha_registro TIMESTAMP DEFAULT NOW())");
    await c.query("CREATE TABLE IF NOT EXISTS fases (id VARCHAR(50) PRIMARY KEY, nombre VARCHAR(50) NOT NULL, activa BOOLEAN DEFAULT false, cerrada BOOLEAN DEFAULT false, fecha_creacion TIMESTAMP DEFAULT NOW())");
    await c.query("CREATE TABLE IF NOT EXISTS partidos (id VARCHAR(50) PRIMARY KEY, fase_id VARCHAR(50) REFERENCES fases(id) ON DELETE CASCADE, equipo_a VARCHAR(100) NOT NULL, equipo_b VARCHAR(100) NOT NULL, fecha VARCHAR(50), resultado VARCHAR(100) DEFAULT NULL, orden INTEGER DEFAULT 0)");
    await c.query("CREATE TABLE IF NOT EXISTS boletas (id SERIAL PRIMARY KEY, numero VARCHAR(100) NOT NULL, dni VARCHAR(8) REFERENCES participantes(dni), fase_id VARCHAR(50) REFERENCES fases(id), foto_url VARCHAR(500), fecha_registro TIMESTAMP DEFAULT NOW(), UNIQUE(numero), UNIQUE(dni, fase_id))");
    await c.query("CREATE TABLE IF NOT EXISTS apuestas (id SERIAL PRIMARY KEY, dni VARCHAR(8) REFERENCES participantes(dni), partido_id VARCHAR(50) REFERENCES partidos(id), prediccion VARCHAR(100) NOT NULL, puntos INTEGER DEFAULT 0, fecha TIMESTAMP DEFAULT NOW(), UNIQUE(dni, partido_id))");
    console.log('BD OK');
  } finally { c.release(); }
}
module.exports = { pool, initDB };