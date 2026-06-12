const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { getRequestsPool } = require('../db');

const router = Router();

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// GET /api/requests?limit=20&offset=0
router.get('/', async (req, res) => {
  try {
    const pool = getRequestsPool();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT request_id, text, created_at, user_name, user_screen_name, user_profile_image_url
       FROM request
       ORDER BY request_id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json(rows);
  } catch (err) {
    console.error('requests GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/requests
router.post('/', postLimiter, async (req, res) => {
  try {
    const pool = getRequestsPool();

    const text = (req.body.text || '').toString().trim();
    const user_name = (req.body.user_name || '').toString().trim();
    const email = (req.body.email || '').toString().trim();

    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 500) return res.status(400).json({ error: 'text too long' });
    if (user_name.length > 100) return res.status(400).json({ error: 'user_name too long' });
    if (email.length > 200) return res.status(400).json({ error: 'email too long' });

    const created_at = new Date().toISOString();

    await pool.query(
      `INSERT INTO request
         (tweet_id, in_reply_to_status_id, text, created_at, user_profile_image_url,
          user_screen_name, user_name, user_id, email)
       VALUES (0, 0, ?, ?, '', '', ?, 0, ?)`,
      [text, created_at, user_name, email]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('requests POST error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
