const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

// GET /api/nowplaying
// Returns the most recently logged track from the active show, or 404 if off-air.
router.get('/', async (req, res) => {
  try {
    const pool = getPool();

    const [maxRows] = await pool.query(
      "SELECT MAX(p.ID) AS id FROM playlist p JOIN shows s ON p.showID = s.ID WHERE s.active = 1 AND p.artist <> '*****'"
    );

    const latestId = maxRows[0]?.id;
    if (!latestId) {
      return res.status(404).json({ error: 'Off air' });
    }

    const [rows] = await pool.query(
      'SELECT p.artist, p.song, p.album, p.label FROM playlist p WHERE p.ID = ?',
      [latestId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Off air' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('nowplaying error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
