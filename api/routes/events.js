const { Router } = require('express');
const { getTicketsPool } = require('../db');

const router = Router();

const EVENT_FIELDS = `
  e.event_ID, e.location_ID, e.start_date, e.end_date, e.description,
  e.number_of_pub_tix, e.pub_singles_or_pairs,
  e.number_of_dj_tix, e.dj_singles_or_pairs,
  e.callin_status,
  l.name AS location_name, l.city AS location_city, l.url AS location_url
`;

const EVENT_JOIN = 'FROM event e LEFT JOIN location l ON e.location_ID = l.location_ID';

// GET /api/events?all=1
// Returns upcoming events by default (start_date >= today), ordered by start_date.
// Pass ?all=1 to return all events including past ones.
router.get('/', async (req, res) => {
  try {
    const pool = getTicketsPool();
    const all = req.query.all === '1';

    const [rows] = await pool.query(
      `SELECT ${EVENT_FIELDS}
       ${EVENT_JOIN}
       ${all ? '' : 'WHERE e.start_date >= CURDATE()'}
       ORDER BY e.start_date ASC`
    );

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(rows);
  } catch (err) {
    console.error('events GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = getTicketsPool();
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query(
      `SELECT ${EVENT_FIELDS}
       ${EVENT_JOIN}
       WHERE e.event_ID = ?`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(rows[0]);
  } catch (err) {
    console.error('events/:id GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
