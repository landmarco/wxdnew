const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { getFeedbackPool } = require('../db');

const router = Router();

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// POST /api/feedback
// Website/technical feedback for the computing team. POST only — unlike DJ
// requests, feedback is never displayed on the site, so there's no public GET.
router.post('/', postLimiter, async (req, res) => {
  try {
    const pool = getFeedbackPool();

    const text = (req.body.text || '').toString().trim();

    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 2000) return res.status(400).json({ error: 'text too long' });

    const created_at = new Date().toISOString();

    // Parameterized query — user input never concatenated into SQL.
    await pool.query(
      `INSERT INTO feedback (text, created_at) VALUES (?, ?)`,
      [text, created_at]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('feedback POST error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
