const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { getShazamPool } = require('../db');

const router = Router();

// The iMac recognizer posts only when the song changes (~ once every few
// minutes), so this is generous headroom while still capping abuse.
const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// POST /api/shazam
// Ingest a track recognized on the live stream (from the WXDU iMac recognizer).
// Shared-secret gated; writes to plmanager.shazamplaying via a narrowly-scoped
// (INSERT-only) MySQL user. Adrenalin's playlist entry page reads the 5 most
// recent rows.
router.post('/', postLimiter, async (req, res) => {
  try {
    const secret = process.env.SHAZAM_INGEST_SECRET;
    if (!secret || req.get('X-Ingest-Secret') !== secret) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const clip = (v) => (v == null ? '' : String(v)).slice(0, 255).trim();
    const artist = clip(req.body.artist);
    const song = clip(req.body.song);
    const album = clip(req.body.album);
    const label = clip(req.body.label);

    if (!artist || !song) {
      return res.status(400).json({ error: 'artist and song are required' });
    }

    const pool = getShazamPool();
    await pool.query(
      'INSERT INTO shazamplaying (artist, song, album, label) VALUES (?, ?, ?, ?)',
      [artist, song, album, label]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('shazam POST error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
