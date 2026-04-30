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
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/participar — acepta tel o telefono
router.post('/participar', upload.single('foto'), async (req, res) => {
  try {
    const { dni, nombre, canal, faseId, boleta, picks } = req.body;
    // Acepta tanto "tel" como "telefono"
    const tel = req.body.tel || req.body.telefono || '';
    const correo = req.body.correo || '';

    if (!dni || !nombre || !faseId || !boleta) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Subir foto a Cloudinary si viene
    let fotoUrl = null;
    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ folder: 'powerade' }, (err, r) => {
            if (err) reject(err); else resolve(r);
          }).end(req.file.buffer);
        });
        fotoUrl = result.secure_url;
      } catch(e) { /* foto opcional */ }
    }

    const parsedPicks = typeof picks === 'string' ? JSON.parse(picks) : picks;

    // Buscar si ya existe el participante
    const { rows: existing } = await pool.query('SELECT * FROM participantes WHERE dni=$1', [dni]);

    if (existing.length) {
      // Participante existente — agregar boleta y apuestas de esta fase
      const part = existing[0];
      const boletas = part.boletas || [];
      const apuestas = part.apuestas || {};

      boletas.push({ numero: boleta, fase_id: faseId, foto: fotoUrl, fecha: Date.now() });
      apuestas[faseId] = parsedPicks;

      await pool.query(
        'UPDATE participantes SET boletas=$1, apuestas=$2 WHERE dni=$3',
        [JSON.stringify(boletas), JSON.stringify(apuestas), dni]
      );
    } else {
      // Nuevo participante
      const boletas = [{ numero: boleta, fase_id: faseId, foto: fotoUrl, fecha: Date.now() }];
      const apuestas = { [faseId]: parsedPicks };

      await pool.query(
        `INSERT INTO participantes (dni, nombre, tel, correo, canal, fecha, boletas, apuestas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [dni, nombre, tel, correo, canal || 'totem', Date.now(), JSON.stringify(boletas), JSON.stringify(apuestas)]
      );
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
