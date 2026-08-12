const { Router } = require('express');
const { getPool } = require('../db');

const router = Router();

// Max shows returned per page (matches the DJ show-list window in playlists.js).
const PAGE_SIZE = 100;

// FULLTEXT boolean-mode operators. We strip these out of user input so a stray
// "+", "-" or "*" can't turn into a boolean operator (or a syntax error) — every
// token is turned into a required prefix match by us, not by the user.
// eslint-disable-next-line no-useless-escape
const BOOLEAN_OPERATOR_CHARS = /[+\-><\(\)~*"@]/g;

// Turn a free-text query into a FULLTEXT boolean-mode expression: each word
// becomes a REQUIRED prefix match, e.g. "radio hea" -> "+radio* +hea*". Returns
// null when nothing usable survives (empty query, or only operator chars), so
// callers can short-circuit to an empty result instead of running a bad MATCH.
function toBooleanQuery(q) {
  if (typeof q !== 'string') return null;
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(BOOLEAN_OPERATOR_CHARS, '').trim())
    .filter(Boolean);
  if (!tokens.length) return null;
  return tokens.map((t) => `+${t}*`).join(' ');
}

// Shared show columns for both result flavours (mirrors playlists.js).
const SHOW_COLUMNS = `
  s.ID, s.starttime, s.duration, s.djname, s.title, s.subtitle,
  s.genre, s.othergenre, s.userID, u.defdjname, u.link
`;

// Parse ?limit / ?offset, clamped to sane bounds.
function parsePaging(req) {
  const limit = Math.min(parseInt(req.query.limit) || PAGE_SIZE, PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  return { limit, offset };
}

// GET /api/search/playlists?q=&limit=100&offset=0
// Distinct shows that have at least one track matching the query in any of
// artist / song / album / label / comments, newest first. `comments` is a BLOB
// (not FULLTEXT-indexable), so we match its FULLTEXT-indexed text mirror,
// `shadow_comments` (a STORED generated column; see api/search_indexes.sql).
router.get('/playlists', async (req, res) => {
  try {
    const booleanQuery = toBooleanQuery(req.query.q);
    if (!booleanQuery) return res.json([]);

    const { limit, offset } = parsePaging(req);
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT ${SHOW_COLUMNS}
       FROM shows s
       JOIN (
         SELECT DISTINCT showID FROM playlist
         WHERE MATCH(artist, song, album, label, shadow_comments)
               AGAINST (? IN BOOLEAN MODE)
       ) m ON m.showID = s.ID
       LEFT JOIN users u ON s.userID = u.ID
       ORDER BY s.starttime DESC
       LIMIT ? OFFSET ?`,
      [booleanQuery, limit, offset]
    );

    res.set('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err) {
    console.error('search/playlists error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Show-search MATCH column lists. MySQL resolves MATCH(...) against a FULLTEXT
// index covering EXACTLY those columns, so this has to track ft_shows_search in
// api/search_indexes.sql. LEGACY is the pre-othergenre index: it is only used by
// the fallback below and can be deleted once production has been re-indexed.
const SHOW_MATCH_COLUMNS = 's.title, s.subtitle, s.othergenre';
const LEGACY_SHOW_MATCH_COLUMNS = 's.title, s.subtitle';

const showSearchSql = (matchColumns) =>
  `SELECT ${SHOW_COLUMNS}
   FROM shows s
   LEFT JOIN users u ON s.userID = u.ID
   WHERE MATCH(${matchColumns}) AGAINST (? IN BOOLEAN MODE)
   ORDER BY s.starttime DESC
   LIMIT ? OFFSET ?`;

// GET /api/search/shows?q=&limit=100&offset=0
// Shows whose title, subtitle or sub-genre (othergenre) match the query, newest
// first.
router.get('/shows', async (req, res) => {
  try {
    const booleanQuery = toBooleanQuery(req.query.q);
    if (!booleanQuery) return res.json([]);

    const { limit, offset } = parsePaging(req);
    const pool = getPool();
    const params = [booleanQuery, limit, offset];

    let rows;
    try {
      [rows] = await pool.query(showSearchSql(SHOW_MATCH_COLUMNS), params);
    } catch (err) {
      // ER_FT_MATCHING_KEY_NOT_FOUND: this server still has the old
      // (title, subtitle) index, so the three-column MATCH cannot resolve. Fall
      // back to title/subtitle-only rather than 500ing the whole search page.
      if (err.errno !== 1191) throw err;
      console.warn(
        'search/shows: no FULLTEXT index covering othergenre — falling back to ' +
          'title/subtitle. Run api/search_indexes.sql to enable sub-genre search.'
      );
      [rows] = await pool.query(showSearchSql(LEGACY_SHOW_MATCH_COLUMNS), params);
    }

    res.set('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err) {
    console.error('search/shows error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
