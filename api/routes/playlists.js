const { Router } = require('express');
const { getPool } = require('../db');
const { fixEncodingDeep } = require('../fixEncoding');

const router = Router();

// Validates a YYYY-MM-DD date string, rejecting impossible dates like 2026-02-30.
function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Safe subset of user fields — never return password, email (unless published), etc.
const DJ_FIELDS = `
  u.ID, u.defdjname, u.deftitle, u.defsubtitle, u.defothergenre,
  u.defdesc, u.link,
  CASE WHEN u.emailpublish = 1 THEN u.email ELSE NULL END AS email
`;

// Loads the active show, its DJ, and its tracks — the shape returned by
// GET /current and pushed over the SSE stream below. Returns null when off-air.
async function fetchCurrentPlaylist(pool) {
  const [showRows] = await pool.query(
    'SELECT ID, starttime, duration, djname, title, subtitle, genre, othergenre, userID, active FROM shows WHERE active = 1 LIMIT 1'
  );
  if (!showRows.length) return null;
  const show = showRows[0];

  const [djRows] = await pool.query(
    `SELECT ${DJ_FIELDS} FROM users u WHERE u.ID = ?`,
    [show.userID]
  );

  const [tracks] = await pool.query(
    'SELECT * FROM playlist WHERE showID = ? ORDER BY orderkey',
    [show.ID]
  );

  return { show, dj: djRows[0] ?? null, tracks };
}

// GET /api/playlists/current
// Full current playlist: show info, DJ info, and all tracks.
router.get('/current', async (req, res) => {
  try {
    const payload = await fetchCurrentPlaylist(getPool());
    if (!payload) {
      return res.status(404).json({ error: 'No active show' });
    }
    res.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json(payload);
  } catch (err) {
    console.error('playlists/current error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Live now-playing stream (Server-Sent Events) ------------------------
//
// Rather than have every browser poll /current on its own timer, a single
// shared poller here queries the DB once per interval while at least one
// client is connected, and pushes the payload to all of them ONLY when the
// current show/track actually changes. N listeners therefore cost one DB
// query per tick, not N, and each browser sees the change near-instantly.
//
// The off-air payload ({ show: null, ... }) is sent so clients can render the
// "off air" state instead of treating it as an error.

const STREAM_POLL_MS = 2000;
const STREAM_HEARTBEAT_MS = 25000;

const streamClients = new Set();
let streamPollTimer = null;
let streamHeartbeatTimer = null;
let lastSignature = null;
let lastPayload = null;

// Compact fingerprint of the meaningful state, so we only broadcast on change
// (new show going active, or a newly logged track) rather than every tick.
function signatureOf(payload) {
  if (!payload || !payload.show) return 'offair';
  const tracks = payload.tracks || [];
  const last = tracks[tracks.length - 1];
  return [payload.show.ID, payload.show.active, tracks.length, last?.ID ?? 'none'].join(':');
}

function writeEvent(res, payload) {
  // Same mojibake/entity repair the REST responses get via the res.json wrapper
  // in server.js — applied here because SSE writes raw, bypassing res.json.
  res.write(`data: ${JSON.stringify(fixEncodingDeep(payload))}\n\n`);
}

function broadcast(payload) {
  for (const res of streamClients) writeEvent(res, payload);
}

async function pollAndBroadcast() {
  let payload;
  try {
    payload = await fetchCurrentPlaylist(getPool());
  } catch (err) {
    console.error('playlists/current/stream poll error', err);
    return; // keep last known state; retry next tick
  }
  const normalized = payload || { show: null, dj: null, tracks: [] };
  const sig = signatureOf(normalized);
  if (sig !== lastSignature) {
    lastSignature = sig;
    lastPayload = normalized;
    broadcast(normalized);
  }
}

function startStreamPolling() {
  if (streamPollTimer) return;
  streamPollTimer = setInterval(pollAndBroadcast, STREAM_POLL_MS);
  // Comment heartbeat keeps idle connections open through the Apache proxy.
  streamHeartbeatTimer = setInterval(() => {
    for (const res of streamClients) res.write(': ping\n\n');
  }, STREAM_HEARTBEAT_MS);
}

function stopStreamPolling() {
  clearInterval(streamPollTimer);
  clearInterval(streamHeartbeatTimer);
  streamPollTimer = null;
  streamHeartbeatTimer = null;
  lastSignature = null;
  lastPayload = null;
}

// GET /api/playlists/current/stream
// Server-Sent Events stream of the current playlist payload.
router.get('/current/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering (nginx honours this; Apache needs its own config).
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  // Suggest the browser reconnect after 5s if the stream drops.
  res.write('retry: 5000\n\n');

  streamClients.add(res);

  // Send the current state right away so a fresh client isn't blank until the
  // next change. Reuse the cached snapshot if the poller already has one.
  try {
    let payload = lastPayload;
    if (payload == null) {
      payload = (await fetchCurrentPlaylist(getPool())) || { show: null, dj: null, tracks: [] };
      lastPayload = payload;
      lastSignature = signatureOf(payload);
    }
    writeEvent(res, payload);
  } catch (err) {
    console.error('playlists/current/stream initial error', err);
    writeEvent(res, { show: null, dj: null, tracks: [] });
  }

  startStreamPolling();

  req.on('close', () => {
    streamClients.delete(res);
    if (streamClients.size === 0) stopStreamPolling();
  });
});

// Fallback window when the caller specifies neither `limit` nor `start`:
// return the last 10 days of shows rather than a fixed count.
const DEFAULT_WINDOW_DAYS = 10;
// Upper bound on an explicit `?limit=` for /recent.
const MAX_RECENT_LIMIT = 23032;
// Safety cap on the number of rows when no explicit `limit` is given.
const UNCAPPED_LIMIT = 100000;

// GET /api/playlists/recent?limit=20&offset=0&start=YYYY-MM-DD&end=YYYY-MM-DD
// List of recent shows (no tracks), newest first.
// Optional `start`/`end` (inclusive, station-local calendar dates) restrict the
// results to shows whose starttime falls within that window.
// If neither `limit` nor `start` is provided, defaults to the last 10 days.
router.get('/recent', async (req, res) => {
  try {
    const pool = getPool();
    const hasLimit = req.query.limit !== undefined;
    const limit = hasLimit ? Math.min(parseInt(req.query.limit) || 20, MAX_RECENT_LIMIT) : UNCAPPED_LIMIT;
    const offset = parseInt(req.query.offset) || 0;

    const { start, end } = req.query;
    const whereParts = [];
    const whereParams = [];

    // With no explicit count and no explicit start, fall back to the last 10
    // days so callers get a full window of shows instead of an arbitrary count.
    if (!hasLimit && start === undefined) {
      whereParts.push('s.starttime >= ?');
      whereParams.push(Math.floor(Date.now() / 1000) - DEFAULT_WINDOW_DAYS * 86400);
    }

    if (start !== undefined) {
      if (!isValidDate(start)) {
        return res.status(400).json({ error: 'start must be YYYY-MM-DD' });
      }
      whereParts.push('s.starttime >= UNIX_TIMESTAMP(?)');
      whereParams.push(`${start} 00:00:00`);
    }
    if (end !== undefined) {
      if (!isValidDate(end)) {
        return res.status(400).json({ error: 'end must be YYYY-MM-DD' });
      }
      // strictly less than the day after `end` so the whole end day is included
      whereParts.push('s.starttime < UNIX_TIMESTAMP(DATE_ADD(?, INTERVAL 1 DAY))');
      whereParams.push(`${end} 00:00:00`);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT s.ID, s.starttime, s.duration, s.djname, s.title, s.subtitle,
              s.genre, s.othergenre, s.userID,
              u.defdjname, u.link
       FROM shows s
       LEFT JOIN users u ON s.userID = u.ID
       ${whereClause}
       ORDER BY s.starttime DESC
       LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    );

    res.set('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err) {
    console.error('playlists/recent error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/playlists/:id
// Supports comma-separated IDs: /api/playlists/1,2,3
// Single ID returns {show, dj, tracks}; multiple IDs return an array of the same.
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const ids = req.params.id.split(',').map(s => parseInt(s.trim())).filter(n => Number.isInteger(n) && n > 0);
    if (!ids.length) return res.status(400).json({ error: 'Invalid id' });

    const [showRows] = await pool.query(
      `SELECT ID, starttime, duration, djname, title, subtitle, genre, othergenre, userID, active
       FROM shows WHERE ID IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    if (!showRows.length) return res.status(404).json({ error: 'Not found' });

    const showIds = showRows.map(s => s.ID);
    const djIds = [...new Set(showRows.map(s => s.userID).filter(Boolean))];

    const [allTracks] = await pool.query(
      `SELECT * FROM playlist WHERE showID IN (${showIds.map(() => '?').join(',')}) ORDER BY showID, orderkey`,
      showIds
    );

    const djMap = {};
    if (djIds.length) {
      const [djRows] = await pool.query(
        `SELECT ${DJ_FIELDS} FROM users u WHERE u.ID IN (${djIds.map(() => '?').join(',')})`,
        djIds
      );
      for (const dj of djRows) djMap[dj.ID] = dj;
    }

    const tracksByShow = {};
    for (const track of allTracks) {
      if (!tracksByShow[track.showID]) tracksByShow[track.showID] = [];
      tracksByShow[track.showID].push(track);
    }

    const result = showRows.map(show => ({
      show,
      dj: djMap[show.userID] ?? null,
      tracks: tracksByShow[show.ID] ?? [],
    }));

    res.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(ids.length === 1 ? result[0] : result);
  } catch (err) {
    console.error('playlists/:id error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/playlists/dj/:djId?limit=20&offset=0
// Supports comma-separated DJ IDs: /api/playlists/dj/1,2,3
// Returns shows for any of the given DJs, newest first.
router.get('/dj/:djId', async (req, res) => {
  try {
    const pool = getPool();
    const djIds = req.params.djId.split(',').map(s => parseInt(s.trim())).filter(n => Number.isInteger(n) && n > 0);
    if (!djIds.length) return res.status(400).json({ error: 'Invalid djId' });

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT ID, starttime, duration, djname, title, subtitle, genre, othergenre
       FROM shows WHERE userID IN (${djIds.map(() => '?').join(',')})
       ORDER BY starttime DESC LIMIT ? OFFSET ?`,
      [...djIds, limit, offset]
    );

    res.set('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err) {
    console.error('playlists/dj error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
