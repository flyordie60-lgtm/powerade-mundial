const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fases (
        id VARCHAR(50) PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        activa BOOLEAN DEFAULT false,
        cerrada BOOLEAN DEFAULT false,
        partidos JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS participantes (
        dni VARCHAR(20) PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        tel VARCHAR(50),
        correo VARCHAR(200),
        canal VARCHAR(50) DEFAULT 'totem',
        fecha BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        boletas JSONB DEFAULT '[]',
        apuestas JSONB DEFAULT '{}'
      );
    `);
    console.log('DB initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
