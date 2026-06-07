const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

// GET /api/djs
// List of all active DJs. Never returns passwords or private emails.
router.get('/', async (req, res) => {
  try {
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT u.ID, u.defdjname, u.deftitle, u.defsubtitle, u.defothergenre,
              u.defdesc, u.link,
              CASE WHEN u.emailpublish = 1 THEN u.email ELSE NULL END AS email
       FROM users u
       WHERE u.active = 1
       ORDER BY u.defgenre, u.defdjname`
    );

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(rows);
  } catch (err) {
    console.error('djs error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/djs/:id
// A single DJ's public profile.
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query(
      `SELECT u.ID, u.defdjname, u.deftitle, u.defsubtitle, u.defothergenre,
              u.defdesc, u.link,
              CASE WHEN u.emailpublish = 1 THEN u.email ELSE NULL END AS email
       FROM users u
       WHERE u.ID = ?`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(rows[0]);
  } catch (err) {
    console.error('djs/:id error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
