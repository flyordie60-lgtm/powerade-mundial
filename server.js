require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Trust proxy (necesario en Render/Heroku)
app.set('trust proxy', 1);

// ── Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── Rutas API
app.use('/api', require('./routes/participantes'));
app.use('/api/admin', require('./routes/admin'));

// ── Servir el frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Arrancar servidor
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log('Servidor corriendo en puerto ' + PORT);
    });
  } catch (e) {
    console.error('Error al iniciar:', e);
    process.exit(1);
  }
}

start();
