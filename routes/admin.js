const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ── Middleware de autenticación admin
function authAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.body?.password;
  if (pass !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── GET todas las fases
router.get('/fases', authAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.*,
        json_agg(p ORDER BY p.orden) FILTER (WHERE p.id IS NOT NULL) as partidos
      FROM fases f
      LEFT JOIN partidos p ON p.fase_id = f.id
      GROUP BY f.id ORDER BY f.fecha_creacion
    `);
    res.json({ fases: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST crear fase con partidos
router.post('/fases', authAdmin, async (req, res) => {
  const { nombre, partidos } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cerrar fase activa anterior
    await client.query('UPDATE fases SET activa=false, cerrada=true WHERE activa=true AND cerrada=false');
    const fase_id = 'fase_' + Date.now();
    await client.query(
      'INSERT INTO fases (id, nombre, activa, cerrada) VALUES ($1,$2,true,false)',
      [fase_id, nombre]
    );
    for (let i = 0; i < partidos.length; i++) {
      const p = partidos[i];
      await client.query(
        'INSERT INTO partidos (id, fase_id, equipo_a, equipo_b, fecha, orden) VALUES ($1,$2,$3,$4,$5,$6)',
        ['p_' + Date.now() + '_' + i, fase_id, p.equipoA, p.equipoB, p.fecha || '', i]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, fase_id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── PUT ingresar resultado de un partido
router.put('/partidos/:id/resultado', authAdmin, async (req, res) => {
  const { resultado } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE partidos SET resultado=$1 WHERE id=$2', [resultado, req.params.id]);
    await client.query('UPDATE apuestas SET puntos=0 WHERE partido_id=$1', [req.params.id]);
    await client.query(`
      UPDATE apuestas SET puntos=1
      WHERE partido_id=$1 AND prediccion=$2
    `, [req.params.id, resultado]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── PUT cerrar/activar fase
router.put('/fases/:id', authAdmin, async (req, res) => {
  const { accion } = req.body;
  try {
    if (accion === 'cerrar') {
      await pool.query('UPDATE fases SET activa=false, cerrada=true WHERE id=$1', [req.params.id]);
    } else if (accion === 'activar') {
      await pool.query('UPDATE fases SET activa=false, cerrada=true WHERE activa=true');
      await pool.query('UPDATE fases SET activa=true, cerrada=false WHERE id=$1', [req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE eliminar fase
router.delete('/fases/:id', authAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM fases WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET participantes (para exportar)
router.get('/participantes', authAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, 
        COALESCE(SUM(a.puntos),0) as puntos,
        COUNT(DISTINCT b.fase_id) as boletas
      FROM participantes p
      LEFT JOIN apuestas a ON a.dni=p.dni
      LEFT JOIN boletas b ON b.dni=p.dni
      GROUP BY p.dni ORDER BY puntos DESC
    `);
    res.json({ participantes: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET stats dashboard
router.get('/stats', authAdmin, async (req, res) => {
  try {
    const [parts, fases, boletas, resultados] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM participantes'),
      pool.query('SELECT COUNT(*) FROM fases'),
      pool.query('SELECT COUNT(*) FROM boletas'),
      pool.query('SELECT COUNT(*) FROM partidos WHERE resultado IS NOT NULL'),
    ]);
    const faseActiva = await pool.query('SELECT nombre FROM fases WHERE activa=true AND cerrada=false LIMIT 1');
    res.json({
      participantes: parseInt(parts.rows[0].count),
      fases: parseInt(fases.rows[0].count),
      boletas: parseInt(boletas.rows[0].count),
      resultados: parseInt(resultados.rows[0].count),
      fase_activa: faseActiva.rows[0]?.nombre || null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// POST /admin/verificar-boleta
router.post('/verificar-boleta', authAdmin, async (req, res) => {
  try {
    const { dni, numeroBoleta, estado } = req.body;
    if (!dni || !numeroBoleta || !estado) return res.status(400).json({ error: 'Faltan campos' });
    const { rows } = await pool.query('SELECT * FROM participantes WHERE dni=$1', [dni]);
    if (!rows.length) return res.status(404).json({ error: 'Participante no encontrado' });
    const part = rows[0];
    const boletas = (part.boletas || []).map(function(b) {
      if (b.numero === numeroBoleta) b.estado = estado;
      return b;
    });
    await pool.query('UPDATE participantes SET boletas=$1 WHERE dni=$2', [JSON.stringify(boletas), dni]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
