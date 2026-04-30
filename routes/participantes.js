const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/fase-activa
router.get('/fase-activa', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.*,
        COALESCE(json_agg(p ORDER BY p.orden) FILTER (WHERE p.id IS NOT NULL), '[]') as partidos
      FROM fases f
      LEFT JOIN partidos p ON p.fase_id = f.id
      WHERE f.activa = true AND f.cerrada = false
      GROUP BY f.id
    `);
    if (!rows.length) return res.json({ fase: null });
    res.json({ fase: rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/participante/:dni
router.get('/participante/:dni', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM participantes WHERE dni=$1', [req.params.dni]);
    if (!rows.length) return res.status(404).json({ error: 'DNI no encontrado' });
    res.json({ participante: rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/ranking
router.get('/ranking', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM participantes ORDER BY fecha DESC');
    const fases = await pool.query('SELECT * FROM fases ORDER BY fecha_creacion');
    res.json({ ranking: rows, fases: fases.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/participar
router.post('/participar', upload.single('foto'), async (req, res) => {
  const { dni, nombre, tel, correo, canal, faseId, boleta, picks } = req.body;
  if (!dni || !nombre || !faseId) return res.status(400).json({ error: 'Faltan datos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let foto_url = null;
    if (req.file) {
      const r = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'powerade_boletas' }, (e, r) => e ? reject(e) : resolve(r)).end(req.file.buffer);
      });
      foto_url = r.secure_url;
    }
    const bolObj = { fase_id: faseId, numero: boleta, foto_url, fecha: Date.now() };
    const picksObj = typeof picks === 'string' ? JSON.parse(picks) : picks;
    const exist = await client.query('SELECT * FROM participantes WHERE dni=$1', [dni]);
    if (exist.rows.length) {
      const p = exist.rows[0];
      const newBol = [...p.boletas, bolObj];
      const newApu = { ...p.apuestas, [faseId]: picksObj };
      await client.query('UPDATE participantes SET boletas=$1,apuestas=$2 WHERE dni=$3', [JSON.stringify(newBol), JSON.stringify(newApu), dni]);
    } else {
      await client.query('INSERT INTO participantes(dni,nombre,tel,correo,canal,fecha,boletas,apuestas) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [dni,nombre,tel,correo,canal||'totem',Date.now(),JSON.stringify([bolObj]),JSON.stringify({[faseId]:picksObj})]);
    }
    await client.query('COMMIT');
    res.json({ ok: true, foto_url });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

module.exports = router;
