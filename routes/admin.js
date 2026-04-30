const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin2026';

function authAdmin(req, res, next) {
  const p = req.headers['x-admin-password'];
  if (p !== ADMIN_PASS) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// GET /admin/fases
router.get('/fases', authAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fases ORDER BY created_at');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /admin/fases
router.post('/fases', authAdmin, async (req, res) => {
  try {
    const { nombre, partidos } = req.body;
    await pool.query('UPDATE fases SET cerrada=true WHERE activa=true');
    const id = 'fase_'+Date.now();
    await pool.query('INSERT INTO fases(id,nombre,activa,cerrada,partidos) VALUES($1,$2,true,false,$3)', [id,nombre,JSON.stringify(partidos)]);
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /admin/fases/:id
router.put('/fases/:id', authAdmin, async (req, res) => {
  try {
    const { accion } = req.body;
    if (accion === 'activar') {
      await pool.query('UPDATE fases SET cerrada=true WHERE activa=true');
      await pool.query('UPDATE fases SET activa=true,cerrada=false WHERE id=$1', [req.params.id]);
    } else if (accion === 'cerrar') {
      await pool.query('UPDATE fases SET activa=false,cerrada=true WHERE id=$1', [req.params.id]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /admin/fases/:id
router.delete('/fases/:id', authAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM fases WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /admin/partidos/:id/resultado
router.put('/partidos/:id/resultado', authAdmin, async (req, res) => {
  try {
    const { resultado } = req.body;
    const fases = await pool.query('SELECT * FROM fases');
    for (const f of fases.rows) {
      const partidos = f.partidos;
      const i = partidos.findIndex(p => p.id === req.params.id);
      if (i >= 0) {
        partidos[i].resultado = resultado;
        await pool.query('UPDATE fases SET partidos=$1 WHERE id=$2', [JSON.stringify(partidos), f.id]);
        break;
      }
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /admin/participantes
[router.get('/participantes', authAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM participantes ORDER BY fecha DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
