const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

const DJ_SELECT = `
  SELECT u.ID, u.defdjname, u.deftitle, u.defsubtitle, u.defothergenre,
         u.defgenre, u.defdesc, u.link,
         CASE WHEN u.emailpublish = 1 THEN u.email ELSE NULL END AS email
  FROM users u
`;

function parseIntIds(str) {
  return str.split(',').map(s => parseInt(s.trim())).filter(n => Number.isInteger(n) && n > 0);
}

// GET /api/djs
// Supports ?ids=1,2,3 to fetch specific DJs, or ?firstname=X&lastname=Y for name lookup.
// Without params, returns all active DJs.
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    let where = 'WHERE u.active = 1';
    const params = [];

    if (req.query.ids) {
      const ids = parseIntIds(req.query.ids);
      if (!ids.length) return res.status(400).json({ error: 'Invalid ids' });
      where = `WHERE u.ID IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    } else if (req.query.firstname || req.query.lastname) {
      const conditions = ['u.active = 1'];
      if (req.query.firstname) {
        conditions.push('LOWER(u.firstname) = LOWER(?)');
        params.push(req.query.firstname.trim());
      }
      if (req.query.lastname) {
        conditions.push('LOWER(u.lastname) = LOWER(?)');
        params.push(req.query.lastname.trim());
      }
      where = 'WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await pool.query(
      `${DJ_SELECT} ${where} ORDER BY u.defgenre, u.defdjname`,
      params
    );

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(rows);
  } catch (err) {
    console.error('djs error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/djs/:id
// Supports comma-separated IDs: /api/djs/1,2,3
// Single ID returns an object; multiple IDs return an array.
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const ids = parseIntIds(req.params.id);
    if (!ids.length) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query(
      `${DJ_SELECT} WHERE u.ID IN (${ids.map(() => '?').join(',')})`,
      ids
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(ids.length === 1 ? rows[0] : rows);
  } catch (err) {
    console.error('djs/:id error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
