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

// Every column of shazamplaying, in a fixed order, so the read endpoints are a
// faithful dump of the table rather than a hand-picked subset. Listed
// explicitly (not SELECT *) so adding a column later is a deliberate change
// here rather than a silent change in the API's response shape.
const COLUMNS = 'id, created, artist, song, album, label';

// POST /api/shazam
// Ingest a track recognized on the live stream (from the WXDU iMac recognizer).
// Shared-secret gated; writes to plmanager.shazamplaying via a narrowly-scoped
// MySQL user. Adrenalin's playlist entry page reads the 5 most recent rows.
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

// GET /api/shazam/latest
// The single most recent recognized track, all columns. 404 when the table is
// empty (same shape as /api/nowplaying when off air).
router.get('/latest', async (req, res) => {
  try {
    const pool = getShazamPool();
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM shazamplaying ORDER BY id DESC LIMIT 1`
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No tracks recognized yet' });
    }

    // The recognizer posts on song change, so this is stale within seconds of a
    // new track — keep the shared cache window short.
    res.set('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.json(rows[0]);
  } catch (err) {
    console.error('shazam latest error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/shazam
// Dump of the shazamplaying table, all columns, newest first. Returns every row
// by default; ?limit=/?offset=/?since= narrow it.
//
// Ordered by id (not created) so rows recognized within the same second still
// come back in a stable, insertion-order sequence — which also makes ?offset=
// paging consistent across requests.
router.get('/', async (req, res) => {
  try {
    // No cap: the point of this endpoint is the full table. The recognizer only
    // writes on song change (~300 rows/day), so the whole dump stays small for
    // years — but pass ?limit= for anything latency-sensitive.
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? null : parseInt(rawLimit, 10);
    if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }

    const rawOffset = req.query.offset;
    const offset = rawOffset === undefined ? 0 : parseInt(rawOffset, 10);
    if (!Number.isFinite(offset) || offset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

    // Optional incremental fetch: only rows newer than a timestamp. Accepts
    // anything Date can parse — including a `created` value straight out of a
    // previous response.
    //
    // Pass the Date object itself rather than a preformatted string: mysql2
    // renders it in the connection's timezone, which is the same timezone it
    // used to parse `created` into a Date on the way out. Formatting it
    // ourselves (e.g. as UTC) would silently shift the comparison by the
    // server's UTC offset, since `created` is a TIMESTAMP and MySQL compares it
    // in the session timezone.
    const where = [];
    const params = [];
    if (req.query.since !== undefined) {
      const since = new Date(req.query.since);
      if (Number.isNaN(since.getTime())) {
        return res.status(400).json({ error: 'since must be a valid date' });
      }
      where.push('created > ?');
      params.push(since);
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    // MySQL has no "no limit" keyword, so an unbounded dump uses the documented
    // max-rows sentinel rather than branching the SQL.
    const limitSql = ' LIMIT ? OFFSET ?';
    params.push(limit === null ? 18446744073709551615n : limit, offset);

    const pool = getShazamPool();
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM shazamplaying${whereSql} ORDER BY id DESC${limitSql}`,
      params
    );

    res.set('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.json(rows);
  } catch (err) {
    console.error('shazam GET error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
