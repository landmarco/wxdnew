const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

// Safe subset of user fields — never return password, email (unless published), etc.
const DJ_FIELDS = `
  u.ID, u.defdjname, u.deftitle, u.defsubtitle, u.defothergenre,
  u.defdesc, u.link,
  CASE WHEN u.emailpublish = 1 THEN u.email ELSE NULL END AS email
`;

// GET /api/playlists/current
// Full current playlist: show info, DJ info, and all tracks.
router.get('/current', async (req, res) => {
  try {
    const pool = getPool();

    const [showRows] = await pool.query(
      'SELECT ID, starttime, duration, djname, title, subtitle, genre, othergenre, userID, active FROM shows WHERE active = 1 LIMIT 1'
    );
    if (!showRows.length) {
      return res.status(404).json({ error: 'No active show' });
    }
    const show = showRows[0];

    const [djRows] = await pool.query(
      `SELECT ${DJ_FIELDS} FROM users u WHERE u.ID = ?`,
      [show.userID]
    );

    const [tracks] = await pool.query(
      'SELECT * FROM playlist WHERE showID = ? ORDER BY orderkey',
      [show.ID]
    );

    res.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json({ show, dj: djRows[0] ?? null, tracks });
  } catch (err) {
    console.error('playlists/current error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/playlists/recent?limit=20&offset=0
// List of recent shows (no tracks), newest first.
router.get('/recent', async (req, res) => {
  try {
    const pool = getPool();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT s.ID, s.starttime, s.duration, s.djname, s.title, s.subtitle,
              s.genre, s.othergenre, s.userID,
              u.defdjname, u.link
       FROM shows s
       LEFT JOIN users u ON s.userID = u.ID
       ORDER BY s.starttime DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.set('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err) {
    console.error('playlists/recent error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/playlists/:id
// A specific playlist with tracks and DJ info.
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [showRows] = await pool.query(
      'SELECT ID, starttime, duration, djname, title, subtitle, genre, othergenre, userID, active FROM shows WHERE ID = ?',
      [id]
    );
    if (!showRows.length) return res.status(404).json({ error: 'Not found' });
    const show = showRows[0];

    const [djRows] = await pool.query(
      `SELECT ${DJ_FIELDS} FROM users u WHERE u.ID = ?`,
      [show.userID]
    );

    const [tracks] = await pool.query(
      'SELECT * FROM playlist WHERE showID = ? ORDER BY orderkey',
      [show.ID]
    );

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ show, dj: djRows[0] ?? null, tracks });
  } catch (err) {
    console.error('playlists/:id error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/playlists/dj/:djId?limit=20&offset=0
// All playlists by a specific DJ, newest first.
router.get('/dj/:djId', async (req, res) => {
  try {
    const pool = getPool();
    const djId = parseInt(req.params.djId);
    if (!djId) return res.status(400).json({ error: 'Invalid djId' });

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT ID, starttime, duration, djname, title, subtitle, genre, othergenre
       FROM shows WHERE userID = ? ORDER BY starttime DESC LIMIT ? OFFSET ?`,
      [djId, limit, offset]
    );

    res.set('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err) {
    console.error('playlists/dj error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
