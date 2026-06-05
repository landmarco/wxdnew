const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

// GET /api/schedule
// Returns the current schedule with one row per time slot, including DJ info.
// Day values: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
router.get('/', async (req, res) => {
  try {
    const pool = getPool();

    const [schedRows] = await pool.query(
      'SELECT * FROM schedules WHERE current = 1 LIMIT 1'
    );
    if (!schedRows.length) {
      return res.status(404).json({ error: 'No current schedule' });
    }
    const schedule = schedRows[0];

    const [slots] = await pool.query(
      `SELECT sd.ID, sd.day, sd.start, sd.end, sd.title,
              u.ID AS userID, u.defdjname, u.deftitle, u.link, u.offsite
       FROM schedule_data sd
       LEFT JOIN users u ON sd.userID = u.ID
       WHERE sd.schedulesID = ?
       ORDER BY sd.day, sd.start`,
      [schedule.ID]
    );

    res.set('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.json({ schedule, slots });
  } catch (err) {
    console.error('schedule error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
